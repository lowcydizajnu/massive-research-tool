"use client";

import { GripVertical, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SortableList } from "@/components/feature/whiteboard/sortable-list";
import { PendingButton } from "@/components/ui/pending-button";
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
}: {
  kind: "user" | "workspace";
  workspaceId?: string;
  /** The resolved, saved layout (order + settings). */
  layout: LayoutEntry[];
  /** Pre-rendered content for every widget valid on this dashboard, keyed by widget key. */
  nodes: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutEntry[]>(layout);
  const [confirmReset, setConfirmReset] = useState(false);

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
              {nodes[e.widgetKey]}
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
        <div className="flex items-center gap-2">
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
            return (
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <button
                      ref={handle.ref}
                      {...handle.attributes}
                      {...handle.listeners}
                      type="button"
                      aria-label={`Reorder ${meta?.name ?? id}`}
                      className="cursor-grab touch-none rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-canvas)] active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" aria-hidden />
                    </button>
                    <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                      {meta?.name ?? id}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraft(draft.filter((e) => e.widgetKey !== id))}
                    aria-label={`Remove ${meta?.name ?? id}`}
                    className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)]"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                {/* Non-interactive preview of the widget while editing. */}
                <div className="pointer-events-none p-3 opacity-90">{nodes[id]}</div>
              </div>
            );
          }}
        </SortableList>
      )}

      {/* Add-widget bar. */}
      {available.length > 0 ? (
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
          </div>
        </div>
      ) : null}

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
