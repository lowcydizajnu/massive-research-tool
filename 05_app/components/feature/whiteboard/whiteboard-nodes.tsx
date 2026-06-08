"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Position,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Settings2 } from "lucide-react";

/**
 * Custom React Flow nodes for the Whiteboard (ADR-0020). Block nodes mirror the
 * Builder block-list card (Plex Serif title + mono ref + status); condition
 * entry-points are the wire origins for visibility rules. Themed with our
 * tokens via the node classes (vendor styling stays isolated, ADR-0007).
 */
export type BlockNodeData = { label: string; ref?: string; complete?: boolean };
export type ConditionNodeData = { label: string };
export type GroupNodeData = { label: string };

export type BlockNodeType = Node<BlockNodeData, "block">;
export type ConditionNodeType = Node<ConditionNodeData, "condition">;
export type GroupNodeType = Node<GroupNodeData, "group">;

/** Container box behind a question group's member nodes (ADR-0028 / grouping #5).
 *  Sized + positioned by the canvas from the members' bounding box; non-
 *  interactive (the members are the draggable nodes). */
export function GroupNode({ data }: NodeProps<GroupNodeType>) {
  return (
    <div className="relative h-full w-full rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-primary)] bg-[var(--color-primary-subtle)] opacity-60">
      <span className="absolute left-2 top-1 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]">
        ⊞ {data.label || "Group"}
      </span>
    </div>
  );
}

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

/** Edge data for answer-condition wires — the label chip + the gear's action. */
export type ConditionEdgeData = { label?: string; onEdit?: () => void };

/**
 * Answer-condition wire with a settings gear on it (ADR-0021 amendment). The
 * chip shows the condition summary (blank for a flat link); clicking the gear
 * opens the target block's condition editor in the right panel.
 */
export function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const d = data as ConditionEdgeData | undefined;
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan wb-edge-chip"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          {d?.label ? <span className="wb-edge-chip-label">{d.label}</span> : null}
          <button
            type="button"
            aria-label="Edit condition"
            title="Edit condition"
            onClick={(e) => {
              e.stopPropagation();
              d?.onEdit?.();
            }}
            className="wb-edge-chip-gear"
          >
            <Settings2 className="size-3" aria-hidden />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
