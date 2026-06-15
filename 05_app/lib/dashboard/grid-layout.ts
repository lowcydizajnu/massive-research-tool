/**
 * Dashboard grid geometry (ADR-0045 amendment — flexible grid). PURE helpers
 * shared by the grid island + tests. The dashboard is a flowing CSS grid (3
 * responsive columns) where each widget carries a column SPAN (1–3) — "narrower
 * / wider" — and tile height follows content (no fixed cells → no truncation).
 * Order is the layout array's order; drag-reorder rewrites it.
 */
import type { WidgetSize } from "./widget-registry";

/**
 * Stored per-widget geometry. Only `w` (column span, 1–3) is meaningful for the
 * flowing grid; `x`/`y`/`h` are tolerated (older saved layouts may carry them)
 * and ignored. All optional so a `{ w }`-only entry validates.
 */
export type WidgetGeometry = { x?: number; y?: number; w?: number; h?: number };

/** Max columns on the widest breakpoint (the owner's "more columns like 3"). */
export const GRID_MAX_COLS = 3;
export const SPAN_OPTIONS = [1, 2, 3] as const;

/** Default column span for a widget size. */
export function defaultSpan(size: WidgetSize): number {
  return size === "full" ? 3 : size === "large" ? 2 : 1;
}

/** Clamp an arbitrary stored span to 1..GRID_MAX_COLS, falling back when absent. */
export function clampSpan(n: number | undefined, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.min(GRID_MAX_COLS, Math.max(1, Math.round(n)));
}

/** The column span for an entry: its stored `w`, else the size default. */
export function spanFor(size: WidgetSize, layout?: WidgetGeometry): number {
  return clampSpan(layout?.w, defaultSpan(size));
}

/**
 * Masonry width is binary — a widget is either 1 column (normal) or spans every
 * column (full). Stored `w >= 2` means full; absent, `full`-size widgets default
 * to full and everything else to normal. (CSS column-masonry can't do a 2-of-3
 * span — only 1 or all — so width is a toggle, which also reads cleanly.)
 */
export function isFullWidth(size: WidgetSize, layout?: WidgetGeometry): boolean {
  const w = layout?.w;
  if (w != null && Number.isFinite(w)) return w >= 2;
  return size === "full";
}
