import { ulid } from "ulid";

import type { JobCatalog } from "@/server/adapters/jobs";
import { jobs } from "@/server/adapters/jobs";
import { db } from "@/server/db/client";
import { notification } from "@/server/db/schema";
import { resolveRecipients } from "@/server/events/recipients";

/**
 * The `notification.fanout` job body (ADR-0015) — plain async (no Inngest SDK),
 * so it's unit-testable on a real PGlite db. Resolves the event's recipients
 * and bulk-inserts one `notification` row each, idempotent via the
 * UNIQUE(recipient_user_id, source_event_id) constraint (ON CONFLICT DO
 * NOTHING) — so a double-fire of the Inngest job is safe. Then enqueues the
 * email-digest stub (V1.8).
 */
export async function runNotificationFanout(
  data: JobCatalog["notification.fanout"],
): Promise<void> {
  const { sourceEventId, input } = data;
  const recipients = await resolveRecipients(input);
  if (recipients.length === 0) return; // Follows-only event (or actor-only)

  await db
    .insert(notification)
    .values(
      recipients.map((recipientUserId) => ({
        id: ulid(),
        recipientUserId,
        type: input.type,
        sourceEventId,
        targetType: input.targetType,
        targetId: input.targetId,
        actorUserId: input.actorUserId ?? null,
        payload: input.data ?? {},
      })),
    )
    .onConflictDoNothing({
      target: [notification.recipientUserId, notification.sourceEventId],
    });

  // Hook for the V1.8 email digest (handler is a stub today).
  await jobs.enqueue("email.digest", { sourceEventId, recipientUserIds: recipients });
}

/**
 * The `email.digest` job body — STUB until V1.8 (ADR-0015 §"Email digest").
 * Events already enqueue it so the digest is a pure feature-add later.
 */
export async function runEmailDigest(_data: JobCatalog["email.digest"]): Promise<void> {
  // no-op: V1.8 batches these per recipient into a periodic email.
}
