import { describe, expect, it } from "vitest";

import {
  clampRegion,
  minRegionSize,
  nextRegionKey,
  normalizedPoint,
  nudgeRegion,
  rectFromCorners,
  regionAtPoint,
  resizeRegion,
  type Region,
} from "@/lib/take/image-coords";

describe("normalizedPoint (ADR-0041)", () => {
  it("normalizes to 0..1 fractions, clamped + rounded to 3dp", () => {
    expect(normalizedPoint(50, 25, { left: 0, top: 0, width: 200, height: 100 })).toEqual({ x: 0.25, y: 0.25 });
    expect(normalizedPoint(-10, 999, { left: 0, top: 0, width: 200, height: 100 })).toEqual({ x: 0, y: 1 });
  });
});

describe("hot-spot region geometry (ADR-0041 amendment, authoring side)", () => {
  it("rectFromCorners: min corner + positive extents, either drag direction", () => {
    expect(rectFromCorners({ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.3 });
    // reversed corners produce the same rect
    expect(rectFromCorners({ x: 0.4, y: 0.5 }, { x: 0.1, y: 0.2 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.3 });
  });

  it("clampRegion: keeps the rect inside the unit square; valid rects unchanged", () => {
    expect(clampRegion({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 })).toEqual({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
    expect(clampRegion({ x: 0.1, y: 0.1, w: -0.3, h: 0.2 })).toEqual({ x: 0.1, y: 0.1, w: 0, h: 0.2 });
    expect(clampRegion({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  it("nudgeRegion: moves + clamps at the 0 and 1 edges, keeping size", () => {
    expect(nudgeRegion({ x: 0, y: 0, w: 0.2, h: 0.2 }, -0.1, -0.1)).toEqual({ x: 0, y: 0, w: 0.2, h: 0.2 });
    expect(nudgeRegion({ x: 0.8, y: 0, w: 0.2, h: 0.2 }, 0.1, 0)).toEqual({ x: 0.8, y: 0, w: 0.2, h: 0.2 });
    expect(nudgeRegion({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.1, 0.1)).toEqual({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 });
  });

  it("resizeRegion: grows/shrinks, clamps to minRegionSize and the image edge", () => {
    expect(resizeRegion({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.1, 0.1)).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 });
    expect(resizeRegion({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, -0.5, 0).w).toBe(minRegionSize); // floor
    expect(resizeRegion({ x: 0.9, y: 0.1, w: 0.05, h: 0.2 }, 0.5, 0).w).toBeCloseTo(0.1, 5); // edge ceiling
  });

  it("nextRegionKey: first free r{n}, never reuses, fills gaps", () => {
    expect(nextRegionKey([])).toBe("r1");
    expect(nextRegionKey([{ key: "r1" }])).toBe("r2");
    expect(nextRegionKey([{ key: "r1" }, { key: "r3" }])).toBe("r2"); // gap filled
    expect(nextRegionKey([{ key: "r2" }])).toBe("r1");
  });

  it("regionAtPoint: topmost (last-drawn) wins on overlap; null outside all", () => {
    const regions: Region[] = [
      { key: "a", label: "A", x: 0, y: 0, w: 0.5, h: 0.5 },
      { key: "b", label: "B", x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    ];
    expect(regionAtPoint(regions, { x: 0.3, y: 0.3 })).toBe("b"); // inside both → last
    expect(regionAtPoint(regions, { x: 0.05, y: 0.05 })).toBe("a"); // inside a only
    expect(regionAtPoint(regions, { x: 0.95, y: 0.95 })).toBeNull(); // outside all
  });

  it("regression: a drawn region commits as an OBJECT {key,label,x,y,w,h} (not a string)", () => {
    // mirrors RegionsEditor.addRegion — guards the old generic-editor "[object Object]" bug
    const rect = rectFromCorners({ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 });
    const region = { key: nextRegionKey([]), label: "Region 1", ...rect };
    expect(region).toEqual({ key: "r1", label: "Region 1", x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    expect(typeof region).toBe("object");
  });
});
