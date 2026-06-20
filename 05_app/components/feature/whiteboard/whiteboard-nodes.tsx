"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  NodeToolbar,
  Position,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AlertTriangle, ArrowDown, ArrowUp, Flag, GitBranch, Grid2x2, LogOut, Plus, Settings2, ShieldCheck, Shuffle, SquareCheckBig, Trash2 } from "lucide-react";

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
      {/* Target handle: drop a Condition wire here to gate the whole group by arm. */}
      <Handle type="target" position={Position.Left} className="!size-2 !bg-[var(--color-primary)]" />
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

/* ---------- ADR-0057 execution-flow nodes (derived diagram) ----------
 * These render the DERIVED study flow (Start → screens → branches → terminals),
 * not the old free-placement wiring board. Top handle = inbound, bottom handle =
 * outbound, so the graph reads top-to-bottom. Tokens only (ADR-0007). */

const NODE_W = 240;

/** A colored condition chip (ADR-0057): label + its categorical palette colour. */
export type ConditionChip = { label: string; bg: string; text: string };

/** Condition chips for a screen ("all conditions" when shared), right-aligned for scanning. */
function ConditionChips({ conditions, allConditions }: { conditions?: ConditionChip[]; allConditions?: boolean }) {
  if (allConditions || !conditions || conditions.length === 0) {
    return (
      <span className="shrink-0 rounded-full bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        all conditions
      </span>
    );
  }
  const shown = conditions.slice(0, 3);
  const extra = conditions.length - shown.length;
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {shown.map((c) => (
        <span key={c.label} style={{ background: c.bg, color: c.text }} className="rounded-full px-1.5 py-0.5 text-[length:var(--text-small)] font-medium">
          {c.label}
        </span>
      ))}
      {extra > 0 ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">+{extra}</span> : null}
    </span>
  );
}

const inHandle = <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-[var(--color-border-subtle)]" />;
const outHandle = <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-0 !bg-[var(--color-border-subtle)]" />;

export type FlowStartData = { label: string };
export type FlowStartNode = Node<FlowStartData, "flowStart">;
export function FlowStartNode({ data }: NodeProps<FlowStartNode>) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]" style={{ boxShadow: "var(--shadow-sm)" }}>
      <Flag className="size-3.5 text-[var(--color-primary)]" aria-hidden />
      {data.label}
      {outHandle}
    </div>
  );
}

export type FlowConsentData = { label: string };
export type FlowConsentNode = Node<FlowConsentData, "flowConsent">;
export function FlowConsentNode({ data }: NodeProps<FlowConsentNode>) {
  return (
    <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]" style={{ boxShadow: "var(--shadow-sm)" }}>
      {inHandle}
      <ShieldCheck className="size-3.5 text-[var(--color-primary)]" aria-hidden />
      {data.label}
      <span className="text-[length:var(--text-small)] font-normal text-[var(--color-text-muted)]">· shown first</span>
      {outHandle}
    </div>
  );
}

export type FlowAssignCellData = { factors: string[]; cells: number };
export type FlowAssignCellNode = Node<FlowAssignCellData, "flowAssignCell">;
export function FlowAssignCellNode({ data }: NodeProps<FlowAssignCellNode>) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-2" style={{ width: NODE_W }}>
      {inHandle}
      <span className="flex items-center gap-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-accent-text-on-subtle)]">
        <Grid2x2 className="size-3.5" aria-hidden /> Assign variant cell
      </span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {data.cells} cell{data.cells === 1 ? "" : "s"} · {data.factors.join(" × ") || "no factors"}
      </span>
      {outHandle}
    </div>
  );
}

export type FlowAssignData = {
  conditions: { slug: string; label: string; bg: string; text: string }[];
  /** Currently focused condition (switcher) — null = none. */
  highlighted?: string | null;
  onToggle?: (slug: string) => void;
};
export type FlowAssignNode = Node<FlowAssignData, "flowAssign">;
export function FlowAssignNode({ data }: NodeProps<FlowAssignNode>) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-subtle)] px-3 py-2" style={{ width: NODE_W }}>
      {inHandle}
      <span className="flex items-center gap-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]">
        <Shuffle className="size-3.5" aria-hidden /> Random assignment
      </span>
      <span className="flex flex-wrap gap-1">
        {data.conditions.map((c) => {
          const dim = data.highlighted != null && data.highlighted !== c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              aria-pressed={data.highlighted === c.slug}
              title={`Focus the “${c.label}” path`}
              onClick={(e) => { e.stopPropagation(); data.onToggle?.(c.slug); }}
              style={{ background: c.bg, color: c.text, opacity: dim ? 0.4 : 1 }}
              className="rounded-full px-1.5 py-0.5 text-[length:var(--text-small)] font-medium ring-offset-1 hover:opacity-90 aria-pressed:ring-2 aria-pressed:ring-[var(--color-primary)]"
            >
              {c.label}
            </button>
          );
        })}
      </span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Click a condition to focus its path</span>
      {outHandle}
    </div>
  );
}

