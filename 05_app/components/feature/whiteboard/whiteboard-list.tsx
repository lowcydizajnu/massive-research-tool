"use client";

import { GripVertical } from "lucide-react";

import { conditionWithSources, summarizeCondition } from "@/lib/whiteboard/conditions";
import { cn } from "@/lib/utils";
import type { StudyBlock } from "@/server/trpc/routers/studies";

import { SortableList } from "./sortable-list";

/**
 * Accessible list fallback for the Whiteboard canvas (ADR-0020 §A7). React Flow
 * is hard for screen readers, so this renders the same blocks as a flat list
 * (each row opens the shared Configure panel). Drag-to-reorder is the dnd-kit
 * sortable (ADR-0022) — keyboard-accessible, animated; only the grip drags.
 */
export function WhiteboardList({
  blocks,
  groups = [],
  selectedId,
  onSelect,
  onReorder,
}: {
  blocks: StudyBlock[];
  groups?: { id: string; title?: string }[];
  selectedId: string | null;
  onSelect: (instanceId: string) => void;
  /** Commit a new block order (drag-to-reorder). `movedId` = the dragged block. */
  onReorder?: (order: string[], movedId: string) => void;
}) {
  const nameOf = (id: string) => {
    const b = blocks.find((x) => x.instanceId === id);
    return b ? b.title?.trim() || b.name : id;
  };

  if (blocks.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          No blocks yet — “Add block” to start.
        </p>
      </div>
    );
  }

  return (
    <SortableList
      ids={blocks.map((b) => b.instanceId)}
      onReorder={(ids, movedId) => onReorder?.(ids, movedId)}
      ariaLabel="Study blocks"
      className="flex flex-col gap-2"
    >
      {(id, handle) => {
        const i = blocks.findIndex((b) => b.instanceId === id);
        const b = blocks[i];
        if (!b) return null;
        const active = b.instanceId === selectedId;
        const earlier = new Set(blocks.slice(0, i).map((x) => x.instanceId));
        const summary = summarizeCondition(conditionWithSources(b.showIf, b.branchRules, earlier), nameOf);
        const grouped = !!b.groupId;
        const groupStart = grouped && (i === 0 || blocks[i - 1].groupId !== b.groupId);
        const groupTitle = grouped ? groups.find((g) => g.id === b.groupId)?.title : null;
        return (
          <div className="flex flex-col gap-2">
            {groupStart ? (
              <span className="pl-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                ⊞ {groupTitle || "Group"}
              </span>
            ) : null}
          <div
            className={cn(
              "flex items-stretch gap-1 rounded-[var(--radius-md)] border",
              grouped && "ml-2 border-l-2 border-l-[var(--color-primary)]",
              active
                ? "border-l-2 border-l-[var(--color-primary)] border-[var(--color-border-subtle)] bg-[var(--color-primary-subtle)]"
                : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            <span
              ref={handle.ref}
              {...handle.attributes}
              {...handle.listeners}
              aria-label="Drag to reorder"
              className="flex cursor-grab touch-none items-center px-1 text-[var(--color-text-muted)] active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </span>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(b.instanceId)}
              className="flex w-full flex-col items-start gap-0.5 p-3 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{i + 1}.</span>
                <span className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {b.title?.trim() || b.name}
                </span>
                {b.complete === false ? (
                  <span className="rounded-full bg-[var(--color-danger-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
                    Needs setup
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                {b.key} · {b.version}
              </span>
              {b.showIfCondition.length > 0 ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  Arm: {b.showIfCondition.join(", ")}
                </span>
              ) : null}
              {summary ? (
                <span className="rounded-full bg-[var(--color-primary-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
                  Shown if {summary}
                </span>
              ) : null}
            </button>
          </div>
          </div>
        );
      }}
    </SortableList>
  );
}
