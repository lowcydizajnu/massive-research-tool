import { describe, expect, it } from "vitest";

import { changelogBetween, initialVersionSummary } from "@/server/modules/changelog";

/** Minimal snapshot factory matching the definition_snapshot shape (ADR-0012). */
const snap = (
  blocks: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): unknown => ({ blocks, ...extra });

const likert = (over: Record<string, unknown> = {}) => ({
  instanceId: "b1",
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  config: { prompt: "How accurate is this post?", required: true },
  ...over,
});
const attention = {
  instanceId: "b2",
  source: "core",
  key: "attention-check",
  version: "1.0.0",
  config: { prompt: "Select 'Agree'", options: ["Agree", "Disagree"], correctAnswer: "Agree", required: true },
};

describe("changelogBetween (ADR-0033)", () => {
  it("reports added and removed blocks by display name", () => {
    const lines = changelogBetween(snap([likert()]), snap([likert(), attention]));
    expect(lines.some((l) => l.startsWith("＋ Added") && l.includes("Attention"))).toBe(true);
    const lines2 = changelogBetween(snap([likert(), attention]), snap([likert()]));
    expect(lines2.some((l) => l.startsWith("－ Removed") && l.includes("Attention"))).toBe(true);
  });

  it("reports config rewording on a changed block (researcher title preferred)", () => {
    const lines = changelogBetween(
      snap([likert({ title: "Accuracy rating" })]),
      snap([likert({ title: "Accuracy rating", config: { prompt: "How truthful is this post?", required: true } })]),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('～ "Accuracy rating"');
    expect(lines[0].toLowerCase()).toContain("prompt");
  });

  it("reports group membership moves, reorders, and group lifecycle", () => {
    const a = likert({ instanceId: "a" });
    const b = likert({ instanceId: "b" });
    // move into a group + the group appears
    const lines = changelogBetween(
      snap([a, b]),
      snap([{ ...a, groupId: "g1" }, { ...b, groupId: "g1" }], { groups: [{ id: "g1", title: "Screen 1" }] }),
    );
    expect(lines.some((l) => l.includes("moved into a group screen"))).toBe(true);
    expect(lines.some((l) => l.includes('＋ Group screen "Screen 1"'))).toBe(true);
    // pure reorder
    const lines2 = changelogBetween(snap([a, b]), snap([b, a]));
    expect(lines2).toEqual(["～ Blocks reordered"]);
  });

  it("reports overview + theme changes; silent when nothing changed", () => {
    const before = snap([likert()], {
      overview: { abstract: "", hypotheses: ["H1"], sections: [], divergenceNotes: "" },
      theme: { presetKey: "academic" },
    });
    const after = snap([likert()], {
      overview: { abstract: "New abstract", hypotheses: ["H1", "H2"], sections: [], divergenceNotes: "" },
      theme: { presetKey: "facebook" },
    });
    const lines = changelogBetween(before, after);
    expect(lines).toContain("～ Abstract updated");
    expect(lines).toContain("＋ 1 hypothesis");
    expect(lines).toContain("～ Design preset: academic → facebook");
    expect(changelogBetween(before, before)).toEqual([]);
  });

  it("describes the first frozen version instead of diffing", () => {
    expect(initialVersionSummary(snap([likert(), attention]))).toEqual(["Initial version — 2 blocks"]);
  });
});
