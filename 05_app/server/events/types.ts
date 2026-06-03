/**
 * Event types for the V1.7 notification + activity network (ADR-0015).
 *
 * Every event writes an `activity_event` row (the canonical record + the
 * Follows-feed source) and fans out `notification` rows to the resolved
 * recipients (the Yours feed). The 8 types are locked in ADR-0015 §"Event types".
 */
export type EventType =
  | "mention" // @mention in a comment
  | "comment_on_your_study" // someone commented on a study you author
  | "comment_resolved" // your comment was marked resolved
  | "fork" // someone forked your study
  | "osf_push_complete" // your preregistration's OSF push completed
  | "review_request" // someone hit "Save & request review" mentioning you
  | "preregister_complete" // a study (yours or one you follow) was preregistered
  | "new_named_version"; // a study you follow saved a new named version

export const EVENT_TYPES: EventType[] = [
  "mention",
  "comment_on_your_study",
  "comment_resolved",
  "fork",
  "osf_push_complete",
  "review_request",
  "preregister_complete",
  "new_named_version",
];

/**
 * Input to `emit()`. `related` carries the denormalized "followable attributes"
 * stamped onto the activity_event so the Follows feed can join without extra
 * lookups; `data` carries event-specific extras (comment id, mentioned user
 * ids, reviewer id, divergence summary, …) used by recipient resolution + the
 * notification payload.
 */
export interface EmitInput {
  type: EventType;
  /** Who did the thing (null for system events). Never notified about their own action. */
  actorUserId?: string | null;
  workspaceId?: string | null;
  targetType: string; // 'study' | 'block_instance' | 'comment' | 'experiment_version'
  targetId: string;
  related?: {
    tagSlugs?: string[] | null;
    authorUserId?: string | null;
    frameworkId?: string | null;
    studyId?: string | null;
  };
  data?: Record<string, unknown>;
}
