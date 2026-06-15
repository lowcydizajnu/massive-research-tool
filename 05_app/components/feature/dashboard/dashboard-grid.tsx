"use client";

import { GripVertical, Pencil, Plus, RotateCcw, Settings2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ulid } from "ulid";

import { CustomWidget, type CustomSettings } from "@/components/feature/dashboard/custom-widget";
import { SortableList } from "@/components/feature/whiteboard/sortable-list";
import { PendingButton } from "@/components/ui/pending-button";
import { CUSTOM_KEY_PREFIX, isCustomKey } from "@/lib/dashboard/custom-sources";
import { WIDGET_REGISTRY } from "@/lib/dashboard/widget-registry";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Dashboard grid + customize mode (ADR-0045 / dashboard-customize-mode.md,
 * V1.13.0 Stream F / N5.2). The RSC page resolves the layout and pre-renders
 * EVERY widget valid for this dashboard into `nodes` (keyed by widget key); this
 * client island shows the saved order in view mode and, in edit mode, lets the
 * user reorder (drag, keyboard), remove, and add widgets — staged client-side
 * until Save. Because every node is pre-rendered, add/remove preview instantly;
 * Save persists via `dashboard.saveLayout` and `router.refresh()` re-resolves
 * server-side (also applying any per-widget settings, N5.3). Reset clears the
 * user's override. The per-widget settings gear + the workspace-admin default
 * are N5.3.
 */

export type LayoutEntry = { widgetKey: string; settings?: Record<string, unknown> };

export function DashboardGrid({
  kind,
  workspaceId,
  layout,
  nodes,
  canSetWorkspaceDefault = false,
}: {
  kind: "user" | "workspace";
  workspaceId?: string;
  /** The resolved, saved layout (order + settings). */
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

  // ---- View mode: the masonry, exactly as shipped (full-width widgets span). ----
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
        <div className="columns-1 gap-4 lg:columns-2">
          {layout.map((e) => (
            <div
              key={e.widgetKey}
              className={cn(
                "mb-4 break-inside-avoid",
                WIDGET_REGISTRY[e.widgetKey as keyof typeof WIDGET_REGISTRY]?.size === "full" &&
                  "[column-span:all]",
              )}
            >
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

  // ---- Edit mode: a vertical sortable list + an Add palette. ----
  return (
    <div className="flex flex-col gap-4">
      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-2"
      >
        <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          Editing layout — drag to reorder, remove or add widgets, then Save.
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
          <PendingButton
            onClick={onSave}
            pending={save.isPending}
            idleLabel="Save"
            pendingLabel="Saving…"
          />
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
        <SortableList
          ids={draftKeys}
          ariaLabel="Dashboard widgets"
          className="flex flex-col gap-3"
          onReorder={(ids) =>
            setDraft(ids.map((k) => draft.find((e) => e.widgetKey === k)!).filter(Boolean) as LayoutEntry[])
          }
        >
          {(id, handle) => {
            const meta = WIDGET_REGISTRY[id as keyof typeof WIDGET_REGISTRY];
            const entry = draft.find((e) => e.widgetKey === id);
            const custom = isCustomKey(id);
            const label = custom ? "Custom widget" : (meta?.name ?? id);
            const hasSettings = (meta?.settings?.length ?? 0) > 0;
            const open = settingsOpen === id;
            return (
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <button
                      ref={handle.ref}
                      {...handle.attributes}
                      {...handle.listeners}
                      type="button"
                      aria-label={`Reorder ${label}`}
                      className="cursor-grab touch-none rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" aria-hidden />
                    </button>
                    <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
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
                        className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)]"
                      >
                        <Settings2 className="size-4" aria-hidden />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDraft(draft.filter((e) => e.widgetKey !== id))}
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
                          value={Number(entry?.settings?.[spec.key] ?? spec.default)}
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
                {/* Preview while editing. Registry widgets are inert; a custom
                    widget stays live so its inline source/params form works. */}
                {custom ? (
                  <div className="p-3">
                    <CustomWidget
                      kind={kind}
                      workspaceId={workspaceId}
                      settings={(entry?.settings ?? {}) as CustomSettings}
                      editing
                      onConfig={(s) => setEntrySettings(id, s)}
                    />
                  </div>
                ) : (
                  <div className="pointer-events-none p-3 opacity-90">{nodes[id]}</div>
                )}
              </div>
            );
          }}
        </SortableList>
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
            <span className="text-[var(--color-text-secondary)]">
              Replace your layout with the default?
            </span>
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
