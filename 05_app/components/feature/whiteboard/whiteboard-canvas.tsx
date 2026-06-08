"use client";

import "@xyflow/react/dist/style.css";
import "./whiteboard-theme.css";

import {
  Background,
  Controls,
  type Connection,
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
import { conditionNodeId } from "@/lib/whiteboard/graph";
import { OPERATOR_LABELS, conditionWithSources } from "@/lib/whiteboard/conditions";
import type { StudyDetail } from "@/server/trpc/routers/studies";

import { BlockNode, ConditionEdge, ConditionNode, GroupNode } from "./whiteboard-nodes";

const nodeTypes = { block: BlockNode, condition: ConditionNode, group: GroupNode };
const edgeTypes = { condition: ConditionEdge };
const COND_PREFIX = "cond:";

export type WhiteboardCondition = { slug: string; name: string };

/**
 * Whiteboard canvas (ADR-0020). Blocks as nodes, visibility rules as wires.
 * Nodes are draggable (positions persist to whiteboard_viewport.nodePositions);
 * dragging a wire from a Condition node to a block adds that condition to the
 * block's visibility (`setBlockVisibility`); deleting a wire removes it. Block
 * structure round-trips through the Builder mutations (the parent owns those).
 */
export function WhiteboardCanvas({
  study,
  conditions,
  selectedId = null,
  onSelectBlock,
  onConnectCondition,
  onDisconnectCondition,
  onConnectBranch,
  onDisconnectBranch,
}: {
  study: StudyDetail;
  conditions: WhiteboardCondition[];
  selectedId?: string | null;
  onSelectBlock?: (instanceId: string | null) => void;
  onConnectCondition?: (blockId: string, slug: string) => void;
  onDisconnectCondition?: (blockId: string, slug: string) => void;
  /** Wire block→block: show `targetId` only if `sourceId`'s answer matches (ADR-0021). */
  onConnectBranch?: (targetId: string, sourceId: string) => void;
  onDisconnectBranch?: (targetId: string, sourceId: string) => void;
}) {
  const saved = study.whiteboardViewport.nodePositions ?? {};
  const condName = useMemo(() => {
    const m = new Map(conditions.map((c) => [c.slug, c.name]));
    return (slug: string) => m.get(slug) ?? slug;
  }, [conditions]);

  // Build nodes: all conditions (so you can wire from any) + all blocks.
  const computedNodes = useMemo<Node[]>(() => {
    const slugs: string[] = [];
    for (const c of conditions) if (!slugs.includes(c.slug)) slugs.push(c.slug);
    for (const b of study.blocks)
      for (const s of b.showIfCondition) if (!slugs.includes(s)) slugs.push(s);

    const condNodes: Node[] = slugs.map((slug, i) => {
      const id = conditionNodeId(slug);
      return {
        id,
        type: "condition",
        position: saved[id] ?? { x: 0, y: i * 110 },
        data: { label: `Condition: ${condName(slug)}` },
      };
    });
    const posOf = (id: string, i: number) => saved[id] ?? { x: 320, y: i * 120 };
    const blockNodes: Node[] = study.blocks.map((b, i) => ({
      id: b.instanceId,
      type: "block",
      position: posOf(b.instanceId, i),
      selected: b.instanceId === selectedId,
      zIndex: 1,
      data: { label: b.title?.trim() || b.name, ref: `${b.key} · ${b.version}`, complete: b.complete },
    }));

    // Group container boxes (ADR-0028 / grouping #5): a dashed box behind each
    // group, sized from its members' bounding box (works after manual drag too).
    const NW = 280, NH = 76, PAD = 16, HEADER = 20;
    const groupNodes: Node[] = study.groups
      .map((g) => {
        const members = study.blocks
          .map((b, i) => ({ b, i }))
          .filter((x) => x.b.groupId === g.id)
          .map((x) => posOf(x.b.instanceId, x.i));
        if (members.length === 0) return null;
        const minX = Math.min(...members.map((p) => p.x));
        const minY = Math.min(...members.map((p) => p.y));
        const maxX = Math.max(...members.map((p) => p.x + NW));
        const maxY = Math.max(...members.map((p) => p.y + NH));
        return {
          id: `group:${g.id}`,
          type: "group",
          position: { x: minX - PAD, y: minY - PAD - HEADER },
          draggable: false,
          selectable: false,
          zIndex: 0,
          data: { label: g.title ?? "Group" },
          style: { width: maxX - minX + 2 * PAD, height: maxY - minY + 2 * PAD + HEADER },
        } as Node;
      })
      .filter(Boolean) as Node[];

    return [...groupNodes, ...condNodes, ...blockNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study.blocks, study.groups, conditions, selectedId, JSON.stringify(saved), condName]);

  const computedEdges = useMemo<Edge[]>(
    () => [
      // Condition-arm wires (Condition node → block).
      ...study.blocks.flatMap((b) =>
        b.showIfCondition.map((slug) => ({
          id: `e:${slug}->${b.instanceId}`,
          source: conditionNodeId(slug),
          target: b.instanceId,
          markerEnd: { type: MarkerType.ArrowClosed },
        })),
      ),
      // Answer-based condition wires (block → block) from the effective condition,
      // one per clause, labelled op + value. Only clauses from EARLIER blocks are
      // valid (a forward clause left by a reorder is ignored — stays consistent).
      ...study.blocks.flatMap((b, bi) => {
        const earlier = new Set(study.blocks.slice(0, bi).map((x) => x.instanceId));
        const cond = conditionWithSources(b.showIf, b.branchRules, earlier);
        return (cond?.clauses ?? []).map((c, i) => ({
          id: `b:${c.fromInstanceId}->${b.instanceId}:${i}`,
          source: c.fromInstanceId,
          target: b.instanceId,
          type: "condition",
          // Flat ("answered") wires show just the gear; conditioned wires label it.
          // The gear opens the target block's condition editor (right panel).
          data: {
            label: c.operator === "answered" ? "" : `${OPERATOR_LABELS[c.operator]} ${c.value.join("/")}`.trim(),
            onEdit: () => onSelectBlock?.(b.instanceId),
          },
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "var(--color-primary)" },
        }));
      }),
    ],
    [study.blocks, onSelectBlock],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  // Re-sync when the study/conditions/selection change (add/remove/connect).
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
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      save.mutate({ studyId: study.id, nodePositions: { [node.id]: node.position } });
    },
    [save, study.id],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) =>
      typeof c.source === "string" &&
      typeof c.target === "string" &&
      // Target is always a block; source is a Condition (arm) or another block (branch).
      !c.target.startsWith(COND_PREFIX) &&
      c.source !== c.target,
    [],
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.target.startsWith(COND_PREFIX)) return;
      if (c.source.startsWith(COND_PREFIX)) {
        onConnectCondition?.(c.target, c.source.slice(COND_PREFIX.length));
      } else if (c.source !== c.target) {
        onConnectBranch?.(c.target, c.source); // block → block
      }
    },
    [onConnectCondition, onConnectBranch],
  );
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        if (e.source.startsWith(COND_PREFIX)) {
          onDisconnectCondition?.(e.target, e.source.slice(COND_PREFIX.length));
        } else {
          onDisconnectBranch?.(e.target, e.source); // block → block branch wire
        }
      }
    },
    [onDisconnectCondition, onDisconnectBranch],
  );

  const vp = study.whiteboardViewport;
  const defaultViewport =
    typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.zoom === "number"
      ? { x: vp.x, y: vp.y, zoom: vp.zoom }
      : undefined;

  if (study.blocks.length === 0) {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          No blocks yet — add some and they’ll appear here as a graph.
        </p>
      </div>
    );
  }

  return (
    <div className="wb-canvas h-[70vh] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        isValidConnection={isValidConnection}
        defaultViewport={defaultViewport}
        fitView={!defaultViewport}
        onMoveEnd={onMoveEnd}
        onNodeClick={(_, node) => onSelectBlock?.(node.type === "block" ? node.id : null)}
        onPaneClick={() => onSelectBlock?.(null)}
        nodesConnectable
        nodesDraggable
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
