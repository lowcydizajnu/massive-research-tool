import { describe, expect, it } from "vitest";

import { getModuleDef } from "@/server/modules/registry";

const def = (key: string) => getModuleDef("core", key, "1.0.0")!;
const ok = (key: string, answer: unknown, config: Record<string, unknown> = {}) =>
  def(key).validateAnswer!(answer, config);

describe("V1.12 Wave 3 — numeric research scales", () => {
  it("registers nps / rating-stars / vas as response-collecting", () => {
    for (const k of ["nps", "rating-stars", "vas"]) {
      expect(def(k).collectsResponse).toBe(true);
      expect(def(k).responseSchema).not.toBeNull();
    }
  });

  it("nps accepts 0..10 integers only", () => {
    expect(ok("nps", { value: 0 })).toBe(true);
    expect(ok("nps", { value: 10 })).toBe(true);
    expect(ok("nps", { value: 11 })).toBe(false);
    expect(ok("nps", { value: 7.5 })).toBe(false);
    expect(def("nps").isAnswerEmpty!({})).toBe(true);
  });

  it("rating-stars respects the configured max", () => {
    expect(ok("rating-stars", { value: 5 }, { max: 5 })).toBe(true);
    expect(ok("rating-stars", { value: 6 }, { max: 5 })).toBe(false);
    expect(ok("rating-stars", { value: 7 }, { max: 7 })).toBe(true);
    expect(ok("rating-stars", { value: 0 }, { max: 5 })).toBe(false);
  });

  it("vas accepts any value within min/max (continuous)", () => {
    expect(ok("vas", { value: 42.7 }, { min: 0, max: 100 })).toBe(true);
    expect(ok("vas", { value: 100 }, { min: 0, max: 100 })).toBe(true);
    expect(ok("vas", { value: 120 }, { min: 0, max: 100 })).toBe(false);
  });
});

describe("V1.12 Wave 3 — composite scales", () => {
  it("registers matrix-grid + semantic-differential as response-collecting", () => {
    for (const k of ["matrix-grid", "semantic-differential"]) {
      expect(def(k).collectsResponse).toBe(true);
      expect(def(k).responseSchema).not.toBeNull();
    }
  });

  it("matrix-grid values must be valid columns; required ⇒ every row answered", () => {
    const cfg = { rows: ["R1", "R2"], columns: ["A", "B"], required: true };
    expect(ok("matrix-grid", { values: { "0": "A", "1": "B" } }, cfg)).toBe(true);
    expect(ok("matrix-grid", { values: { "0": "Z", "1": "B" } }, cfg)).toBe(false); // bad column
    expect(ok("matrix-grid", { values: { "0": "A" } }, cfg)).toBe(false); // R2 missing (required)
    expect(ok("matrix-grid", { values: { "0": "A" } }, { ...cfg, required: false })).toBe(true);
    expect(def("matrix-grid").isAnswerEmpty!({ values: {} })).toBe(true);
  });

  it("semantic-differential values must be 1..points; required ⇒ every pair", () => {
    const cfg = { leftLabels: ["a", "b"], rightLabels: ["x", "y"], points: 7, required: true };
    expect(ok("semantic-differential", { values: { "0": 4, "1": 7 } }, cfg)).toBe(true);
    expect(ok("semantic-differential", { values: { "0": 8, "1": 1 } }, cfg)).toBe(false); // >points
    expect(ok("semantic-differential", { values: { "0": 4 } }, cfg)).toBe(false); // pair 1 missing
  });
});

describe("V1.12 Wave 3 — reaction-time + MaxDiff", () => {
  it("registers reaction-time + maxdiff as response-collecting", () => {
    for (const k of ["reaction-time", "maxdiff"]) {
      expect(def(k).collectsResponse).toBe(true);
      expect(def(k).responseSchema).not.toBeNull();
    }
  });

  it("reaction-time accepts a non-negative latency", () => {
    expect(ok("reaction-time", { value: 342 })).toBe(true);
    expect(ok("reaction-time", { value: 0 })).toBe(true);
    expect(ok("reaction-time", { value: -5 })).toBe(false);
    expect(def("reaction-time").isAnswerEmpty!({})).toBe(true);
  });

  it("maxdiff requires distinct best/worst from the item set", () => {
    const cfg = { items: ["A", "B", "C"] };
    expect(ok("maxdiff", { best: "A", worst: "C" }, cfg)).toBe(true);
    expect(ok("maxdiff", { best: "A", worst: "A" }, cfg)).toBe(false); // same
    expect(ok("maxdiff", { best: "A", worst: "Z" }, cfg)).toBe(false); // not an item
    expect(def("maxdiff").isAnswerEmpty!({ best: "A", worst: "" })).toBe(true);
    expect(def("maxdiff").isAnswerEmpty!({ best: "A", worst: "B" })).toBe(false);
  });
});
