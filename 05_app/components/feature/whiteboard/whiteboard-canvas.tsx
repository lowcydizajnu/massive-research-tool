"use client";

import "@xyflow/react/dist/style.css";
import "./whiteboard-theme.css";

import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  ReactFlow,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useMemo, useRef } from "react";

import { api } from "@/lib/trpc/react";
import { deriveGraph } from "@/lib/whiteboard/graph";
import type { StudyDetail } from "@/server/trpc/routers/studies";

import { BlockNode, ConditionNode } from "./whiteboard-nodes";

const nodeTypes = { block: BlockNode, condition: ConditionNode };

/**
 * Whiteboard canvas (ADR-0020). Renders the study as a directed graph — blocks
 * as nodes, visibility rules as wires — over `definition_snapshot.blocks`
 * (translation layer, not a new model). Pan/zoom is debounce-persisted to the
 * autosave tip's `whiteboard_viewport` so the canvas reopens where it was left.
 * Read/structure view here; block edits round-trip through the Builder (A5).
 */
export function WhiteboardCanvas({ study }: { study: StudyDetail }) {
  const graph = useMemo(() => deriveGraph(study.blocks), [study.blocks]);

  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data:
          n.kind === "block"
            ? { label: n.label, ref: n.ref, complete: n.complete }
            : { label: n.label },
      })),
    [graph],
  );

  const edges: Edge[] = useMemo(
    () => graph.edges.map((e) => ({ ...e, markerEnd: { type: MarkerType.ArrowClosed } })),
    [graph],
  );

  const vp = study.whiteboardViewport;
  const defaultViewport =
    typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.zoom === "number"
      ? { x: vp.x, y: vp.y, zoom: vp.zoom }
      : undefined;

  const save = api.studies.updateWhiteboardViewport.useMutation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        save.mutate({ studyId: study.id, viewport });
      }, 500);
    },
    [save, study.id],
  );

  if (study.blocks.length === 0) {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          No blocks yet — add some in Builder mode and they’ll appear here as a graph.
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
        defaultViewport={defaultViewport}
        fitView={!defaultViewport}
        onMoveEnd={onMoveEnd}
        nodesConnectable={false}
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
