"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { CompareStatus } from "@/server/trpc/routers/studies";

/**
 * Diff-colored block node for the multi-version compare (ADR-0020 §A6).
 * added = green, removed = red, modified = amber, unchanged = neutral. Color is
 * never the only signal — the status word shows on the node too (a11y).
 */
export type CompareNodeData = {
  label: string;
  ref?: string;
  status: CompareStatus;
  /** Modified nodes: human-readable lines of what changed inside the config. */
  changes?: string[];
};
export type CompareNodeType = Node<CompareNodeData, "compareBlock">;

/** Change lines rendered on the node before collapsing to "+ n more". */
const MAX_CHANGE_LINES = 5;

const STYLE: Record<CompareStatus, { border: string; chipBg: string; chipText: string; word: string }> = {
  added: {
    border: "var(--color-success, #15803d)",
    chipBg: "var(--color-success-subtle, #dcfce7)",
    chipText: "var(--color-success-text-on-subtle, #166534)",
    word: "Added",
  },
  removed: {
    border: "var(--color-danger, #b91c1c)",
    chipBg: "var(--color-danger-subtle)",
    chipText: "var(--color-danger-text-on-subtle)",
    word: "Removed",
  },
  modified: {
    border: "var(--color-warning, #b45309)",
    chipBg: "var(--color-warning-subtle, #fef3c7)",
    chipText: "var(--color-warning-text-on-subtle, #92400e)",
    word: "Modified",
  },
  unchanged: {
    border: "var(--color-border-subtle)",
    chipBg: "var(--color-surface-subtle)",
    chipText: "var(--color-text-muted)",
    word: "Unchanged",
  },
};

export function CompareBlockNode({ data }: NodeProps<CompareNodeType>) {
  const s = STYLE[data.status];
  return (
    <div
      className="flex min-w-[170px] max-w-[260px] flex-col gap-0.5 rounded-[var(--radius-md)] bg-[var(--color-surface-canvas)] px-3 py-2"
      style={{ border: `2px solid ${s.border}`, boxShadow: "var(--shadow-sm)" }}
    >
      <Handle type="target" position={Position.Left} />
      <span className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        {data.label}
      </span>
      {data.ref ? (
        <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
          {data.ref}
        </span>
      ) : null}
      <span
        className="mt-1 self-start rounded-full px-1.5 py-0.5 text-[length:var(--text-small)]"
        style={{ backgroundColor: s.chipBg, color: s.chipText }}
      >
        {s.word}
      </span>
      {data.changes && data.changes.length > 0 ? (
        <ul
          className="mt-1 flex flex-col gap-0.5 border-t pt-1"
          style={{ borderColor: "var(--color-border-subtle)" }}
          title={data.changes.join("\n")}
        >
          {data.changes.slice(0, MAX_CHANGE_LINES).map((line, i) => (
            <li
              key={i}
              title={line}
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--text-small)] leading-snug text-[var(--color-text-secondary)]"
            >
              {line}
            </li>
          ))}
          {data.changes.length > MAX_CHANGE_LINES ? (
            <li className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              + {data.changes.length - MAX_CHANGE_LINES} more
            </li>
          ) : null}
        </ul>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
