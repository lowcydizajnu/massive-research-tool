import { describe, expect, it } from "vitest";

import {
  allRequirementsMet,
  anyInteractionTotal,
  EMPTY_TALLY,
  requirementEmoji,
  requirementLabel,
  requirementMet,
  requirementProgress,
  type InteractionRequirement,
  type InteractionTally,
} from "@/lib/whiteboard/interaction-requirements";

const tally = (o: Partial<InteractionTally>): InteractionTally => ({ ...EMPTY_TALLY, ...o, reactions: o.reactions ?? {} });

describe("interaction requirements (ADR-0087)", () => {
  it("progress + met per type", () => {
    const t = tally({ likes: 2, dislikes: 1, comments: 1, reports: 0, shares: 3, reactions: { wow: 2, like: 2 } });
    expect(requirementProgress({ id: "1", type: "like", count: 1 }, t)).toBe(2);
    expect(requirementProgress({ id: "2", type: "comment", count: 1 }, t)).toBe(1);
    expect(requirementProgress({ id: "3", type: "share", count: 1 }, t)).toBe(3);
    expect(requirementProgress({ id: "4", type: "report", count: 1 }, t)).toBe(0);
    expect(requirementProgress({ id: "5", type: "likeOrDislike", count: 1 }, t)).toBe(3);
    expect(requirementProgress({ id: "6", type: "reaction", count: 1, reactionKey: "wow" }, t)).toBe(2);
    expect(requirementMet({ id: "7", type: "report", count: 1 }, t)).toBe(false);
    expect(requirementMet({ id: "8", type: "share", count: 3 }, t)).toBe(true);
  });

  it("'any interaction' sums reactions + comments + shares + reports", () => {
    // keyed reactions present → count them (not the simple like/dislike scalars)
    expect(anyInteractionTotal(tally({ reactions: { like: 1, love: 1 }, comments: 1, shares: 1 }))).toBe(4);
    // simple like/dislike (no keyed reactions) still count
    expect(anyInteractionTotal(tally({ likes: 1, dislikes: 1, reports: 1 }))).toBe(3);
  });

  it("allRequirementsMet is AND; empty ⇒ no gate", () => {
    const reqs: InteractionRequirement[] = [
      { id: "a", type: "like", count: 1 },
      { id: "b", type: "comment", count: 2 },
    ];
    expect(allRequirementsMet(reqs, tally({ likes: 1, comments: 1 }))).toBe(false);
    expect(allRequirementsMet(reqs, tally({ likes: 1, comments: 2 }))).toBe(true);
    expect(allRequirementsMet([], EMPTY_TALLY)).toBe(true);
  });

  it("labels are researcher-native", () => {
    expect(requirementLabel({ id: "1", type: "likeOrDislike", count: 1 })).toBe("Like or Dislike");
    expect(requirementLabel({ id: "2", type: "any", count: 1 })).toBe("Any interaction");
    expect(requirementLabel({ id: "3", type: "reaction", count: 1, reactionKey: "wow" })).toBe("React Wow");
  });

  it("labels are translatable via uiCopy overrides; blank falls back (ADR-0087 am.)", () => {
    const copy = { reqLike: "Polub", reqComment: "  ", reqReact: "Zareaguj" };
    expect(requirementLabel({ id: "1", type: "like", count: 1 }, copy)).toBe("Polub");
    // Blank/whitespace override → default.
    expect(requirementLabel({ id: "2", type: "comment", count: 1 }, copy)).toBe("Comment");
    // Reaction verb is overridden; the reaction name is appended.
    expect(requirementLabel({ id: "3", type: "reaction", count: 1, reactionKey: "wow" }, copy)).toBe("Zareaguj Wow");
  });

  it("each requirement type has a chip emoji", () => {
    for (const type of ["like", "comment", "report", "share", "any", "likeOrDislike", "reaction"] as const) {
      expect(requirementEmoji({ id: type, type, count: 1 })).toBeTruthy();
    }
  });
});
