import { describe, expect, it } from "vitest";

import { blockEditDetail, changedConfigKeys, humanizeFieldKey, mergeDetail } from "@/server/modules/study-edits";

describe("humanizeFieldKey (ADR-0086 am.)", () => {
  it("splits camelCase + underscores/dashes into sentence case", () => {
    expect(humanizeFieldKey("captureUsername")).toBe("Capture username");
    expect(humanizeFieldKey("brand_name")).toBe("Brand name");
    expect(humanizeFieldKey("signedInTemplate")).toBe("Signed in template");
    expect(humanizeFieldKey("title")).toBe("Title");
  });

  it("falls back to the raw key when it has no letters", () => {
    expect(humanizeFieldKey("")).toBe("");
    expect(humanizeFieldKey("_")).toBe("_");
  });
});

describe("changedConfigKeys", () => {
  it("returns only keys whose value changed (deep-equal via JSON)", () => {
    const before = { title: "Hi", brandName: "", ssoProviders: ["google"], captureUsername: true };
    const after = { title: "Hello", brandName: "", ssoProviders: ["google", "apple"], captureUsername: true };
    expect(changedConfigKeys(before, after).sort()).toEqual(["ssoProviders", "title"]);
  });

  it("detects added / removed keys", () => {
    expect(changedConfigKeys({ a: 1 }, { a: 1, b: 2 })).toEqual(["b"]);
    expect(changedConfigKeys({ a: 1, b: 2 }, { a: 1 })).toEqual(["b"]);
  });

  it("is empty when nothing changed", () => {
    expect(changedConfigKeys({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });
});

describe("blockEditDetail", () => {
  it("humanizes the changed keys and caps at 15", () => {
    expect(blockEditDetail({ title: "a", captureUsername: false }, { title: "b", captureUsername: true }).sort()).toEqual([
      "Capture username",
      "Title",
    ]);
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 30; i++) after[`field${i}`] = i;
    expect(blockEditDetail(before, after)).toHaveLength(15);
  });
});

describe("mergeDetail (coalesce union)", () => {
  it("unions two lists, existing order first, deduped", () => {
    expect(mergeDetail(["Title"], ["Brand name", "Title"])).toEqual(["Title", "Brand name"]);
  });

  it("caps the merged list at 15", () => {
    const a = Array.from({ length: 12 }, (_, i) => `A${i}`);
    const b = Array.from({ length: 12 }, (_, i) => `B${i}`);
    expect(mergeDetail(a, b)).toHaveLength(15);
  });

  it("tolerates empty / missing inputs", () => {
    expect(mergeDetail([], ["X"])).toEqual(["X"]);
    expect(mergeDetail(["X"], [])).toEqual(["X"]);
  });
});
