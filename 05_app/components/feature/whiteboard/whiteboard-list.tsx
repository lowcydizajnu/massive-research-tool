"use client";

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
}: {
  blocks: StudyBlock[];
  selectedId: string | null;
  onSelect: (instanceId: string) => void;
}) {
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
          <li key={b.instanceId}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(b.instanceId)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-md)] border p-3 text-left",
                active
                  ? "border-l-2 border-l-[var(--color-primary)] border-[var(--color-border-subtle)] bg-[var(--color-primary-subtle)]"
                  : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {i + 1}.
                </span>
                <span className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {b.name}
                </span>
                {b.complete === false ? (
                  <span className="rounded-full bg-[var(--color-danger-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
                    Needs setup
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                {b.ref}
              </span>
              {b.showIfCondition.length > 0 ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  Shown only if: {b.showIfCondition.join(", ")}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
