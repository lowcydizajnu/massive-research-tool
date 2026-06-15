/**
 * Dashboard grid geometry (ADR-0045 amendment — flexible 2D grid). PURE helpers
 * shared by the grid island + tests: the responsive column/breakpoint contract,
 * default per-widget spans, and the functions that (a) build a complete
 * react-grid-layout layout from stored geometry + auto-placement and (b) read an
 * RGL layout back into per-widget geometry for persistence. No React, no RGL
 * import — just data, so it stays testable and the resolver/tRPC can share types.
 */
import type { WidgetSize } from "./widget-registry";

/** Per-widget grid geometry (grid units), stored in the layout entry jsonb. */
export type WidgetGeometry = { x: number; y: number; w: number; h: number };

/** One react-grid-layout item (our geometry + identity + min sizes). */
export type GridItem = WidgetGeometry & { i: string; minW: number; minH: number };

/** Responsive columns + breakpoints (lg = 3 per the owner's "more columns like 3"). */
export const GRID_COLS = { lg: 3, md: 2, sm: 1 } as const;
export const GRID_BREAKPOINTS = { lg: 1024, md: 640, sm: 0 } as const;
export const GRID_ROW_HEIGHT = 56; // px per row unit
export const GRID_MARGIN: readonly [number, number] = [16, 16];
const MIN_W = 1;
const MIN_H = 2;

/** Default column span for a widget size, clamped to the available columns. */
export function defaultSpan(size: WidgetSize, cols: number): number {
  const want = size === "full" ? cols : size === "large" ? 2 : 1;
  return Math.min(Math.max(MIN_W, want), cols);
}

/** Default height (grid row units) for a widget size — generous so most content fits unscrolled. */
export function defaultHeight(size: WidgetSize): number {
  switch (size) {
    case "full":
      return 2; // short full-width banner (welcome / stats)
    case "large":
      return 6;
    case "medium":
      return 5;
    case "small":
      return 4;
  }
}

/**
 * Build the canonical (lg) RGL layout from resolved widgets. Items that carry
 * stored geometry keep it verbatim; items without (every pre-amendment layout,
 * code defaults, and freshly-added widgets) are packed into rows below any
 * stored items — vertical compaction then tidies the result. Deterministic.
 */
export function buildGridLayout(
  items: { widgetKey: string; size: WidgetSize; layout?: WidgetGeometry }[],
  cols: number,
): GridItem[] {
  // Auto-placed items start below the lowest stored item so they never collide.
  let baseY = 0;
  for (const it of items) {
    if (it.layout) baseY = Math.max(baseY, it.layout.y + it.layout.h);
  }

  const out: GridItem[] = [];
  let cursorX = 0;
  let cursorY = baseY;
  let rowHeight = 0;
  for (const it of items) {
    if (it.layout) {
      out.push({ i: it.widgetKey, ...it.layout, minW: MIN_W, minH: MIN_H });
      continue;
    }
    const w = defaultSpan(it.size, cols);
    const h = defaultHeight(it.size);
    if (cursorX + w > cols) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    out.push({ i: it.widgetKey, x: cursorX, y: cursorY, w, h, minW: MIN_W, minH: MIN_H });
    cursorX += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return out;
}

/** Read an RGL layout back into per-widget geometry, keyed by widget key. */
export function geometryByKey(
  layout: readonly { i: string; x: number; y: number; w: number; h: number }[],
): Record<string, WidgetGeometry> {
  const out: Record<string, WidgetGeometry> = {};
  for (const l of layout) out[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h };
  return out;
}
