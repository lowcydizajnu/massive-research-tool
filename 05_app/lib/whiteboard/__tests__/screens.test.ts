import { describe, expect, it } from "vitest";

import { deriveScreens } from "@/lib/whiteboard/screens";
import type { BlockInstance, StudyGroup } from "@/server/modules/blocks";

const blk = (instanceId: string, groupId?: string): BlockInstance => ({
  instanceId,
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  config: {},
  ...(groupId ? { groupId } : {}),
});

describe("deriveScreens (ADR-0028)", () => {
  it("no groups → one screen per block (backward compatible)", () => {
    const s = deriveScreens([blk("a"), blk("b")], []);
    expect(s.map((x) => x.kind)).toEqual(["single", "single"]);
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("contiguous shared groupId → one group screen with all members", () => {
    const groups: StudyGroup[] = [{ id: "g1", title: "Stimulus + measures" }];
    const s = deriveScreens([blk("a", "g1"), blk("b", "g1"), blk("c", "g1")], groups);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "group", id: "g1", title: "Stimulus + measures" });
    expect(s[0].blocks.map((b) => b.instanceId)).toEqual(["a", "b", "c"]);
  });

  it("mixed single / group / single → three screens in order", () => {
    const groups: StudyGroup[] = [{ id: "g1" }];
    const s = deriveScreens([blk("intro"), blk("a", "g1"), blk("b", "g1"), blk("end")], groups);
    expect(s.map((x) => x.kind)).toEqual(["single", "group", "single"]);
    expect(s[1].blocks).toHaveLength(2);
  });

  it("group-level showIf is carried onto the screen", () => {
    const showIf = { op: "and" as const, clauses: [{ fromInstanceId: "x", operator: "answered" as const, value: [] }] };
    const s = deriveScreens([blk("a", "g1")], [{ id: "g1", showIf }]);
    expect(s[0].showIf).toEqual(showIf);
  });

  it("group interaction gating (ADR-0087) is carried onto the screen", () => {
    const groups: StudyGroup[] = [
      { id: "g1", maxTimeSec: 30, interactionRequirements: [{ id: "r1", type: "like", count: 2 }] },
    ];
    const s = deriveScreens([blk("a", "g1"), blk("b", "g1")], groups);
    expect(s[0].maxTimeSec).toBe(30);
    expect(s[0].interactionRequirements).toEqual([{ id: "r1", type: "like", count: 2 }]);
  });

  it("groupId pointing at an unknown group degrades to a single screen", () => {
    const s = deriveScreens([blk("a", "ghost")], []);
    expect(s).toEqual([{ id: "a", kind: "single", title: null, showIf: undefined, blocks: [expect.any(Object)] }]);
  });
});

import { regroupAfterMove } from "@/lib/whiteboard/screens";

describe("regroupAfterMove (ADR-0028 #3+#8)", () => {
  const mk = (...specs: [string, string | null][]) => specs.map(([instanceId, groupId]) => ({ instanceId, groupId }));
  const ids = (rows: { instanceId: string }[]) => rows.map((r) => r.instanceId);
  const gid = (rows: { instanceId: string; groupId: string | null }[], id: string) =>
    rows.find((r) => r.instanceId === id)!.groupId;

  it("dropping a block between two members of a group joins it", () => {
    // order after drop: A(g), Z(none, moved between), B(g), C(g)
    const out = regroupAfterMove(mk(["A", "g"], ["Z", null], ["B", "g"], ["C", "g"]), "Z");
    expect(gid(out, "Z")).toBe("g");
    expect(ids(out)).toEqual(["A", "Z", "B", "C"]); // contiguous
  });

  it("dragging a member away from its group (between ungrouped blocks) leaves it", () => {
    const out = regroupAfterMove(mk(["X", null], ["B", "g"], ["Y", null], ["A", "g"], ["C", "g"]), "B");
    expect(gid(out, "B")).toBeNull();
  });

  it("moving a member to the top carries the whole group (contiguity)", () => {
    // B(g) dropped at top, next = A(g) → stays in g; group pulled together up top
    const out = regroupAfterMove(mk(["B", "g"], ["A", "g"], ["C", "g"], ["Z", null]), "B");
    expect(gid(out, "B")).toBe("g");
    expect(ids(out).slice(0, 3).sort()).toEqual(["A", "B", "C"]);
    expect(ids(out)[3]).toBe("Z");
  });

  it("reordering an ungrouped block near (not inside) a group doesn't join it", () => {
    const out = regroupAfterMove(mk(["Z", null], ["A", "g"], ["B", "g"]), "Z");
    expect(gid(out, "Z")).toBeNull();
  });
});

import { setBlockGroup } from "@/lib/whiteboard/screens";

describe("setBlockGroup (whiteboard drag-into/out-of group)", () => {
  const mk = (...s: [string, string | null][]) => s.map(([instanceId, groupId]) => ({ instanceId, groupId }));
  const ids = (r: { instanceId: string }[]) => r.map((x) => x.instanceId);
  const gid = (r: { instanceId: string; groupId: string | null }[], id: string) =>
    r.find((x) => x.instanceId === id)!.groupId;

  it("joining a group pulls the block next to its members (contiguous)", () => {
    const out = setBlockGroup(mk(["A", "g"], ["B", "g"], ["Z", null], ["C", null]), "Z", "g");
    expect(gid(out, "Z")).toBe("g");
    expect(ids(out)).toEqual(["A", "B", "Z", "C"]); // Z pulled into g's cluster
  });

  it("ungrouping sets groupId null and keeps order", () => {
    const out = setBlockGroup(mk(["A", "g"], ["B", "g"], ["C", "g"]), "B", null);
    expect(gid(out, "B")).toBeNull();
    expect(ids(out)).toEqual(["A", "C", "B"]); // B falls out of the cluster, to its first free slot after
  });
});
