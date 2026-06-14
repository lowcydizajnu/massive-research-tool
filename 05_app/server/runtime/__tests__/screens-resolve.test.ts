import { describe, expect, it } from "vitest";

import { pathMayExtend, resolveVisibleScreens } from "@/server/runtime/participant";

const block = (instanceId: string, extra: Record<string, unknown> = {}) => ({
  instanceId,
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  config: {},
  ...extra,
});

const snap = (blocks: unknown[], groups: unknown[] = []) => ({ blocks, groups });

describe("resolveVisibleScreens (ADR-0028)", () => {
  it("no groups → one screen per visible block (generalizes resolveVisibleBlocks)", () => {
    const s = resolveVisibleScreens(snap([block("a"), block("b")]), "control", {});
    expect(s.map((x) => x.kind)).toEqual(["single", "single"]);
    expect(s.flatMap((x) => x.blocks.map((b) => b.instanceId))).toEqual(["a", "b"]);
  });

  it("contiguous group → one screen with all members", () => {
    const s = resolveVisibleScreens(
      snap([block("a", { groupId: "g" }), block("b", { groupId: "g" })], [{ id: "g", title: "T" }]),
      "control",
      {},
    );
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe("group");
    expect(s[0].blocks).toHaveLength(2);
  });

  it("group showIf hides the whole screen when its condition fails", () => {
    const showIf = { op: "and", clauses: [{ fromInstanceId: "q1", operator: "eq", value: ["yes"] }] };
    const blocks = [
      block("q1", { key: "yes-no" }),
      block("m1", { groupId: "g" }),
      block("m2", { groupId: "g" }),
    ];
    const groups = [{ id: "g", showIf }];
    // q1 answered "no" → group screen skipped; only q1's screen remains.
    const hidden = resolveVisibleScreens(snap(blocks, groups), "control", { q1: { value: "no" } });
    expect(hidden.map((x) => x.id)).toEqual(["q1"]);
    // q1 answered "yes" → group screen shows.
    const shown = resolveVisibleScreens(snap(blocks, groups), "control", { q1: { value: "yes" } });
    expect(shown.map((x) => x.kind)).toEqual(["single", "group"]);
  });
});

describe("pathMayExtend — premature-Finish guard (forward branching)", () => {
  it("true when a hidden block is conditional on a block ON the current screen", () => {
    const showIf = { op: "and", clauses: [{ fromInstanceId: "q1", operator: "eq", value: ["yes"] }] };
    const snapshot = snap([block("q1", { key: "yes-no" }), block("q2", { showIf })]);
    const screens = resolveVisibleScreens(snapshot, "control", {}); // q2 hidden until q1 answered
    expect(screens.map((s) => s.id)).toEqual(["q1"]);
    // answering q1 (this screen) could unlock q2 → show "Continue", not "Finish"
    expect(pathMayExtend(snapshot, "control", {}, screens[0])).toBe(true);
  });

  it("false when nothing hidden depends on the current screen (truly last)", () => {
    const snapshot = snap([block("q1"), block("q2")]); // both unconditional → both visible
    const screens = resolveVisibleScreens(snapshot, "control", {});
    expect(pathMayExtend(snapshot, "control", {}, screens[1])).toBe(false);
  });
});
