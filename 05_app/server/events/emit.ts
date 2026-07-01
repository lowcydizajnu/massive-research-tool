import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { activityEvent } from "@/server/db/schema";
import { runNotificationFanout } from "@/server/jobs/notification-fanout";

import type { EmitInput } from "./types";

/**
 * The single entry point for the V1.7 event network (ADR-0015). For every event:
 *
 * 1. Write the `activity_event` row synchronously — it's the canonical record
 *    and the Follows-feed source (query-time read against follow).
 * 2. Fan out `notification` rows to the resolved recipients (the Yours feed)
 *    INLINE — idempotent via the UNIQUE(recipient_user_id, source_event_id)
 *    constraint. This used to be an Inngest-queued job, but that queue silently
 *    stopped running in production (the app sync lapsed after a deploy), which
 *    froze the Yours feed while activity kept being logged. Fan-out is a couple
 *    of small inserts, so running it inline removes the fragile queue dependency
 *    for this critical path. Best-effort: a fan-out failure must NEVER fail the
 *    action that triggered the event (the activity_event is already committed).
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

  try {
    await runNotificationFanout({ sourceEventId, input });
  } catch (err) {
    // Never break the triggering action; the event is logged and the feed can
    // be backfilled from activity_event if a fan-out ever fails.
    console.error("[emit] inline notification fan-out failed", sourceEventId, err);
  }

  return { sourceEventId };
}
