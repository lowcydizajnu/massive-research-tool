"use client";

import "@xyflow/react/dist/style.css";
import "./whiteboard-theme.css";

import {
  Background,
  Controls,
  type Edge,
  type Node,
  MarkerType,
  ReactFlow,
  type Viewport,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { api } from "@/lib/trpc/react";
import { buildFlow, type FlowNode } from "@/lib/whiteboard/flow";
import type { BlockInstance } from "@/server/modules/blocks";
import type { StudyDetail } from "@/server/trpc/routers/studies";

import {
  FlowAssignNode,
  FlowBranchNode,
  FlowScreenNode,
  FlowStartNode,
  FlowTerminalNode,
} from "./whiteboard-nodes";

const nodeTypes = {
  flowStart: FlowStartNode,
  flowAssign: FlowAssignNode,
  flowScreen: FlowScreenNode,
  flowBranch: FlowBranchNode,
  flowTerminal: FlowTerminalNode,
};
const RF_TYPE: Record<FlowNode["kind"], keyof typeof nodeTypes> = {
  start: "flowStart",
  assign: "flowAssign",
  screen: "flowScreen",
  branch: "flowBranch",
  terminal: "flowTerminal",
};

export type WhiteboardCondition = { slug: string; name: string };

/**
 * Whiteboard canvas (ADR-0057) — the study rendered as a DERIVED execution-flow
 * diagram: Start → optional Random assignment → the ordered spine of screens
 * (with inline answer-branches that rejoin) → one or more terminals (Finish +
 * early-exit end-redirects). Auto-laid-out from the real structure (no free
 * placement); selecting a node opens its config in the parent's right panel.
 * Pan/zoom persist to `whiteboard_viewport.{x,y,zoom}`; node positions are
 * derived, never stored.
 */
export function WhiteboardCanvas({
  study,
  conditions,
  selectedId = null,
  onSelectBlock,
}: {
  study: StudyDetail;
  conditions: WhiteboardCondition[];
  selectedId?: string | null;
  /** Accepted for parity with the workspace call; structural edits are gated upstream. */
  editable?: boolean;
  onSelectBlock?: (instanceId: string | null) => void;
}) {
  const armName = useMemo(() => {
    const m = new Map(conditions.map((c) => [c.slug, c.name]));
    return (slug: string) => m.get(slug) ?? slug;
  }, [conditions]);

  const graph = useMemo(() => {
    const incomplete = new Set(study.blocks.filter((b) => !b.complete).map((b) => b.instanceId));
    const blocks: BlockInstance[] = study.blocks.map((b) => ({
      instanceId: b.instanceId,
      source: b.source,
      key: b.key,
      version: b.version,
      config: b.config,
      ...(b.title ? { title: b.title } : {}),
      ...(b.showIfCondition.length ? { visibility: { showIfCondition: b.showIfCondition } } : {}),
      ...(b.branchRules.length ? { branchRules: b.branchRules } : {}),
      ...(b.showIf ? { showIf: b.showIf } : {}),
      ...(b.groupId ? { groupId: b.groupId } : {}),
    }));
    const nameOf = (id: string) => {
      const b = study.blocks.find((x) => x.instanceId === id);
      return b ? b.title?.trim() || b.name : id;
    };
    return buildFlow({
      blocks,
      groups: study.groups,
      conditions: conditions.map((c) => ({ slug: c.slug, name: c.name })),
      nameOf,
      isIncomplete: (blk) => incomplete.has(blk.instanceId),
    });
  }, [study.blocks, study.groups, conditions]);

  // Map a flow node back to a selectable block instanceId for the config panel:
  // a single screen IS a block; a group screen / its branch selects its first member.
  const selectableFor = useCallback(
    (n: FlowNode): string | null => {
      if (!n.refId) return null;
      if (study.blocks.some((b) => b.instanceId === n.refId)) return n.refId;
      const first = study.blocks.find((b) => b.groupId === n.refId);
      return first?.instanceId ?? null;
    },
    [study.blocks],
  );

  const computedNodes = useMemo<Node[]>(
    () =>
      graph.nodes.map((n) => {
        const sel = (n.kind === "screen" || n.kind === "branch") && selectableFor(n) === selectedId && selectedId != null;
        return {
          id: n.id,
          type: RF_TYPE[n.kind],
          position: { x: n.x, y: n.y },
          selectable: n.kind !== "start",
          draggable: false,
          selected: sel,
          data:
            n.kind === "screen"
              ? {
                  title: n.title || "Untitled screen",
                  blockCount: n.blockCount ?? 0,
                  arms: (n.arms ?? []).map(armName),
                  allArms: n.allArms,
                  incomplete: n.incomplete,
                  unreachable: n.unreachable,
                }
              : n.kind === "branch"
                ? { summary: n.conditionSummary ?? "", unreachable: n.unreachable }
                : n.kind === "terminal"
                  ? { title: n.title ?? "Finish", kind: n.terminalKind ?? "complete", redirectTo: n.redirectTo, unreachable: n.unreachable }
                  : n.kind === "assign"
                    ? { arms: (n.assignArms ?? []).map((a) => a.name) }
                    : { label: n.title ?? "Start" },
        } as Node;
      }),
    [graph.nodes, selectedId, selectableFor, armName],
  );

  const computedEdges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.kind === "yes" ? "if" : e.kind === "no" ? "else" : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: e.kind === "no" ? "var(--color-text-muted)" : e.kind === "yes" ? "var(--color-primary)" : "var(--color-border-subtle)" },
        labelStyle: { fill: "var(--color-text-muted)", fontSize: 11 },
        labelBgStyle: { fill: "var(--color-surface-canvas)" },
      })),
    [graph.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);
  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges]);

  const save = api.studies.updateWhiteboardViewport.useMutation();
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      if (vpTimer.current) clearTimeout(vpTimer.current);
      vpTimer.current = setTimeout(() => save.mutate({ studyId: study.id, viewport }), 500);
    },
    [save, study.id],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const fn = graph.nodes.find((n) => n.id === node.id);
      onSelectBlock?.(fn ? selectableFor(fn) : null);
    },
    [graph.nodes, onSelectBlock, selectableFor],
  );

  const vp = study.whiteboardViewport;
  const defaultViewport =
    typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.zoom === "number"
      ? { x: vp.x, y: vp.y, zoom: vp.zoom }
      : undefined;

  return (
    <div className="wb-canvas h-[70vh] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        defaultViewport={defaultViewport}
        fitView={!defaultViewport}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelectBlock?.(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
