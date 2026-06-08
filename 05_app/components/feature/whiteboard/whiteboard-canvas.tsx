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
const GROUP_PREFIX = "group:";
// Canvas layout (ADR-0028 amendment): NW/NH = block node box; PAD/HEADER = group
// container insets; GAP/VGAP = vertical rhythm; COLX = block column x.
const NW = 280, NH = 76, PAD = 16, HEADER = 26, GAP = 92, COLX = 320, VGAP = 40;

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
  onRegroup,
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
  /** Drag a block into a group container (groupId) or out (null) — ADR-0028. */
  onRegroup?: (blockId: string, groupId: string | null) => void;
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
    // Groups render as real React Flow container (parent) nodes with member
    // blocks as children (ADR-0028 amendment): native nesting + group-as-unit
    // drag. Children carry relative positions; containers + ungrouped blocks are
    // absolute. Default layout stacks top-level items (a group or a lone block)
    // vertically; the parent MUST precede its children in the array.
    const blockData = (b: (typeof study.blocks)[number]) => ({
      label: b.title?.trim() || b.name,
      ref: `${b.key} · ${b.version}`,
      complete: b.complete,
    });

    const groupNodes: Node[] = [];
    const childNodes: Node[] = [];
    const ungroupedNodes: Node[] = [];
    const seenGroup = new Set<string>();
    let y = 0;
    for (const b of study.blocks) {
      if (b.groupId) {
        if (seenGroup.has(b.groupId)) continue;
        seenGroup.add(b.groupId);
        const g = study.groups.find((x) => x.id === b.groupId);
        const members = study.blocks.filter((x) => x.groupId === b.groupId);
        const containerId = `group:${b.groupId}`;
        const height = HEADER + members.length * GAP + PAD;
        groupNodes.push({
          id: containerId,
          type: "group",
          position: saved[containerId] ?? { x: COLX, y },
          draggable: true,
          selectable: false,
          zIndex: 0,
          data: { label: g?.title ?? "Group" },
          style: { width: NW + 2 * PAD, height },
        } as Node);
        members.forEach((m, mi) =>
          childNodes.push({
            id: m.instanceId,
            type: "block",
            parentId: containerId,
            // No `extent: "parent"` — a child must be draggable OUT of the box to
            // ungroup. Children auto-stack (relative position, never persisted),
            // so re-parenting on drop is unambiguous (ADR-0028 amendment).
            position: { x: PAD, y: HEADER + mi * GAP },
            selected: m.instanceId === selectedId,
            zIndex: 1,
            data: blockData(m),
          } as Node),
        );
        y += height + VGAP;
      } else {
        ungroupedNodes.push({
          id: b.instanceId,
          type: "block",
          position: saved[b.instanceId] ?? { x: COLX, y },
          selected: b.instanceId === selectedId,
          zIndex: 1,
          data: blockData(b),
        });
        y += NH + VGAP;
      }
    }

    // Parent (group) nodes before their children; conditions + ungrouped after.
    return [...groupNodes, ...childNodes, ...condNodes, ...ungroupedNodes];
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
      // Group container moved as a unit → just persist its position.
      if (node.type === "group") {
        save.mutate({ studyId: study.id, nodePositions: { [node.id]: node.position } });
        return;
      }
      if (node.type !== "block") return;

      // Absolute centre of the dropped block (child positions are parent-relative).
      const parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : null;
      const cx = (parent?.position.x ?? 0) + node.position.x + NW / 2;
      const cy = (parent?.position.y ?? 0) + node.position.y + NH / 2;

      // Which group container (if any) is under the drop point?
      const container = nodes.find((n) => {
        if (n.type !== "group") return false;
        const w = Number(n.style?.width) || 0;
        const h = Number(n.style?.height) || 0;
        return cx >= n.position.x && cx <= n.position.x + w && cy >= n.position.y && cy <= n.position.y + h;
      });
      const targetGroup = container ? container.id.slice(GROUP_PREFIX.length) : null;
      const currentGroup = study.blocks.find((b) => b.instanceId === node.id)?.groupId ?? null;

      if (targetGroup !== currentGroup) {
        onRegroup?.(node.id, targetGroup);
        // Leaving a group: keep the block where it was dropped (absolute).
        if (targetGroup === null) {
          save.mutate({ studyId: study.id, nodePositions: { [node.id]: { x: cx - NW / 2, y: cy - NH / 2 } } });
        }
        return; // joining/moving group → re-layout (don't persist a stale position)
      }
      // Same group: persist free moves of ungrouped blocks; grouped members re-stack.
      if (currentGroup === null) {
        save.mutate({ studyId: study.id, nodePositions: { [node.id]: node.position } });
      }
    },
    [save, study.id, nodes, study.blocks, onRegroup],
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
