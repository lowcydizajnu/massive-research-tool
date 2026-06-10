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

import { summarizeConfigDiff } from "@/server/modules/blocks";

const blk = (config: Record<string, unknown>, over: Partial<BlockInstance> = {}): BlockInstance => ({
  instanceId: "x",
  source: "core",
  key: "field-group",
  version: "1.0.0",
  config,
  ...over,
});

describe("summarizeConfigDiff (compare Modified detail)", () => {
  it("diffs field-group fields by key: added, removed, renamed/retyped", () => {
    const out = summarizeConfigDiff(
      blk({
        fields: [
          { key: "street", label: "Street", type: "text" },
          { key: "state", label: "State", type: "text" },
        ],
      }),
      blk({
        fields: [
          { key: "street", label: "Street address", type: "text", required: true },
          { key: "consent", label: "Consent", type: "yes-no" },
        ],
      }),
    );
    expect(out).toContain("+ Field “Consent”");
    expect(out).toContain("− Field “State”");
    expect(out.some((l) => l.startsWith("~ Field “Street”") && l.includes("renamed") && l.includes("now required"))).toBe(true);
  });

  it("summarizes scalar + string-array config changes", () => {
    const out = summarizeConfigDiff(
      blk({ prompt: "Old?", options: ["A", "B"] }, { key: "multiple-choice" }),
      blk({ prompt: "New?", options: ["A", "C"] }, { key: "multiple-choice" }),
    );
    expect(out.some((l) => l.startsWith("~ Prompt:") && l.includes("→"))).toBe(true);
    expect(out.some((l) => l.startsWith("~ Options:") && l.includes("+ “C”") && l.includes("− “B”"))).toBe(true);
  });

  it("notes a module version bump and stays empty when nothing changed", () => {
    expect(
      summarizeConfigDiff(blk({ prompt: "P" }), blk({ prompt: "P" }, { version: "2.0.0" }))[0],
    ).toMatch(/~ Module .*1\.0\.0 → .*2\.0\.0/);
    expect(summarizeConfigDiff(blk({ prompt: "P" }), blk({ prompt: "P" }))).toEqual([]);
  });
});

import { alignBlocksForDiff, diffBlocks as diffB } from "@/server/modules/blocks";

describe("alignBlocksForDiff (id-less forks, e.g. seeded demos)", () => {
  const mk = (instanceId: string, key: string, config: Record<string, unknown>): BlockInstance => ({
    instanceId,
    source: "core",
    key,
    version: "1.0.0",
    config,
  });

  it("pairs content-identical blocks despite different ids → unchanged", () => {
    const parent = [mk("p1", "likert-7", { prompt: "A" }), mk("p2", "free-text", { prompt: "B" })];
    const child = [mk("c1", "likert-7", { prompt: "A" }), mk("c2", "free-text", { prompt: "B" })];
    const { aligned } = alignBlocksForDiff(parent, child);
    const d = diffB(parent, aligned);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.unchangedCount).toBe(2);
  });

  it("pairs same-type edited blocks in order → modified, extras stay added", () => {
    const parent = [mk("p1", "likert-7", { prompt: "Old" })];
    const child = [mk("c1", "likert-7", { prompt: "New" }), mk("c2", "attention-check", { prompt: "X" })];
    const { aligned, idMap } = alignBlocksForDiff(parent, child);
    expect(idMap.get("c1")).toBe("p1");
    const d = diffB(parent, aligned);
    expect(d.changed.map((b) => b.instanceId)).toEqual(["p1"]);
    expect(d.added.map((b) => b.instanceId)).toEqual(["c2"]);
    expect(d.removed).toHaveLength(0);
  });

  it("leaves true id matches alone", () => {
    const parent = [mk("same", "likert-7", { prompt: "A" })];
    const child = [mk("same", "likert-7", { prompt: "B" })];
    const { aligned, idMap } = alignBlocksForDiff(parent, child);
    expect(idMap.size).toBe(0);
    expect(aligned[0].instanceId).toBe("same");
  });
});
