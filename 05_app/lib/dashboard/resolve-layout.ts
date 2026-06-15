/**
 * Dashboard layout resolver (ADR-0045) — a PURE function that turns stored
 * layout rows into the ordered, filtered list of widgets to render.
 *
 * Precedence: the user's own override → (workspace dashboard) the admin
 * "house default" → the code default. The resolved list is then filtered
 * against the registry: unknown/removed keys are dropped (forward-compat),
 * widgets that don't belong to this dashboard kind are dropped, `ownerOnly`
 * widgets are dropped for non-owners, and duplicates are collapsed.
 */
import { isCustomKey } from "./custom-sources";
import type { WidgetGeometry } from "./grid-layout";
import {
  CUSTOM_META,
  WIDGET_REGISTRY,
  type DashboardKind,
  type WidgetMeta,
  defaultLayoutFor,
} from "./widget-registry";

/** One stored entry: a widget key + optional per-widget settings + optional grid geometry. */
export type LayoutEntry = {
  widgetKey: string;
  settings?: Record<string, unknown>;
  /** 2D grid position/size (ADR-0045 amendment); absent on pre-amendment + code-default layouts. */
  layout?: WidgetGeometry;
};

/** A resolved, render-ready widget (key + its metadata + any settings + any geometry). */
export type ResolvedWidget = {
  widgetKey: string;
  meta: WidgetMeta;
  settings?: Record<string, unknown>;
  layout?: WidgetGeometry;
};

export function resolveDashboardLayout(opts: {
  kind: DashboardKind;
  /** The user's saved override, or null. */
  userLayout: LayoutEntry[] | null;
  /** The workspace admin default (workspace dashboard only), or null. */
  workspaceDefault?: LayoutEntry[] | null;
  /** Whether the viewer is a workspace owner (gates `ownerOnly` widgets). */
  isOwner: boolean;
  /** Injectable for tests; defaults to the real registry. */
  registry?: Record<string, WidgetMeta>;
}): ResolvedWidget[] {
  // String-indexable view: an arbitrary stored key may not be a known WidgetKey,
  // so a miss is `undefined` (handled below) rather than a type error.
  const registry = (opts.registry ?? WIDGET_REGISTRY) as Record<string, WidgetMeta | undefined>;
  const codeDefault: LayoutEntry[] = defaultLayoutFor(opts.kind).map((widgetKey) => ({ widgetKey }));

  const base: LayoutEntry[] =
    opts.userLayout ?? (opts.kind === "workspace" ? (opts.workspaceDefault ?? null) : null) ?? codeDefault;

  const seen = new Set<string>();
  const resolved: ResolvedWidget[] = [];
  for (const entry of base) {
    if (seen.has(entry.widgetKey)) continue; // de-dupe a malformed layout
    // Custom widget instances (`custom:<ulid>`) aren't in the registry — resolve
    // them against the synthetic meta so they render + reorder like any widget.
    if (isCustomKey(entry.widgetKey)) {
      seen.add(entry.widgetKey);
      resolved.push({ widgetKey: entry.widgetKey, meta: CUSTOM_META, settings: entry.settings, layout: entry.layout });
      continue;
    }
    const meta = registry[entry.widgetKey];
    if (!meta) continue; // unknown / retired widget — drop (forward-compat)
    if (meta.dashboard !== "both" && meta.dashboard !== opts.kind) continue; // wrong dashboard
    if (meta.ownerOnly && !opts.isOwner) continue; // owner-gated widget
    seen.add(entry.widgetKey);
    resolved.push({ widgetKey: entry.widgetKey, meta, settings: entry.settings, layout: entry.layout });
  }
  return resolved;
}