export type FlowScreenData = {
  title: string;
  blockCount: number;
  conditions?: ConditionChip[];
  allConditions?: boolean;
  incomplete?: boolean;
  unreachable?: boolean;
  /** Dimmed by the condition switcher (this screen isn't on the focused condition). */
  dimmed?: boolean;
  /** Swimlane "repeat" marker — this screen is shared across conditions (ADR-0057). */
  shared?: boolean;
  /** Editing affordances (chips view only); absent = read-only. */
  canEdit?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onAddAfter?: () => void;
  onDelete?: () => void;
};
export type FlowScreenNode = Node<FlowScreenData, "flowScreen">;

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || !onClick}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function FlowScreenNode({ data, selected }: NodeProps<FlowScreenNode>) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-canvas)] px-3 py-2"
      style={{
        width: NODE_W,
        border: `${selected ? 2 : 1}px solid ${selected ? "var(--color-primary)" : "var(--color-border-subtle)"}`,
        boxShadow: "var(--shadow-sm)",
        opacity: data.unreachable ? 0.5 : data.dimmed ? 0.4 : 1,
      }}
    >
      {data.canEdit ? (
        <NodeToolbar isVisible={selected} position={Position.Top} className="flex items-center gap-1">
          <ToolbarButton label="Move up" onClick={data.onMoveUp} disabled={data.isFirst}><ArrowUp className="size-3.5" aria-hidden /></ToolbarButton>
          <ToolbarButton label="Move down" onClick={data.onMoveDown} disabled={data.isLast}><ArrowDown className="size-3.5" aria-hidden /></ToolbarButton>
          <ToolbarButton label="Add a step after this" onClick={data.onAddAfter}><Plus className="size-3.5" aria-hidden /></ToolbarButton>
          <ToolbarButton label="Delete this screen" onClick={data.onDelete}><Trash2 className="size-3.5" aria-hidden /></ToolbarButton>
        </NodeToolbar>
      ) : null}
      {inHandle}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{data.title}</span>
        <ConditionChips conditions={data.conditions} allConditions={data.allConditions} />
      </div>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {data.blockCount} block{data.blockCount === 1 ? "" : "s"}
        {data.shared ? " · shared" : ""}
      </span>
      {data.incomplete ? (
        <span className="self-start rounded-full bg-[var(--color-warning-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">Needs setup</span>
      ) : null}
      {data.unreachable ? (
        <span className="flex items-center gap-1 self-start rounded-full bg-[var(--color-warning-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
          <AlertTriangle className="size-3" aria-hidden /> Unreachable
        </span>
      ) : null}
      {outHandle}
    </div>
  );
}

export type FlowBranchData = { summary: string; unreachable?: boolean; dimmed?: boolean };
export type FlowBranchNode = Node<FlowBranchData, "flowBranch">;
export function FlowBranchNode({ data, selected }: NodeProps<FlowBranchNode>) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
      style={{
        maxWidth: NODE_W,
        border: `${selected ? 2 : 1}px solid ${selected ? "var(--color-primary)" : "var(--color-border-subtle)"}`,
        opacity: data.unreachable ? 0.5 : data.dimmed ? 0.4 : 1,
      }}
    >
      {inHandle}
      <GitBranch className="size-3.5 shrink-0 text-[var(--color-primary)]" aria-hidden />
      <span className="truncate">if {data.summary}</span>
      {outHandle}
    </div>
  );
}

export type FlowTerminalData = { title: string; kind: "complete" | "early-exit"; redirectTo?: string | null; unreachable?: boolean; dimmed?: boolean };
export type FlowTerminalNode = Node<FlowTerminalData, "flowTerminal">;
export function FlowTerminalNode({ data }: NodeProps<FlowTerminalNode>) {
  const complete = data.kind === "complete";
  return (
    <div
      className="flex flex-col gap-0.5 rounded-full px-3 py-1.5 text-[length:var(--text-small)] font-medium"
      style={{
        background: complete ? "var(--color-success-subtle)" : "var(--color-warning-subtle)",
        color: complete ? "var(--color-success-text-on-subtle)" : "var(--color-warning-text-on-subtle)",
        opacity: data.unreachable ? 0.5 : data.dimmed ? 0.4 : 1,
        maxWidth: NODE_W,
      }}
    >
      {inHandle}
      <span className="flex items-center gap-1.5">
        {complete ? <SquareCheckBig className="size-3.5" aria-hidden /> : <LogOut className="size-3.5" aria-hidden />}
        {data.title}
      </span>
      {data.redirectTo ? <span className="truncate text-[length:var(--text-small)] font-normal opacity-80">→ {data.redirectTo}</span> : null}
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
