import { describe, expect, it } from "vitest";

import { buildGridLayout, defaultSpan, geometryByKey } from "@/lib/dashboard/grid-layout";

describe("dashboard grid-layout helpers (ADR-0045 amendment)", () => {
  it("defaultSpan: full → cols, large → 2, medium/small → 1, never exceeds cols", () => {
    expect(defaultSpan("full", 3)).toBe(3);
    expect(defaultSpan("full", 2)).toBe(2);
    expect(defaultSpan("large", 3)).toBe(2);
    expect(defaultSpan("large", 1)).toBe(1);
    expect(defaultSpan("medium", 3)).toBe(1);
    expect(defaultSpan("small", 3)).toBe(1);
  });

  it("auto-places geometry-less items into rows of `cols`, wrapping, with min sizes", () => {
    const out = buildGridLayout(
      [
        { widgetKey: "a", size: "full" }, // w=3 → its own row
        { widgetKey: "b", size: "medium" }, // \
        { widgetKey: "c", size: "medium" }, //  } a row of three
        { widgetKey: "d", size: "medium" }, // /
        { widgetKey: "e", size: "small" }, // wraps to a new row
      ],
      3,
    );
    const byKey = Object.fromEntries(out.map((o) => [o.i, o]));
    expect(byKey.a).toMatchObject({ x: 0, w: 3, minW: 1, minH: 2 });
    expect([byKey.b.x, byKey.c.x, byKey.d.x]).toEqual([0, 1, 2]);
    expect(byKey.b.y).toBe(byKey.c.y);
    expect(byKey.c.y).toBe(byKey.d.y);
    expect(byKey.a.y).toBeLessThan(byKey.b.y); // banner above the row of three
    expect(byKey.e.x).toBe(0); // wrapped
    expect(byKey.e.y).toBeGreaterThan(byKey.b.y);
  });

  it("keeps stored geometry verbatim and places un-stored items below it", () => {
    const out = buildGridLayout(
      [
        { widgetKey: "fixed", size: "medium", layout: { x: 1, y: 0, w: 2, h: 4 } },
        { widgetKey: "auto", size: "small" },
      ],
      3,
    );
    const byKey = Object.fromEntries(out.map((o) => [o.i, o]));
    expect(byKey.fixed).toMatchObject({ x: 1, y: 0, w: 2, h: 4 });
    expect(byKey.auto.y).toBeGreaterThanOrEqual(4); // below the stored item (y + h)
  });

  it("geometryByKey reduces an RGL layout to per-key geometry", () => {
    expect(
      geometryByKey([
        { i: "a", x: 0, y: 0, w: 3, h: 2 },
        { i: "b", x: 0, y: 2, w: 1, h: 4 },
      ]),
    ).toEqual({ a: { x: 0, y: 0, w: 3, h: 2 }, b: { x: 0, y: 2, w: 1, h: 4 } });
  });
});
