/**
 * Shared feedback constants + helpers (platform-foundation PF2, ADR-0072).
 * Used by both the client widget and the server router/admin surface.
 */
export const FEEDBACK_KINDS = ["bug", "idea", "question", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "wont_fix",
  "duplicate",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_BODY_MAX = 4000;

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won’t fix",
  duplicate: "Duplicate",
};

/**
 * Deterministic R2 key for a feedback screenshot. Derived server-side from the
 * row's workspace + id so a client can never point the screenshot at an
 * arbitrary key. Personal-page feedback (no workspace) uses a flat prefix.
 */
export function feedbackScreenshotKey(workspaceId: string | null, feedbackId: string): string {
  return workspaceId ? `ws/${workspaceId}/feedback/${feedbackId}.png` : `feedback/${feedbackId}.png`;
}
