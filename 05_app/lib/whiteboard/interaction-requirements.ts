import type { ReactionKey } from "@/lib/themes/themes";

/**
 * Screen-level interaction gating for social-post groups (ADR-0087). Pure +
 * client-safe (no server imports) so the Builder config UI, the take-runtime
 * aggregator, and unit tests all share ONE definition of what a requirement is
 * and when it's met. Requirements live on the `StudyGroup` in the snapshot; the
 * runtime tallies interactions across every social post on the screen and gates
 * the screen's Continue until all requirements are met (or a time limit elapses).
 */

/** What a single requirement counts. `reaction` pairs with `reactionKey`. */
export type InteractionRequirementType =
  | "like" // 👍 likes (simple Like or the 👍 reaction)
  | "comment" // 💬 comments (incl. replies)
  | "report" // ► reports / flags
  | "share" // ↪ shares
  | "any" // ⭐ any interaction — every reaction + comment + share + report
  | "likeOrDislike" // 👍👎 combined like + dislike tally
  | "reaction"; // a specific one of the 7 reactions (reactionKey)

export type InteractionRequirement = {
  id: string;
  type: InteractionRequirementType;
  /** How many are required (≥1). */
  count: number;
  /** Only for `type: "reaction"` — which reaction the participant must give. */
  reactionKey?: ReactionKey;
};

/**
 * Live tally of interactions on a screen, summed across its social posts. The
 * runtime aggregator produces this; requirement evaluation reads from it. Kept
 * flat + additive so a new interaction kind is a one-line change.
 */
export type InteractionTally = {
  likes: number;
  dislikes: number;
  comments: number;
  reports: number;
  shares: number;
  /** Per-reaction counts (👍 like counts toward both `likes` and here). */
  reactions: Partial<Record<ReactionKey, number>>;
};

export const EMPTY_TALLY: InteractionTally = {
  likes: 0,
  dislikes: 0,
  comments: 0,
  reports: 0,
  shares: 0,
  reactions: {},
};

/** Every reaction + comment + share + report — the "any interaction" total. */
export function anyInteractionTotal(t: InteractionTally): number {
  const reactionSum = Object.values(t.reactions).reduce((a, n) => a + (n ?? 0), 0);
  // `likes`/`dislikes` are reaction-shaped; the reaction map already carries the
  // keyed reactions, so count non-keyed simple like/dislike beyond the map only
  // when the map is empty (simple Like/Dislike controls don't populate `reactions`).
  const simple = reactionSum === 0 ? t.likes + t.dislikes : 0;
  return reactionSum + simple + t.comments + t.shares + t.reports;
}

/** How many of `req` the tally currently satisfies (for the `n/N` chip). */
export function requirementProgress(req: InteractionRequirement, t: InteractionTally): number {
  switch (req.type) {
    case "like":
      return t.likes;
    case "comment":
      return t.comments;
    case "report":
      return t.reports;
    case "share":
      return t.shares;
    case "likeOrDislike":
      return t.likes + t.dislikes;
    case "any":
      return anyInteractionTotal(t);
    case "reaction":
      return req.reactionKey ? (t.reactions[req.reactionKey] ?? 0) : 0;
    default:
      return 0;
  }
}

/** A requirement is met once progress reaches its target. */
export function requirementMet(req: InteractionRequirement, t: InteractionTally): boolean {
  return requirementProgress(req, t) >= Math.max(1, req.count);
}

/** Every requirement met? (AND semantics — ADR-0087.) Empty ⇒ true (no gate). */
export function allRequirementsMet(reqs: InteractionRequirement[], t: InteractionTally): boolean {
  return reqs.every((r) => requirementMet(r, t));
}

const REACTION_LABEL: Record<ReactionKey, string> = {
  like: "Like",
  love: "Love",
  care: "Care",
  haha: "Haha",
  wow: "Wow",
  sad: "Sad",
  angry: "Angry",
};

/** Researcher-native chip/label text (design-rules vocabulary — never dev keys). */
export function requirementLabel(req: InteractionRequirement): string {
  switch (req.type) {
    case "like":
      return "Like";
    case "comment":
      return "Comment";
    case "report":
      return "Report";
    case "share":
      return "Share";
    case "likeOrDislike":
      return "Like or Dislike";
    case "any":
      return "Any interaction";
    case "reaction":
      return req.reactionKey ? `React ${REACTION_LABEL[req.reactionKey]}` : "React";
    default:
      return "Interaction";
  }
}
