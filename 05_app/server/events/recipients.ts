import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { comment, experiment } from "@/server/db/schema";

import type { EmitInput } from "./types";

/**
 * Per-type recipient resolution (ADR-0015). Returns the user ids that get a
 * Yours-feed `notification` row for this event. The actor is always excluded
 * (you're never notified about your own action). Follows-only events
 * (preregister_complete / new_named_version) return [] — they're surfaced via
 * the Follows feed (activity_event × follow), not notification rows.
 */
export async function resolveRecipients(input: EmitInput): Promise<string[]> {
  const actor = input.actorUserId ?? null;
  const data = input.data ?? {};
  let recipients: string[] = [];

  switch (input.type) {
    case "mention":
      // Mentioned users were resolved against workspace members at comment-write time.
      recipients = asIds(data.mentionedUserIds);
      break;

    case "comment_on_your_study": {
      // The study author + anyone who commented earlier on the same target.
      const authorId = await studyAuthor(input.related?.studyId ?? input.targetId);
      const earlier = await earlierCommenters(input.targetType, input.targetId);
      recipients = [authorId, ...earlier].filter((x): x is string => !!x);
      break;
    }

    case "comment_resolved":
      // The author of the comment that was resolved.
      recipients = asIds(data.commentAuthorId);
      break;

    case "fork":
      // The author of the study that was forked.
      recipients = asIds(input.related?.authorUserId ?? data.forkedAuthorId);
      break;

    case "review_request":
      // The reviewer named in "Save & request review".
      recipients = asIds(data.reviewerUserId);
      break;

    case "osf_push_complete":
      // The researcher whose push completed.
      recipients = asIds(data.userId ?? input.related?.authorUserId);
      break;

    case "proposal_open":
      // The upstream study's author receives the proposal (ADR-0036).
      recipients = asIds(data.targetAuthorId ?? input.related?.authorUserId);
      break;

    case "proposal_decided":
      // The proposer learns the outcome.
      recipients = asIds(data.proposerUserId);
      break;

    case "preregister_complete":
    case "new_named_version":
      recipients = []; // Follows-only
      break;
  }

  // Exclude the actor + dedupe.
  return [...new Set(recipients.filter((id) => id && id !== actor))];
}

function asIds(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

async function studyAuthor(studyId: string): Promise<string | null> {
  const [row] = await db
    .select({ ownerId: experiment.ownerId })
    .from(experiment)
    .where(eq(experiment.id, studyId))
    .limit(1);
  return row?.ownerId ?? null;
}

async function earlierCommenters(targetType: string, targetId: string): Promise<string[]> {
  const rows = await db
    .select({ authorUserId: comment.authorUserId })
    .from(comment)
    .where(and(eq(comment.targetType, targetType), eq(comment.targetId, targetId)));
  return [...new Set(rows.map((r) => r.authorUserId))];
}
