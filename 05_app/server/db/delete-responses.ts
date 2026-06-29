/**
 * Hard-delete collected participant RESPONSES for a single study, keeping the
 * study's design (experiment, versions, conditions, recruitment sessions) intact.
 * This is the researcher-controlled erasure primitive backing ADR-0082's
 * data-lifecycle commitment + the public "Security & data" page — the GDPR
 * "right to erasure" mechanism at study scope, and the building block a future
 * automated-retention job will reuse (`olderThanDays`).
 *
 * Scope is exactly the response graph (NOT the design):
 *   responseItem → response            (RESTRICT, items first)
 *   qualityFlag  → response            (RESTRICT, flags first)
 *   ai_invocation.responseId → response (CASCADE — cleans itself up)
 * The three above are the only FK referrers of `response` (see schema.ts). We
 * keep recruitmentSession rows but RECOMPUTE each one's `currentN` from the
 * surviving completed/run responses, so recruitment progress stays truthful
 * after a deletion (currentN is otherwise a +1 counter — participant.ts).
 *
 * Everything runs in ONE transaction: a half-deleted response graph in prod is
 * far worse than no delete. Tenant-scoped (the study must belong to `tenantId`)
 * and idempotent (a second run deletes nothing and returns zeros).
 */
import { and, count, eq, inArray, lt } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  qualityFlag,
  recruitmentSession,
  response,
  responseItem,
} from "@/server/db/schema";

export type DeleteResponsesResult = {
  /** Responses removed (or, in a dry run, that WOULD be removed). */
  responses: number;
  /** responseItem rows removed. */
  items: number;
  /** qualityFlag rows removed. */
  flags: number;
};

/** Thrown when the study doesn't exist in the given workspace. Callers map this
 *  to a NOT_FOUND (never leak whether a study exists in another tenant). */
export class StudyNotFoundError extends Error {
  constructor() {
    super("study_not_found");
    this.name = "StudyNotFoundError";
  }
}

export async function deleteStudyResponses(
  studyId: string,
  tenantId: string,
  opts: {
    /** Only delete responses started before now − N days (the retention knob).
     *  null/undefined = delete ALL in-scope responses (full erasure). */
    olderThanDays?: number | null;
    /** Which responses: real participants ("run"), test runs ("preview"), or
     *  everything ("all", the default for an erasure request). */
    mode?: "run" | "preview" | "all";
    /** Report counts without mutating anything. */
    dryRun?: boolean;
    /** Cutoff "now" — injectable so tests are deterministic. Defaults to new Date(). */
    now?: Date;
  } = {},
): Promise<DeleteResponsesResult> {
  const mode = opts.mode ?? "all";

  return db.transaction(async (tx) => {
    // Tenant boundary: the study must live in this workspace, or it doesn't
    // exist as far as this caller is concerned.
    const [study] = await tx
      .select({ id: experiment.id })
      .from(experiment)
      .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, tenantId)))
      .limit(1);
    if (!study) throw new StudyNotFoundError();

    const versions = await tx
      .select({ id: experimentVersion.id })
      .from(experimentVersion)
      .where(eq(experimentVersion.experimentId, studyId));
    const versionIds = versions.map((v) => v.id);
    if (versionIds.length === 0) return { responses: 0, items: 0, flags: 0 };

    // Responses in scope: this study's versions, optionally narrowed by mode and
    // an age cutoff.
    const filters = [inArray(response.experimentVersionId, versionIds)];
    if (mode !== "all") filters.push(eq(response.mode, mode));
    if (opts.olderThanDays != null) {
      const cutoff = new Date((opts.now ?? new Date()).getTime() - opts.olderThanDays * 24 * 60 * 60 * 1000);
      filters.push(lt(response.startedAt, cutoff));
    }
    const scoped = await tx
      .select({ id: response.id })
      .from(response)
      .where(and(...filters));
    const responseIds = scoped.map((r) => r.id);

    if (opts.dryRun) {
      if (responseIds.length === 0) return { responses: 0, items: 0, flags: 0 };
      const [itemCount] = await tx
        .select({ c: count() })
        .from(responseItem)
        .where(inArray(responseItem.responseId, responseIds));
      const [flagCount] = await tx
        .select({ c: count() })
        .from(qualityFlag)
        .where(inArray(qualityFlag.responseId, responseIds));
      return { responses: responseIds.length, items: itemCount?.c ?? 0, flags: flagCount?.c ?? 0 };
    }

    let items = 0;
    let flags = 0;
    if (responseIds.length > 0) {
      // Children before parents (both RESTRICT). ai_invocation cascades.
      const delItems = await tx
        .delete(responseItem)
        .where(inArray(responseItem.responseId, responseIds))
        .returning({ id: responseItem.id });
      items = delItems.length;
      const delFlags = await tx
        .delete(qualityFlag)
        .where(inArray(qualityFlag.responseId, responseIds))
        .returning({ id: qualityFlag.id });
      flags = delFlags.length;
      await tx.delete(response).where(inArray(response.id, responseIds));
    }

    // Recompute every session's currentN from the surviving completed/run
    // responses so recruitment progress can't read higher than reality. Cheap
    // (one COUNT per session) and correct whether or not we touched that session.
    const sessions = await tx
      .select({ id: recruitmentSession.id })
      .from(recruitmentSession)
      .where(inArray(recruitmentSession.experimentVersionId, versionIds));
    for (const s of sessions) {
      const [c] = await tx
        .select({ c: count() })
        .from(response)
        .where(
          and(
            eq(response.recruitmentSessionId, s.id),
            eq(response.status, "completed"),
            eq(response.mode, "run"),
          ),
        );
      await tx.update(recruitmentSession).set({ currentN: c?.c ?? 0 }).where(eq(recruitmentSession.id, s.id));
    }

    return { responses: responseIds.length, items, flags };
  });
}
