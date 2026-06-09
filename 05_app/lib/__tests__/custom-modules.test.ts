import { describe, expect, it } from "vitest";

import { definitionToBlocks, groupToDefinition } from "@/lib/custom-modules";
import type { BlockInstance } from "@/server/modules/blocks";

const member = (over: Partial<BlockInstance>): BlockInstance => ({
  instanceId: "x",
  source: "core",
  key: "free-text",
  version: "1.0.0",
  config: { prompt: "P" },
  ...over,
});

describe("groupToDefinition (ADR-0029)", () => {
  it("strips instance ids, branch rules, arm gates, showIf — keeps source/key/version/config/title", () => {
    const def = groupToDefinition(
      [
        member({ instanceId: "a", config: { prompt: "Street" }, title: "Street", groupId: "g", visibility: { showIfCondition: ["arm1"] } }),
        member({ instanceId: "b", key: "dropdown", config: { prompt: "Country" }, branchRules: [{ fromInstanceId: "a", equals: "x" }] }),
      ],
      "My address",
    );
    expect(def).toEqual({
      title: "My address",
      blocks: [
        { source: "core", key: "free-text", version: "1.0.0", config: { prompt: "Street" }, title: "Street" },
        { source: "core", key: "dropdown", version: "1.0.0", config: { prompt: "Country" } },
      ],
    });
  });
  it("omits an empty title", () => {
    expect(groupToDefinition([member({})], "  ").title).toBeUndefined();
  });
});

describe("definitionToBlocks (ADR-0029)", () => {
  it("materialises fresh instance ids all in one group", () => {
    let n = 0;
    const blocks = definitionToBlocks(
      { title: "T", blocks: [{ source: "core", key: "free-text", version: "1.0.0", config: { prompt: "A" }, title: "A" }, { source: "core", key: "slider", version: "1.0.0", config: {} }] },
      "grp",
      () => `id${++n}`,
    );
    expect(blocks.map((b) => b.instanceId)).toEqual(["id1", "id2"]);
    expect(blocks.every((b) => b.groupId === "grp")).toBe(true);
    expect(blocks[0].title).toBe("A");
    expect(blocks[1].title).toBeUndefined();
    expect(blocks[0].config).toEqual({ prompt: "A" });
  });
});
