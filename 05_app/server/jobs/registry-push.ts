import { and, desc, eq, ne } from "drizzle-orm";
import { ulid } from "ulid";

import type { JobCatalog } from "@/server/adapters/jobs";
import { registry } from "@/server/adapters/registry";
import { OsfNotConnectedError, fetchSchemaBlocks } from "@/server/adapters/registry.osf";
import type { RegistrationPayload } from "@/server/adapters/registry";
import { db } from "@/server/db/client";
import { changelogBetween } from "@/server/modules/changelog";
import { readOsfQuestions, toRegistrationResponses } from "@/server/modules/osf-schema";
import { preregTemplate } from "@/lib/prereg-templates";
import { planTemplateKey, readOverview } from "@/server/modules/blocks";
import { buildOpenEndedBody, buildRecipeResponses, RECIPE_SCHEMA_NAME } from "@/server/modules/osf-recipe";
import { emit } from "@/server/events/emit";
import {
  experiment,
  experimentVersion,
  member,
  registry as registryTable,
  registryPush,
  user,
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
    .select({
      title: experiment.title,
      description: experiment.description,
      tags: experiment.tags,
      tenantId: experiment.tenantId,
      ownerId: experiment.ownerId,
      forkOfExperimentId: experiment.forkOfExperimentId,
    })
    .from(experiment)
    .where(eq(experiment.id, version.experimentId))
    .limit(1);

  // Which OSF registration schema to file under is now the researcher's explicit
  // choice: `overview.templateKey` (ADR-0101), picked on the Overview stage. This
  // supersedes the old implicit rule (any declared replication intent ⇒ Recipe),
  // which chose invisibly and silently changed if the intent was cleared. Both
  // exposed schemas have every field optional, so partial filing stays safe.
  // Back-compat: a plan with no explicit templateKey resolves via planTemplateKey
  // to exactly the old rule, so nothing already out there re-files elsewhere.
  // N-way, not a boolean (ADR-0107 D7). Five templates now, three of which ask
  // OSF's own questions and carry the researcher's answers to them.
  const overview = readOverview(version.definitionSnapshot);
  const template = preregTemplate(planTemplateKey(overview));
  const isRecipe = template.key === "replication-recipe";

  /**
   * The researcher's answers to OSF's own questions, filtered against a LIVE
   * schema read (ADR-0107 D3).
   *
   * Live, not from the snapshot, because OSF revises schemas in place and an
   * unknown key is a hard 400 that kills the whole filing — while a MISSING key
   * is silence. So we would rather drop an answer whose question OSF has retired
   * than lose the registration.
   *
   * Not gated on completeness: the owner chose warn-and-proceed (2026-07-17).
   * The Preregister warning names what is blank; the researcher decides.
   */
  let templateResponses: Record<string, string | string[]> | null = null;
  if (template.asksOsfQuestions) {
    const blocks = await fetchSchemaBlocks(template.schemaId);
    templateResponses = toRegistrationResponses(readOsfQuestions(blocks), overview.templateAnswers);
  }
  let sourceTitle: string | null = null;
  if (exp?.forkOfExperimentId) {
    const [src] = await db
      .select({ title: experiment.title })
      .from(experiment)
      .where(eq(experiment.id, exp.forkOfExperimentId))
      .limit(1);
    sourceTitle = src?.title ?? null;
  }

  // Amendment detection: a previous successful push for the SAME study means
  // this registration supersedes it — same OSF project node, changelog header.
  const [prior] = await db
    .select({
      id: experimentVersion.id,
      snapshot: experimentVersion.definitionSnapshot,
      url: experimentVersion.externalRegistrationUrl,
      doi: experimentVersion.externalRegistrationDoi,
    })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, version.experimentId),
        eq(experimentVersion.registryPushStatus, "pushed"),
        ne(experimentVersion.id, version.id),
      ),
    )
    .orderBy(desc(experimentVersion.createdAt))
    .limit(1);

  let amendmentHeader: string | undefined;
  let existingNodeId: string | null = null;
  if (prior) {
    const changes = changelogBetween(prior.snapshot, version.definitionSnapshot);
    const changeBlock = changes.length
      ? ["", "Changes since that registration:", ...changes.map((l) => "- " + l)].join("\n")
      : "";
    // Prefer the researcher's STATED reason (studies.amend → change_summary, ADR-0004)
    // over the auto-diff; fall back to the diff when there's no stated reason.
    const stated = version.changeSummary?.trim() ? `\n\nReason: ${version.changeSummary.trim()}` : "";
    amendmentHeader =
      "AMENDMENT - supersedes the registration at " +
      (prior.url ?? prior.doi ?? "(previous version)") +
      "." +
      stated +
      changeBlock;
    const [priorPush] = await db
      .select({ responsePayload: registryPush.responsePayload })
      .from(registryPush)
      .where(and(eq(registryPush.experimentVersionId, prior.id), eq(registryPush.status, "pushed")))
      .orderBy(desc(registryPush.createdAt))
      .limit(1);
    existingNodeId =
      ((priorPush?.responsePayload as { nodeId?: string } | null)?.nodeId as string | undefined) ?? null;
  }

  // Human-readable design for the Open-Ended summary + node enrichment (audit
  // step 3) — so OSF shows real app content, not just the title + a JSON dump.
  // The recipe path builds its own structured responses, so this feeds only the
  // default Open-Ended push.
  const humanReadableBody = buildOpenEndedBody(version.definitionSnapshot);
  const appBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const permalink = appBase ? `${appBase}/studies/${version.experimentId}` : undefined;

  // Co-authors (ADR-0005 am. 4): active workspace members other than the pusher
  // (who is already the node's creator/admin via their OSF token), pushed to the
  // OSF node as unregistered contributors. Only takes effect on a NEW node
  // (the adapter skips contributors when reusing a node for an amendment).
  const contributors =
    exp?.tenantId
      ? (
          await db
            .select({ name: user.displayName, email: user.email })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.workspaceId, exp.tenantId),
                eq(member.status, "active"),
                ne(member.userId, data.userId),
              ),
            )
        ).map((m) => ({ fullName: m.name || m.email || "Researcher", email: m.email ?? null }))
      : [];

  const payload: RegistrationPayload = {
    experimentVersionId: version.id,
    title: exp?.title ?? version.name ?? "Untitled study",
    snapshot: {
      definition: version.definitionSnapshot,
      locks: version.moduleVersionLocks,
      theme: version.themeSnapshot ?? null,
    },
    templateFields: {},
    // Always send the schema NAME — selection is by name (filter[name] 400s) and
    // every template now declares its own, rather than the env default silently
    // redirecting every non-Recipe push on the deployment.
    schemaName: template.schemaName,
    ...(templateResponses
      ? { registrationResponses: templateResponses }
      : isRecipe
        ? {
            registrationResponses: buildRecipeResponses({
              snapshot: version.definitionSnapshot,
              sourceTitle,
              amendmentHeader,
            }),
          }
        : { humanReadableBody }),
    ...(exp?.description?.trim() ? { description: exp.description.trim() } : {}),
    ...(exp?.tags && exp.tags.length ? { tags: exp.tags } : {}),
    ...(permalink ? { permalink } : {}),
    ...(contributors.length ? { contributors } : {}),
    ...(amendmentHeader ? { summaryPrefix: amendmentHeader } : {}),
    ...(overview.osfSubjectIds.length ? { subjectIds: overview.osfSubjectIds } : {}),
    existingNodeId,
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
    const result = prior
      ? await registry.pushAmendment(data.userId, payload, prior.doi ?? "")
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

    // ADR-0015: notify the researcher their OSF push finished (with the DOI).
    // Emitted as a SYSTEM event (actorUserId: null) so the initiator — who is
    // the recipient (resolveRecipients → data.userId) — isn't excluded as the
    // actor. Best-effort: a notification failure must not fail the push job.
    try {
      await emit({
        type: "osf_push_complete",
        actorUserId: null,
        workspaceId: exp?.tenantId ?? null,
        targetType: "study",
        targetId: version.experimentId,
        related: { authorUserId: exp?.ownerId ?? data.userId, studyId: version.experimentId },
        data: {
          userId: data.userId,
          studyId: version.experimentId,
          studyTitle: exp?.title ?? version.name ?? "your study",
          doi: result.doi,
          url: result.url,
        },
      });
    } catch {
      // swallow — the push itself succeeded; the notification is non-critical.
    }
  } catch (err) {
    const notConnected = err instanceof OsfNotConnectedError;
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(registryPush)
      .set({ status: "failed", errorText: message, completedAt: new Date() })
      .where(eq(registryPush.id, pushId));
    // Never downgrade an already-pushed version: a slower, failing concurrent
    // job (e.g. a duplicate retry) must not clobber a successful push.
    await db
      .update(experimentVersion)
      .set({
        registryPushStatus: notConnected ? "no_credentials" : "failed",
        registryPushLastError: message,
        registryPushAttempts: (version.registryPushAttempts ?? 0) + 1,
      })
      .where(
        and(
          eq(experimentVersion.id, version.id),
          ne(experimentVersion.registryPushStatus, "pushed"),
        ),
      );
    // No connection is terminal; let other (transient) failures retry.
    if (!notConnected) throw err;
  }
}
