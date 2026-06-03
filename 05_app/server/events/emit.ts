import { ulid } from "ulid";

import { jobs } from "@/server/adapters/jobs";
import { db } from "@/server/db/client";
import { activityEvent } from "@/server/db/schema";

import type { EmitInput } from "./types";

/**
 * The single entry point for the V1.7 event network (ADR-0015). For every event:
 *
 * 1. Write the `activity_event` row synchronously — it's the canonical record
 *    and the Follows-feed source (query-time read against follow).
 * 2. Enqueue the `notification.fanout` job — write-time fan-out of `notification`
 *    rows to the resolved recipients (the Yours feed), idempotent via the
 *    UNIQUE(recipient_user_id, source_event_id) constraint.
 *
 * Returns the source event id (the activity_event ULID) — also the idempotency
 * anchor every notification row references.
 */
export async function emit(input: EmitInput): Promise<{ sourceEventId: string }> {
  const sourceEventId = ulid();

  await db.insert(activityEvent).values({
    id: sourceEventId,
    type: input.type,
    actorUserId: input.actorUserId ?? null,
    workspaceId: input.workspaceId ?? null,
    targetType: input.targetType,
    targetId: input.targetId,
    relatedTagSlugs: input.related?.tagSlugs ?? null,
    relatedAuthorUserId: input.related?.authorUserId ?? null,
    relatedFrameworkId: input.related?.frameworkId ?? null,
    relatedStudyId: input.related?.studyId ?? null,
    payload: input.data ?? {},
  });

  await jobs.enqueue("notification.fanout", { sourceEventId, input });

  return { sourceEventId };
}
