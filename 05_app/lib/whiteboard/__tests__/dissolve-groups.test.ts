import { describe, expect, it } from "vitest";

import { dissolveSmallGroups } from "../dissolve-groups";

describe("dissolveSmallGroups (ADR-0028 ≥2-member rule, 01KW943Q)", () => {
  it("keeps groups with ≥2 members", () => {
    const blocks = [
      { instanceId: "a", groupId: "g1" },
      { instanceId: "b", groupId: "g1" },
      { instanceId: "c", groupId: null },
    ];
    const groups = [{ id: "g1", title: "Pair" }];
    const out = dissolveSmallGroups(blocks, groups);
    expect(out.blocks.map((b) => b.groupId)).toEqual(["g1", "g1", null]);
    expect(out.groups).toEqual(groups);
  });

  it("dissolves a 1-member group (clears the lone member's groupId, drops the group)", () => {
    const blocks = [
      { instanceId: "a", groupId: "g1" },
      { instanceId: "b", groupId: null },
    ];
    const out = dissolveSmallGroups(blocks, [{ id: "g1", title: "Lonely" }]);
    expect(out.blocks.map((b) => b.groupId)).toEqual([null, null]);
    expect(out.groups).toEqual([]);
  });

  it("dissolves only the under-size group, leaving healthy ones intact", () => {
    const blocks = [
      { instanceId: "a", groupId: "g1" },
      { instanceId: "b", groupId: "g1" },
      { instanceId: "c", groupId: "g2" }, // lone → dissolve
    ];
    const out = dissolveSmallGroups(blocks, [
      { id: "g1", title: "Pair" },
      { id: "g2", title: "Solo" },
    ]);
    expect(out.blocks.map((b) => b.groupId)).toEqual(["g1", "g1", null]);
    expect(out.groups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("is a no-op (returns the same array ref) when nothing dissolves", () => {
    const blocks = [
      { instanceId: "a", groupId: "g1" },
      { instanceId: "b", groupId: "g1" },
    ];
    const out = dissolveSmallGroups(blocks, [{ id: "g1" }]);
    expect(out.blocks).toBe(blocks);
  });

  it("drops groups with no members at all", () => {
    const blocks = [{ instanceId: "a", groupId: null }];
    const out = dissolveSmallGroups(blocks, [{ id: "ghost" }]);
    expect(out.groups).toEqual([]);
  });
});
