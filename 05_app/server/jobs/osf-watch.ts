import { and, eq, isNotNull } from "drizzle-orm";

import { registry } from "@/server/adapters/registry";
import { OsfNotConnectedError } from "@/server/adapters/registry.osf";
import { db } from "@/server/db/client";
import { emit } from "@/server/events/emit";
import { experiment, experimentVersion } from "@/server/db/schema";

/**
 * OSF watch sweep (ADR-0056 E4c). Periodically polls every pushed-but-not-yet-
 * withdrawn registration and syncs the `registrationWithdrawn` flag (+ DOI)
 * straight from OSF — so a withdrawal/retraction made on osf.io reflects across
 * the app automatically (item 3 surfaces it once the flag flips), without the
 * owner having to click "Check OSF status".
 *
 * A plain async function — no Inngest SDK — so it's unit-testable against PGlite;
 * the Inngest cron in `/api/inngest` is a thin wrapper. Best-effort per study:
 * a missing connection or a transient OSF error skips that one and never fails
 * the sweep.
 */
export async function runOsfWatch(): Promise<{ scanned: number; withdrawn: number; errors: number }> {
  const rows = await db
    .select({
      versionId: experimentVersion.id,
      url: experimentVersion.externalRegistrationUrl,
      doi: experimentVersion.externalRegistrationDoi,
      studyId: experiment.id,
      title: experiment.title,
      ownerId: experiment.ownerId,
      tenantId: experiment.tenantId,
    })
    .from(experimentVersion)
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(
      and(
        isNotNull(experimentVersion.externalRegistrationUrl),
        eq(experimentVersion.registrationWithdrawn, false),
      ),
    )
    .limit(200);

  let withdrawn = 0;
  let errors = 0;

  for (const r of rows) {
    const regId = r.url?.match(/osf\.io\/([a-z0-9]+)/i)?.[1];
    if (!regId) continue;
    try {
      // Poll under the study owner's OSF connection (the registration's account).
      const status = await registry.getRegistrationStatus(r.ownerId, regId);
      const doiChanged = status.doi && status.doi !== r.doi;
      if (status.withdrawn || doiChanged) {
        await db
          .update(experimentVersion)
          .set({
            registrationWithdrawn: status.withdrawn,
            ...(doiChanged ? { externalRegistrationDoi: status.doi } : {}),
          })
          .where(eq(experimentVersion.id, r.versionId));
      }
      if (status.withdrawn) {
        withdrawn += 1;
        // Tell the author their registration was withdrawn (system event — the
        // recipient is the author, who is not the actor). Non-critical.
        try {
          await emit({
            type: "osf_registration_withdrawn",
            actorUserId: null,
            workspaceId: r.tenantId ?? null,
            targetType: "study",
            targetId: r.studyId,
            related: { authorUserId: r.ownerId, studyId: r.studyId },
            data: { userId: r.ownerId, studyId: r.studyId, studyTitle: r.title },
          });
        } catch {
          // swallow — the flag is synced; the notification is best-effort.
        }
      }
    } catch (err) {
      // No connection (owner disconnected OSF) or a transient OSF error — skip.
      if (!(err instanceof OsfNotConnectedError)) errors += 1;
    }
  }

  return { scanned: rows.length, withdrawn, errors };
}
