"use client";

import { GripVertical } from "lucide-react";
import { useState } from "react";

import { move } from "@/lib/whiteboard/reorder";
import { conditionWithSources, summarizeCondition } from "@/lib/whiteboard/conditions";
import { cn } from "@/lib/utils";
import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Accessible list fallback for the Whiteboard canvas (ADR-0020 §A7). React Flow
 * is hard for screen readers, so this renders the same blocks as a flat ordered
 * list of native buttons (Tab + Enter), each opening the shared Configure panel.
 * Visibility rules are shown as plain text, not wires.
 */
export function WhiteboardList({
  blocks,
  selectedId,
  onSelect,
  onReorder,
}: {
  blocks: StudyBlock[];
  selectedId: string | null;
  onSelect: (instanceId: string) => void;
  /** Commit a new block order (drag-to-reorder). */
  onReorder?: (order: string[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const nameOf = (id: string) => {
    const b = blocks.find((x) => x.instanceId === id);
    return b ? b.title?.trim() || b.name : id;
  };
  const drop = (to: number) => {
    const from = dragIdx;
    setDragIdx(null);
    setOverIdx(null);
    if (from === null || from === to) return;
    onReorder?.(move(blocks, from, to).map((b) => b.instanceId));
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
    <ol aria-label="Study blocks" className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        const active = b.instanceId === selectedId;
        return (
          <li
            key={b.instanceId}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIdx !== i) setOverIdx(i);
            }}
            onDrop={() => drop(i)}
            className={cn(
              "rounded-[var(--radius-md)] transition-[margin,opacity] duration-150",
              dragIdx === i && "opacity-40",
              overIdx === i && dragIdx !== null && dragIdx !== i && "mt-6",
            )}
          >
            {overIdx === i && dragIdx !== null && dragIdx !== i ? (
              <div className="-mt-4 mb-2 h-0.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
            ) : null}
            <div
              className={cn(
                "flex items-stretch gap-1 rounded-[var(--radius-md)] border",
                active
                  ? "border-l-2 border-l-[var(--color-primary)] border-[var(--color-border-subtle)] bg-[var(--color-primary-subtle)]"
                  : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              <span
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                aria-label="Drag to reorder"
                className="flex cursor-grab items-center px-1 text-[var(--color-text-muted)] active:cursor-grabbing"
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
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {i + 1}.
                  </span>
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
              {(() => {
                const earlier = new Set(blocks.slice(0, i).map((x) => x.instanceId));
                const summary = summarizeCondition(
                  conditionWithSources(b.showIf, b.branchRules, earlier),
                  nameOf,
                );
                return summary ? (
                  <span className="rounded-full bg-[var(--color-primary-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-primary-text-on-subtle)]">
                    Shown if {summary}
                  </span>
                ) : null;
              })()}
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
