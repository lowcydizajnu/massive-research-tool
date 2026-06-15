import { describe, expect, it } from "vitest";

import { clampSpan, defaultSpan, isFullWidth, spanFor } from "@/lib/dashboard/grid-layout";

describe("dashboard grid-layout helpers (ADR-0045 amendment)", () => {
  it("defaultSpan: full → 3, large → 2, medium/small → 1", () => {
    expect(defaultSpan("full")).toBe(3);
    expect(defaultSpan("large")).toBe(2);
    expect(defaultSpan("medium")).toBe(1);
    expect(defaultSpan("small")).toBe(1);
  });

  it("clampSpan: clamps to 1..3, rounds, falls back when absent/invalid", () => {
    expect(clampSpan(2, 1)).toBe(2);
    expect(clampSpan(5, 1)).toBe(3); // clamped to max
    expect(clampSpan(0, 2)).toBe(1); // clamped to min
    expect(clampSpan(undefined, 2)).toBe(2); // fallback
    expect(clampSpan(NaN, 3)).toBe(3); // fallback
    expect(clampSpan(2.6, 1)).toBe(3); // rounded
  });

  it("spanFor: uses stored w when present, else the size default; tolerates legacy {x,y,w,h}", () => {
    expect(spanFor("medium")).toBe(1); // no layout → size default
    expect(spanFor("medium", { w: 3 })).toBe(3); // stored span wins
    expect(spanFor("full", { w: 2 })).toBe(2);
    expect(spanFor("small", { x: 0, y: 0, w: 2, h: 4 })).toBe(2); // legacy geometry → reads w
    expect(spanFor("large", {})).toBe(2); // empty layout → size default
  });

  it("isFullWidth: stored w>=2 → full; absent → only 'full'-size widgets are full", () => {
    expect(isFullWidth("medium", { w: 3 })).toBe(true); // stored full
    expect(isFullWidth("medium", { w: 1 })).toBe(false); // stored normal
    expect(isFullWidth("full")).toBe(true); // size default
    expect(isFullWidth("medium")).toBe(false);
    expect(isFullWidth("large")).toBe(false); // not 'full' size → normal unless stored
    expect(isFullWidth("full", { w: 1 })).toBe(false); // explicit normal overrides the size default
  });
});
