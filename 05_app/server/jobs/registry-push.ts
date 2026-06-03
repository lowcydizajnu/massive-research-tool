import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import type { JobCatalog } from "@/server/adapters/jobs";
import { registry } from "@/server/adapters/registry";
import { OsfNotConnectedError } from "@/server/adapters/registry.osf";
import type { RegistrationPayload } from "@/server/adapters/registry";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  registry as registryTable,
  registryPush,
} from "@/server/db/schema";

/**
 * The body of the `registry.push` background job (ADR-0005). Kept as a plain
 * async function — no Inngest SDK here — so it's unit-testable against a real
 * PGlite db; the Inngest function in `jobs.inngest.ts` is a thin wrapper.
 *
 * It records a `registry_push` attempt, calls the registry adapter (which owns
 * all OSF specifics + token decryption), and writes the outcome back to both
 * the attempt row and the experiment_version push-status fields. A missing
 * connection is terminal (`no_credentials`, no retry); other failures rethrow
 * so the job runner can retry transient errors.
 */
export async function runRegistryPush(data: JobCatalog["registry.push"]): Promise<void> {
  const [version] = await db
    .select()
    .from(experimentVersion)
    .where(eq(experimentVersion.id, data.experimentVersionId))
    .limit(1);
  if (!version) return; // version deleted before the job ran — nothing to do

  const [reg] = await db
    .select({ id: registryTable.id })
    .from(registryTable)
    .where(eq(registryTable.key, data.registryKey))
    .limit(1);
  if (!reg) {
    await db
      .update(experimentVersion)
      .set({
        registryPushStatus: "failed",
        registryPushLastError: `Registry not configured: ${data.registryKey}`,
      })
      .where(eq(experimentVersion.id, version.id));
    return;
  }

  const [exp] = await db
    .select({ title: experiment.title })
    .from(experiment)
    .where(eq(experiment.id, version.experimentId))
    .limit(1);

  const payload: RegistrationPayload = {
    experimentVersionId: version.id,
    title: exp?.title ?? version.name ?? "Untitled study",
    snapshot: {
      definition: version.definitionSnapshot,
      locks: version.moduleVersionLocks,
      theme: version.themeSnapshot ?? null,
    },
    templateFields: {},
  };

  const pushId = ulid();
  await db.insert(registryPush).values({
    id: pushId,
    experimentVersionId: version.id,
    registryId: reg.id,
    status: "pending",
    requestPayload: payload,
  });

  try {
    const result =
      data.isAmendment && data.priorDoi
        ? await registry.pushAmendment(data.userId, payload, data.priorDoi)
        : await registry.pushRegistration(data.userId, payload);

    await db
      .update(registryPush)
      .set({
        status: "pushed",
        pushedUrl: result.url,
        pushedDoi: result.doi,
        responsePayload: result,
        completedAt: new Date(),
      })
      .where(eq(registryPush.id, pushId));
    await db
      .update(experimentVersion)
      .set({
        registryPushStatus: "pushed",
        externalRegistrationUrl: result.url,
        externalRegistrationDoi: result.doi,
        registryPushLastError: null,
      })
      .where(eq(experimentVersion.id, version.id));
  } catch (err) {
    const notConnected = err instanceof OsfNotConnectedError;
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(registryPush)
      .set({ status: "failed", errorText: message, completedAt: new Date() })
      .where(eq(registryPush.id, pushId));
    await db
      .update(experimentVersion)
      .set({
        registryPushStatus: notConnected ? "no_credentials" : "failed",
        registryPushLastError: message,
        registryPushAttempts: (version.registryPushAttempts ?? 0) + 1,
      })
      .where(eq(experimentVersion.id, version.id));
    // No connection is terminal; let other (transient) failures retry.
    if (!notConnected) throw err;
  }
}
