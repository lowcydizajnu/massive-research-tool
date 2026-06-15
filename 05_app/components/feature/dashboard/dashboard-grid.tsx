"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { GripVertical, Pencil, Plus, RotateCcw, Settings2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ulid } from "ulid";

import { CustomWidget, type CustomSettings } from "@/components/feature/dashboard/custom-widget";
import { PendingButton } from "@/components/ui/pending-button";
import { CUSTOM_KEY_PREFIX, isCustomKey } from "@/lib/dashboard/custom-sources";
import { SPAN_OPTIONS, spanFor, type WidgetGeometry } from "@/lib/dashboard/grid-layout";
import { WIDGET_REGISTRY, type WidgetSize } from "@/lib/dashboard/widget-registry";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Dashboard grid + customize mode (ADR-0045 + the flexible-grid amendment). The
 * RSC page pre-renders EVERY widget valid for this dashboard into `nodes`; this
 * island lays them on a flowing CSS grid — 1 column on mobile, 2 on tablet, 3 on
 * desktop. Each widget carries a column SPAN (1–3, "narrower/wider"); tile
 * height follows its content (no fixed cells → nothing truncates). View mode is
 * the grid as-is; Customize turns each tile into a dnd-kit sortable (drag by the
 * grip to reorder on the real grid, set width with the 1·2·3 control, remove,
 * per-widget settings, custom widgets). Save persists `{widgetKey, settings?,
 * layout?}[]` (span in `layout.w`, order = array order) — no migration.
 */

export type LayoutEntry = {
  widgetKey: string;
  settings?: Record<string, unknown>;
  layout?: WidgetGeometry;
};

const GRID_CLASS = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 items-start";

/** Static (JIT-safe) responsive col-span per stored span. 1 = default (1 col everywhere). */
const SPAN_CLASS: Record<number, string> = {
  1: "",
  2: "md:col-span-2 xl:col-span-2",
  3: "md:col-span-2 xl:col-span-3",
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
  /** The resolved, saved layout (order + settings + span). */
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
  const setEntrySettings = (widgetKey: string, settings: CustomSettings) =>
    setDraft((d) => d.map((e) => (e.widgetKey === widgetKey ? { ...e, settings } : e)));
  const setEntrySpan = (widgetKey: string, w: number) =>
    setDraft((d) => d.map((e) => (e.widgetKey === widgetKey ? { ...e, layout: { ...e.layout, w } } : e)));
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

  const draftKeys = draft.map((e) => e.widgetKey);
  const available = Object.keys(nodes).filter((k) => !draftKeys.includes(k));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = draftKeys.indexOf(String(active.id));
    const to = draftKeys.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    setDraft((d) => {
      const next = [...d];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // ---- View mode: the flowing grid + a Customize button. ----
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
        <div className={GRID_CLASS}>
          {layout.map((e) => (
            <div key={e.widgetKey} className={cn("min-w-0", SPAN_CLASS[spanFor(sizeOf(e.widgetKey), e.layout)])}>
              {isCustomKey(e.widgetKey) ? (
                <CustomWidget
                  kind={kind}
                  workspaceId={workspaceId}
                  settings={(e.settings ?? {}) as CustomSettings}
                  editing={false}
                  onConfig={() => {}}
                />
              ) : (
                nodes[e.widgetKey]
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Edit mode: controls + the live grid (drag/resize/remove) + add + reset. ----
  return (
    <div className="flex flex-col gap-4">
      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
      >
        <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          Editing layout — drag by the grip to reorder, set width with 1·2·3, add or remove widgets, then Save.
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

      {draftKeys.length === 0 ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          No widgets — add some from the bar below, or reset to the default.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={draftKeys} strategy={rectSortingStrategy}>
            <div className={GRID_CLASS}>
              {draft.map((e) => (
                <EditTile
                  key={e.widgetKey}
                  entry={e}
                  kind={kind}
                  workspaceId={workspaceId}
                  node={nodes[e.widgetKey]}
                  open={settingsOpen === e.widgetKey}
                  onToggleSettings={(id) => setSettingsOpen((cur) => (cur === id ? null : id))}
                  onRemove={(id) => setDraft((d) => d.filter((x) => x.widgetKey !== id))}
                  onSetSetting={setEntrySetting}
                  onSetSettings={setEntrySettings}
                  onSetSpan={setEntrySpan}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

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

/** One editable tile: a dnd-kit sortable cell with grip / width control / settings / remove. */
function EditTile({
  entry,
  kind,
  workspaceId,
  node,
  open,
  onToggleSettings,
  onRemove,
  onSetSetting,
  onSetSettings,
  onSetSpan,
}: {
  entry: LayoutEntry;
  kind: "user" | "workspace";
  workspaceId?: string;
  node: ReactNode;
  open: boolean;
  onToggleSettings: (id: string) => void;
  onRemove: (id: string) => void;
  onSetSetting: (id: string, key: string, value: number) => void;
  onSetSettings: (id: string, settings: CustomSettings) => void;
  onSetSpan: (id: string, w: number) => void;
}) {
  const id = entry.widgetKey;
  const custom = isCustomKey(id);
  const meta = WIDGET_REGISTRY[id as keyof typeof WIDGET_REGISTRY];
  const label = custom ? "Custom widget" : (meta?.name ?? id);
  const hasSettings = (meta?.settings?.length ?? 0) > 0;
  const span = spanFor(custom ? "medium" : (meta?.size ?? "medium"), entry.layout);

  const { setNodeRef, setActivatorNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id,
  });
  // Translate only (never scale) so a tile keeps its size while dragging.
  const style: CSSProperties = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("min-w-0", SPAN_CLASS[span], isDragging && "opacity-60")}>
      <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-2 py-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              type="button"
              aria-label={`Drag ${label} to reorder`}
              className="cursor-grab touch-none rounded-[var(--radius-sm)] p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
            <span className="truncate text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
              {label}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              role="group"
              aria-label={`Width of ${label}`}
              className="flex items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]"
            >
              {SPAN_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSetSpan(id, n)}
                  aria-pressed={span === n}
                  aria-label={`${n} column${n > 1 ? "s" : ""} wide`}
                  className={cn(
                    "px-1.5 py-0.5 text-[length:var(--text-small)] font-medium",
                    span === n
                      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)]",
                  )}
                >
                  {n}
                </button>
              ))}
            </span>
            {hasSettings ? (
              <button
                type="button"
                onClick={() => onToggleSettings(id)}
                aria-label={`Settings for ${label}`}
                aria-expanded={open}
                className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)]"
              >
                <Settings2 className="size-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${label}`}
              className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        </div>

        {hasSettings && open ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2">
            {meta!.settings!.map((spec) => (
              <label
                key={spec.key}
                className="flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
              >
                {spec.label}
                <select
                  value={Number(entry.settings?.[spec.key] ?? spec.default)}
                  onChange={(ev) => onSetSetting(id, spec.key, Number(ev.target.value))}
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

        {/* Auto-height body — content shows in full (no truncation). Custom
            widgets stay live (config form); registry previews are inert. */}
        <div className="p-2">
          {custom ? (
            <CustomWidget
              kind={kind}
              workspaceId={workspaceId}
              settings={(entry.settings ?? {}) as CustomSettings}
              editing
              onConfig={(s) => onSetSettings(id, s)}
            />
          ) : (
            <div className="pointer-events-none">{node}</div>
          )}
        </div>
      </div>
    </div>
  );
}
