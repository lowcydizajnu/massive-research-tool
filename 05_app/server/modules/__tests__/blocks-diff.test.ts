import { describe, expect, it } from "vitest";

import { type BlockInstance, diffBlocks } from "@/server/modules/blocks";

const b = (instanceId: string, config: Record<string, unknown> = {}): BlockInstance => ({
  instanceId,
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  config,
});

describe("diffBlocks (ADR-0018 replication divergence)", () => {
  it("aligns by instanceId — added / removed / changed / unchanged", () => {
    const parent = [b("1", { q: "a" }), b("2"), b("3")];
    const child = [b("1", { q: "a" }), b("2", { q: "x" }), b("4")];
    const d = diffBlocks(parent, child);
    expect(d.added.map((x) => x.instanceId)).toEqual(["4"]);
    expect(d.removed.map((x) => x.instanceId)).toEqual(["3"]);
    expect(d.changed.map((x) => x.instanceId)).toEqual(["2"]);
    expect(d.unchangedCount).toBe(1);
  });

  it("treats a module-ref change as changed", () => {
    const parent = [b("1")];
    const child: BlockInstance[] = [{ ...b("1"), version: "2.0.0" }];
    expect(diffBlocks(parent, child).changed.map((x) => x.instanceId)).toEqual(["1"]);
  });

  it("ignores config key order", () => {
    const parent: BlockInstance[] = [
      { instanceId: "1", source: "core", key: "k", version: "1", config: { a: 1, b: 2 } },
    ];
    const child: BlockInstance[] = [
      { instanceId: "1", source: "core", key: "k", version: "1", config: { b: 2, a: 1 } },
    ];
    const d = diffBlocks(parent, child);
    expect(d.changed).toHaveLength(0);
    expect(d.unchangedCount).toBe(1);
  });

  it("an identical copy diverges in nothing (a fresh fork)", () => {
    const blocks = [b("1", { q: "a" }), b("2", { q: "b" })];
    const d = diffBlocks(blocks, blocks);
    expect(d).toEqual({ added: [], removed: [], changed: [], unchangedCount: 2 });
  });
});
