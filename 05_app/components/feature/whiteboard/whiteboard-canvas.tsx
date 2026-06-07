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
import type { StudyDetail } from "@/server/trpc/routers/studies";

import { BlockNode, ConditionNode } from "./whiteboard-nodes";

const nodeTypes = { block: BlockNode, condition: ConditionNode };
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
}: {
  study: StudyDetail;
  conditions: WhiteboardCondition[];
  selectedId?: string | null;
  onSelectBlock?: (instanceId: string | null) => void;
  onConnectCondition?: (blockId: string, slug: string) => void;
  onDisconnectCondition?: (blockId: string, slug: string) => void;
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
    const blockNodes: Node[] = study.blocks.map((b, i) => ({
      id: b.instanceId,
      type: "block",
      position: saved[b.instanceId] ?? { x: 320, y: i * 120 },
      selected: b.instanceId === selectedId,
      data: { label: b.name, ref: b.ref, complete: b.complete },
    }));
    return [...condNodes, ...blockNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study.blocks, conditions, selectedId, JSON.stringify(saved), condName]);

  const computedEdges = useMemo<Edge[]>(
    () =>
      study.blocks.flatMap((b) =>
        b.showIfCondition.map((slug) => ({
          id: `e:${slug}->${b.instanceId}`,
          source: conditionNodeId(slug),
          target: b.instanceId,
          markerEnd: { type: MarkerType.ArrowClosed },
        })),
      ),
    [study.blocks],
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
      c.source.startsWith(COND_PREFIX) &&
      !c.target.startsWith(COND_PREFIX),
    [],
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !c.source.startsWith(COND_PREFIX)) return;
      onConnectCondition?.(c.target, c.source.slice(COND_PREFIX.length));
    },
    [onConnectCondition],
  );
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        if (e.source.startsWith(COND_PREFIX)) {
          onDisconnectCondition?.(e.target, e.source.slice(COND_PREFIX.length));
        }
      }
    },
    [onDisconnectCondition],
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
