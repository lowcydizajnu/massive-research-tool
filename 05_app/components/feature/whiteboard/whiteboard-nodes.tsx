"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

/**
 * Custom React Flow nodes for the Whiteboard (ADR-0020). Block nodes mirror the
 * Builder block-list card (Plex Serif title + mono ref + status); condition
 * entry-points are the wire origins for visibility rules. Themed with our
 * tokens via the node classes (vendor styling stays isolated, ADR-0007).
 */
export type BlockNodeData = { label: string; ref?: string; complete?: boolean };
export type ConditionNodeData = { label: string };

export type BlockNodeType = Node<BlockNodeData, "block">;
export type ConditionNodeType = Node<ConditionNodeData, "condition">;

export function BlockNode({ data, selected }: NodeProps<BlockNodeType>) {
  return (
    <div
      className="flex min-w-[180px] max-w-[240px] flex-col gap-0.5 rounded-[var(--radius-md)] border bg-[var(--color-surface-canvas)] px-3 py-2"
      style={{
        borderColor: selected ? "var(--color-primary)" : "var(--color-border-subtle)",
        borderWidth: selected ? 2 : 1,
        boxShadow: "var(--shadow-sm)",
      }}
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
      {data.complete === false ? (
        <span className="mt-1 self-start rounded-full bg-[var(--color-danger-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Needs setup
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function ConditionNode({ data }: NodeProps<ConditionNodeType>) {
  return (
    <div className="rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
      {data.label}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
