/**
 * Normalize a pointer/click position to 0..1 fractions of an element's box
 * (ADR-0041) — coordinates stored this way survive responsive resize, retina,
 * and re-display at any width. Pure; clamps to [0,1].
 */
export function normalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: clamp01(x), y: clamp01(y) };
}

/** Clamp to [0,1], rounded to 3dp (the shared coordinate contract, ADR-0041). */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
}

/* ---------- Hot-spot region geometry (ADR-0041 amendment, authoring side) ----------
 * Pure + DOM-free so the Builder's visual RegionsEditor and node tests share the
 * exact math. A "region" is a normalized 0..1 rectangle; the editor adds {key,label}. */

export type Rect = { x: number; y: number; w: number; h: number };
/** What clicking a region does (ADR-0043). Absent ⇒ just record the selection. */
export type RegionAction =
  | { type: "record" }
  | { type: "link"; url: string }
  | { type: "advance" }
  | { type: "setValue"; key: string; value: string };
/** `visible:false` = an invisible-but-clickable zone for participants (ADR-0041 am.). */
export type Region = Rect & { key: string; label: string; visible?: boolean; action?: RegionAction };

/** A drag below this normalized size is a click (select), not a new region. */
export const minRegionSize = 0.02;

/** Two normalized corners → a normalized rect (min corner + positive extents). */
export function rectFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return clampRegion({ x, y, w, h });
}

/** Keep a rect inside the unit square: non-negative w/h, and x+w ≤ 1, y+h ≤ 1. */
export function clampRegion(r: Rect): Rect {
  const x = clamp01(r.x);
  const y = clamp01(r.y);
  const w = clamp01(Math.min(Math.max(0, r.w), 1 - x));
  const h = clamp01(Math.min(Math.max(0, r.h), 1 - y));
  return { x, y, w, h };
}

/** Move a region by (dx,dy), clamped so it stays fully inside the image. */
export function nudgeRegion(r: Rect, dx: number, dy: number): Rect {
  const x = clamp01(Math.min(Math.max(0, r.x + dx), 1 - r.w));
  const y = clamp01(Math.min(Math.max(0, r.y + dy), 1 - r.h));
  return { x, y, w: r.w, h: r.h };
}

/** Grow/shrink a region by (dw,dh), clamped (min size, and stays inside). */
export function resizeRegion(r: Rect, dw: number, dh: number): Rect {
  const w = clamp01(Math.min(Math.max(minRegionSize, r.w + dw), 1 - r.x));
  const h = clamp01(Math.min(Math.max(minRegionSize, r.h + dh), 1 - r.y));
  return { x: r.x, y: r.y, w, h };
}

/** First free `r{n}` key not already used (never reuses a live key). */
export function nextRegionKey(existing: { key: string }[]): string {
  const used = new Set(existing.map((r) => r.key));
  let n = 1;
  while (used.has(`r${n}`)) n += 1;
  return `r${n}`;
}

/** Topmost region (last-drawn wins) whose box contains the point, else null. */
export function regionAtPoint(regions: Region[], p: { x: number; y: number }): string | null {
  for (let i = regions.length - 1; i >= 0; i -= 1) {
    const r = regions[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.key;
  }
  return null;
}
