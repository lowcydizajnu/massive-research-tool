import { describe, expect, it } from "vitest";

import {
  cellCount,
  cellKey,
  cellLabel,
  enumerateCells,
  missingBindingValues,
  pickCell,
  pruneBindings,
  resolveConfigForCell,
  type VariantBinding,
  type VariantFactor,
} from "@/lib/variants/factorial";

const social: VariantFactor = { id: "f1", name: "Social influence", levels: [{ id: "lo", name: "low" }, { id: "hi", name: "high" }] };
const frame: VariantFactor = { id: "f2", name: "Message frame", levels: [{ id: "g", name: "gain" }, { id: "l", name: "loss" }] };

describe("factorial cells (ADR-0058)", () => {
  it("no factors → one empty cell", () => {
    expect(cellCount([])).toBe(1);
    expect(enumerateCells([])).toEqual([{}]);
    expect(cellLabel({}, [])).toBe("All participants");
  });

  it("A/B → 2 cells; 2×2 → 4 cells (cross-product)", () => {
    expect(cellCount([social])).toBe(2);
    expect(cellCount([social, frame])).toBe(4);
    const cells = enumerateCells([social, frame]);
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map(cellKey)).size).toBe(4); // all distinct
    expect(cells.map((c) => cellLabel(c, [social, frame]))).toContain("high · loss");
  });

  it("pickCell returns a real cell (deterministic with a seeded rng)", () => {
    const cells = enumerateCells([social, frame]);
    // rng=0 → first cell; rng→1 → last.
    expect(cellKey(pickCell([social, frame], () => 0))).toBe(cellKey(cells[0]));
    expect(cellKey(pickCell([social, frame], () => 0.999))).toBe(cellKey(cells[cells.length - 1]));
  });
});

describe("resolveConfigForCell", () => {
  const bindings: VariantBinding[] = [
    { instanceId: "post", path: "likes", factorId: "f1", valuesByLevel: { lo: 12, hi: 9800 } },
  ];

  it("applies the cell's bound value, leaves shared fields + other blocks untouched", () => {
    const cfg = { likes: 0, caption: "hi" };
    const low = resolveConfigForCell("post", cfg, { f1: "lo" }, bindings);
    const high = resolveConfigForCell("post", cfg, { f1: "hi" }, bindings);
    expect(low.likes).toBe(12);
    expect(high.likes).toBe(9800);
    expect(low.caption).toBe("hi"); // shared field preserved
    expect(cfg.likes).toBe(0); // input not mutated
    // A different block id with the same config is unaffected.
    expect(resolveConfigForCell("other", cfg, { f1: "hi" }, bindings).likes).toBe(0);
  });

  it("skips a binding when the cell lacks that factor or the level has no value", () => {
    const cfg = { likes: 5 };
    expect(resolveConfigForCell("post", cfg, {}, bindings).likes).toBe(5); // factor not in cell
    const partial: VariantBinding[] = [{ instanceId: "post", path: "likes", factorId: "f1", valuesByLevel: { lo: 12 } }];
    expect(resolveConfigForCell("post", cfg, { f1: "hi" }, partial).likes).toBe(5); // no value for "hi"
  });

  it("supports dot-path nesting", () => {
    const b: VariantBinding[] = [{ instanceId: "post", path: "metrics.likes", factorId: "f1", valuesByLevel: { hi: 100 } }];
    const out = resolveConfigForCell("post", { metrics: { likes: 1, shares: 2 } }, { f1: "hi" }, b);
    expect(out.metrics).toEqual({ likes: 100, shares: 2 });
  });
});

describe("validation + cleanup", () => {
  it("flags missing per-level values", () => {
    const b: VariantBinding[] = [{ instanceId: "post", path: "likes", factorId: "f1", valuesByLevel: { lo: 12 } }];
    const missing = missingBindingValues([social], b);
    expect(missing).toHaveLength(1);
    expect(missing[0].levelId).toBe("hi");
  });

  it("prunes bindings whose factor was removed", () => {
    const b: VariantBinding[] = [
      { instanceId: "post", path: "likes", factorId: "f1", valuesByLevel: {} },
      { instanceId: "post", path: "x", factorId: "gone", valuesByLevel: {} },
    ];
    expect(pruneBindings([social], b).map((x) => x.factorId)).toEqual(["f1"]);
  });
});
