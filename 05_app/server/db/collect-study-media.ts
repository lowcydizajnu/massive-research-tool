/**
 * Collect the R2 object keys of PARTICIPANT-contributed files for a study, so a
 * study delete (ADR-0083) can erase them from storage too — the DB rows go in
 * the delete transaction, but R2 objects must be deleted separately, and the
 * keys must be read BEFORE the rows vanish (response_items + ai_invocation
 * payloads cascade away when the study's responses are deleted).
 *
 * SCOPE = participant data only (the GDPR-critical, per-response, NEVER-shared
 * keys):
 *   - `resp/<responseId>/…` — signature / file-upload / audio-record /
 *     video-record answers (stored as a bare `r2Key` in response_item.answer).
 *   - `ai_invocation_payload.r2Key` — AI outputs derived from this study's
 *     responses (or invoked with this studyId).
 *
 * Researcher-uploaded STIMULI (`ws/<workspaceId>/…` image/audio in block
 * configs) are deliberately NOT collected here: those keys are content-hashed /
 * reused across studies (e.g. audio-stimulus, materials library), so deleting
 * one study's copy could break another study. Stimulus cleanup needs a
 * cross-study reuse guard — a documented follow-up (ADR-0083). Participant files
 * are the erasure that matters and are always safe to delete.
 */
import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  aiInvocation,
  aiInvocationPayload,
  experimentVersion,
  response,
  responseItem,
} from "@/server/db/schema";

/** Read every participant R2 key tied to the study. Pure read; call BEFORE the
 *  delete transaction. Deduped. */
export async function collectStudyParticipantMediaKeys(studyId: string): Promise<string[]> {
  const versions = await db
    .select({ id: experimentVersion.id })
    .from(experimentVersion)
    .where(eq(experimentVersion.experimentId, studyId));
  const versionIds = versions.map((v) => v.id);

  const keys = new Set<string>();

  if (versionIds.length > 0) {
    const resps = await db
      .select({ id: response.id })
      .from(response)
      .where(inArray(response.experimentVersionId, versionIds));
    const responseIds = resps.map((r) => r.id);

    if (responseIds.length > 0) {
      // Answer media (signature / file-upload / audio-record / video-record):
      // answer is jsonb carrying a bare `r2Key` string.
      const items = await db
        .select({ answer: responseItem.answer })
        .from(responseItem)
        .where(inArray(responseItem.responseId, responseIds));
      for (const it of items) {
        const a = it.answer as { r2Key?: unknown } | null;
        if (a && typeof a.r2Key === "string" && a.r2Key) keys.add(a.r2Key);
      }
    }

    // AI payload sidecars: invoked with this studyId, OR tied to a response of
    // this study. (ai_invocation.studyId is set-null and .responseId cascades on
    // delete, so collect before the transaction.)
    const aiRows = await db
      .select({ r2Key: aiInvocationPayload.r2Key })
      .from(aiInvocationPayload)
      .innerJoin(aiInvocation, eq(aiInvocationPayload.invocationId, aiInvocation.id))
      .where(
        responseIds.length > 0
          ? or(eq(aiInvocation.studyId, studyId), inArray(aiInvocation.responseId, responseIds))
          : eq(aiInvocation.studyId, studyId),
      );
    for (const r of aiRows) if (r.r2Key) keys.add(r.r2Key);
  } else {
    // No versions ⇒ no responses, but a studyId-scoped AI invocation could still
    // exist (rare). Collect those payloads.
    const aiRows = await db
      .select({ r2Key: aiInvocationPayload.r2Key })
      .from(aiInvocationPayload)
      .innerJoin(aiInvocation, eq(aiInvocationPayload.invocationId, aiInvocation.id))
      .where(eq(aiInvocation.studyId, studyId));
    for (const r of aiRows) if (r.r2Key) keys.add(r.r2Key);
  }

  return [...keys];
}
