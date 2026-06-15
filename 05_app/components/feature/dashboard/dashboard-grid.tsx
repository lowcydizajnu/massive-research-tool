"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./dashboard-grid.css";

import { GripVertical, Pencil, Plus, RotateCcw, Settings2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";
import { ulid } from "ulid";

import { CustomWidget, type CustomSettings } from "@/components/feature/dashboard/custom-widget";
import { PendingButton } from "@/components/ui/pending-button";
import { CUSTOM_KEY_PREFIX, isCustomKey } from "@/lib/dashboard/custom-sources";
import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  buildGridLayout,
  geometryByKey,
  type WidgetGeometry,
} from "@/lib/dashboard/grid-layout";
import { WIDGET_REGISTRY, type WidgetSize } from "@/lib/dashboard/widget-registry";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Dashboard grid + customize mode (ADR-0045 + the 2026-06-15 flexible-grid
 * amendment). The RSC page pre-renders EVERY widget valid for this dashboard
 * into `nodes` (keyed by widget key); this client island lays them out on a
 * draggable, resizable `react-grid-layout` (3 responsive columns). View mode is
 * the same grid, static. Customize unlocks drag (via each tile's grip handle)
 * and resize (corner handle), plus add / remove / per-widget settings / custom
 * widgets / reset / workspace-default — staged client-side until Save, which
 * persists `{ widgetKey, settings?, layout? }[]` via `dashboard.saveLayout`.
 * Per-widget geometry `{x,y,w,h}` lives in the layout jsonb (no migration);
 * entries with no geometry are auto-placed from their registry size.
 */

export type LayoutEntry = {
  widgetKey: string;
  settings?: Record<string, unknown>;
  layout?: WidgetGeometry;
};

const sizeOf = (widgetKey: string): WidgetSize =>
  isCustomKey(widgetKey)
    ? "medium"
    : (WIDGET_REGISTRY[widgetKey as keyof typeof WIDGET_REGISTRY]?.size ?? "medium");

export function DashboardGrid({
  kind,
  workspaceId,
  layout,
  nodes,
  canSetWorkspaceDefault = false,
}: {
  kind: "user" | "workspace";
  workspaceId?: string;
  /** The resolved, saved layout (order + settings + geometry). */
  layout: LayoutEntry[];
  /** Pre-rendered content for every widget valid on this dashboard, keyed by widget key. */
  nodes: Record<string, ReactNode>;
  /** Workspace dashboard only: the caller may set the workspace "house default". */
  canSetWorkspaceDefault?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutEntry[]>(layout);
  const [confirmReset, setConfirmReset] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null);
  // RGL 2.x measures width via this hook (the WidthProvider replacement); the
  // containerRef goes on the grid's wrapper. Defaults to 1280 (→ lg) pre-measure.
  const { width, containerRef } = useContainerWidth();

  const save = api.dashboard.saveLayout.useMutation({
    onSuccess: () => {
      setEditing(false);
      router.refresh();
    },
  });
  const reset = api.dashboard.resetLayout.useMutation({
    onSuccess: () => {
      setConfirmReset(false);
      setEditing(false);
      router.refresh();
    },
  });
  const setDefault = api.dashboard.setWorkspaceDefault.useMutation();

  const setEntrySetting = (widgetKey: string, settingKey: string, value: number) =>
    setDraft((d) =>
      d.map((e) =>
        e.widgetKey === widgetKey ? { ...e, settings: { ...e.settings, [settingKey]: value } } : e,
      ),
    );
  /** Replace a custom widget instance's whole settings object (its inline config). */
  const setEntrySettings = (widgetKey: string, settings: CustomSettings) =>
    setDraft((d) => d.map((e) => (e.widgetKey === widgetKey ? { ...e, settings } : e)));
  const addCustomWidget = () => setDraft((d) => [...d, { widgetKey: CUSTOM_KEY_PREFIX + ulid() }]);

  const startEdit = () => {
    setDraft(layout);
    setConfirmReset(false);
    setSettingsOpen(null);
    setEditing(true);
  };
  const cancel = () => {
    setDraft(layout);
    setConfirmReset(false);
    setEditing(false);
  };
  const onSave = () => save.mutate({ kind, workspaceId, widgets: draft });

  const entries = editing ? draft : layout;
  const draftKeys = draft.map((e) => e.widgetKey);
  const available = Object.keys(nodes).filter((k) => !draftKeys.includes(k));

  // The canonical (lg/3-col) RGL layout, derived from entries + their geometry.
  const lgLayout = useMemo(
    () =>
      buildGridLayout(
        entries.map((e) => ({ widgetKey: e.widgetKey, size: sizeOf(e.widgetKey), layout: e.layout })),
        GRID_COLS.lg,
      ),
    [entries],
  );

  // Fold RGL geometry changes back into the draft (edit mode only). Returns the
  // same array reference when nothing changed, so an idle re-render can't loop.
  const onLayoutChange = (current: Layout, all: ResponsiveLayouts) => {
    if (!editing) return;
    const lg = (all.lg as Layout | undefined) ?? current;
    const geo = geometryByKey(lg);
    setDraft((d) => {
      let changed = false;
      const next = d.map((e) => {
        const g = geo[e.widgetKey];
        if (g && (!e.layout || e.layout.x !== g.x || e.layout.y !== g.y || e.layout.w !== g.w || e.layout.h !== g.h)) {
          changed = true;
          return { ...e, layout: g };
        }
        return e;
      });
      return changed ? next : d;
    });
  };

  const grid =
    entries.length === 0 ? (
      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        No widgets — add some from the bar below, or reset to the default.
      </p>
    ) : (
      <div ref={containerRef}>
      <ResponsiveGridLayout
        className={cn("dashboard-rgl", editing && "is-editing")}
        width={width}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        layouts={{ lg: lgLayout }}
        rowHeight={GRID_ROW_HEIGHT}
        margin={GRID_MARGIN}
        compactor={verticalCompactor}
        dragConfig={{ enabled: editing, handle: ".rgl-drag-handle", cancel: ".rgl-no-drag" }}
        resizeConfig={{ enabled: editing }}
        onLayoutChange={onLayoutChange}
      >
        {entries.map((e) => {
          const id = e.widgetKey;
          const custom = isCustomKey(id);
          const meta = WIDGET_REGISTRY[id as keyof typeof WIDGET_REGISTRY];
          const label = custom ? "Custom widget" : (meta?.name ?? id);
          const hasSettings = (meta?.settings?.length ?? 0) > 0;
          const open = settingsOpen === id;

          if (!editing) {
            return (
              <div key={id} className="h-full overflow-auto">
                {custom ? (
                  <CustomWidget
                    kind={kind}
                    workspaceId={workspaceId}
                    settings={(e.settings ?? {}) as CustomSettings}
                    editing={false}
                    onConfig={() => {}}
                  />
                ) : (
                  nodes[id]
                )}
              </div>
            );
          }

          return (
            <div
              key={id}
              className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-2 py-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="rgl-drag-handle cursor-grab touch-none rounded-[var(--radius-sm)] p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] active:cursor-grabbing"
                    aria-hidden
                  >
                    <GripVertical className="size-4" />
                  </span>
                  <span className="truncate text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                    {label}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {hasSettings ? (
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(open ? null : id)}
                      aria-label={`Settings for ${label}`}
                      aria-expanded={open}
                      className="rgl-no-drag rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)]"
                    >
                      <Settings2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDraft(draft.filter((x) => x.widgetKey !== id))}
                    aria-label={`Remove ${label}`}
                    className="rgl-no-drag rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              </div>

              {hasSettings && open ? (
                <div className="rgl-no-drag flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2">
                  {meta!.settings!.map((spec) => (
                    <label
                      key={spec.key}
                      className="flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
                    >
                      {spec.label}
                      <select
                        value={Number(e.settings?.[spec.key] ?? spec.default)}
                        onChange={(ev) => setEntrySetting(id, spec.key, Number(ev.target.value))}
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-0.5 text-[var(--color-text-primary)]"
                      >
                        {spec.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}

              {/* Body. Custom widgets stay live (their config form); registry
                  previews are inert (drag is via the grip handle regardless). */}
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-auto p-2",
                  custom ? "rgl-no-drag" : "pointer-events-none",
                )}
              >
                {custom ? (
                  <CustomWidget
                    kind={kind}
                    workspaceId={workspaceId}
                    settings={(e.settings ?? {}) as CustomSettings}
                    editing
                    onConfig={(s) => setEntrySettings(id, s)}
                  />
                ) : (
                  nodes[id]
                )}
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
      </div>
    );

  // ---- View mode: the static grid + a Customize button. ----
  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            <Pencil className="size-3.5" aria-hidden />
            Customize
          </button>
        </div>
        {grid}
      </div>
    );
  }

  // ---- Edit mode: controls + the live grid + add palette + reset. ----
  return (
    <div className="flex flex-col gap-4">
      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
      >
        <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          Editing layout — drag by the grip, resize from the corner, add or remove widgets, then Save.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {kind === "workspace" && canSetWorkspaceDefault ? (
            <PendingButton
              variant="secondary"
              onClick={() => workspaceId && setDefault.mutate({ workspaceId, widgets: draft })}
              pending={setDefault.isPending}
              idleLabel={setDefault.isSuccess ? "Saved as default ✓" : "Set as workspace default"}
              pendingLabel="Setting…"
            />
          ) : null}
          <PendingButton onClick={onSave} pending={save.isPending} idleLabel="Save" pendingLabel="Saving…" />
          <button
            type="button"
            onClick={cancel}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)]"
          >
            Cancel
          </button>
        </div>
      </div>
      {save.error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger)]">
          Couldn’t save your layout — try again.
        </p>
      ) : null}

      {grid}

      {/* Add-widget bar — always shown: a custom widget can always be added. */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] p-3">
        <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]">
          Add a widget
        </span>
        <div className="flex flex-wrap gap-2">
          {available.map((k) => {
            const meta = WIDGET_REGISTRY[k as keyof typeof WIDGET_REGISTRY];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setDraft([...draft, { widgetKey: k }])}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                <Plus className="size-3.5" aria-hidden />
                {meta?.name ?? k}
              </button>
            );
          })}
          <button
            type="button"
            onClick={addCustomWidget}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-accent-text-on-subtle)] hover:opacity-90"
          >
            <Sparkles className="size-3.5" aria-hidden />
            Custom widget
          </button>
        </div>
      </div>

      {/* Reset to default. */}
      <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] pt-3">
        {confirmReset ? (
          <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)]">
            <span className="text-[var(--color-text-secondary)]">Replace your layout with the default?</span>
            <PendingButton
              variant="secondary"
              onClick={() => reset.mutate({ kind, workspaceId })}
              pending={reset.isPending}
              idleLabel="Reset"
              pendingLabel="Resetting…"
            />
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="text-[var(--color-text-muted)] underline hover:opacity-80"
            >
              Keep mine
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset to default
          </button>
        )}
      </div>
    </div>
  );
}
