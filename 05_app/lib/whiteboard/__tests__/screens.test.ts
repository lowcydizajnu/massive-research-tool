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

  it("groupId pointing at an unknown group degrades to a single screen", () => {
    const s = deriveScreens([blk("a", "ghost")], []);
    expect(s).toEqual([{ id: "a", kind: "single", title: null, showIf: undefined, blocks: [expect.any(Object)] }]);
  });
});
