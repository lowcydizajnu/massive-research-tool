"use client";

import "@xyflow/react/dist/style.css";
import "./whiteboard-theme.css";

import { Background, Controls, type Edge, MarkerType, type Node, ReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";

import { conditionNodeId } from "@/lib/whiteboard/graph";
import { api } from "@/lib/trpc/react";
import type { CompareNode } from "@/server/trpc/routers/studies";

import { ConditionNode } from "./whiteboard-nodes";
import { CompareBlockNode } from "./whiteboard-compare-nodes";

const nodeTypes = { compareBlock: CompareBlockNode, condition: ConditionNode };

/** Lay out one version's compare nodes (block column + condition entry-points). */
function toFlow(nodes: CompareNode[]): { rfNodes: Node[]; rfEdges: Edge[] } {
  const condOrder: string[] = [];
  for (const n of nodes) for (const s of n.showIfCondition) if (!condOrder.includes(s)) condOrder.push(s);

  const condNodes: Node[] = condOrder.map((slug, i) => ({
    id: conditionNodeId(slug),
    type: "condition",
    position: { x: 0, y: i * 110 },
    data: { label: `Condition: ${slug}` },
  }));
  const blockNodes: Node[] = nodes.map((n, i) => ({
    id: n.instanceId,
    type: "compareBlock",
    position: { x: 300, y: i * 120 },
    data: { label: n.name, ref: n.ref, status: n.status },
  }));
  const rfEdges: Edge[] = nodes.flatMap((n) =>
    n.showIfCondition.map((slug) => ({
      id: `e:${slug}->${n.instanceId}`,
      source: conditionNodeId(slug),
      target: n.instanceId,
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  );
  return { rfNodes: [...condNodes, ...blockNodes], rfEdges };
}

function CompareSide({ label, nodes }: { label: string; nodes: CompareNode[] }) {
  const { rfNodes, rfEdges } = useMemo(() => toFlow(nodes), [nodes]);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{label}</h2>
      <div className="wb-canvas h-[60vh] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No blocks.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

const LEGEND: { color: string; label: string }[] = [
  { color: "var(--color-success, #15803d)", label: "Added" },
  { color: "var(--color-danger, #b91c1c)", label: "Removed" },
  { color: "var(--color-warning, #b45309)", label: "Modified" },
  { color: "var(--color-border-subtle)", label: "Unchanged" },
];

/**
 * Multi-version compare (ADR-0020 §A6): working copy (left) vs a chosen frozen
 * version (right), each as a read-only graph with diff-colored nodes. Pick the
 * comparison version from the dropdown.
 */
export function CompareView({ studyId, initialVs }: { studyId: string; initialVs?: string }) {
  const versions = api.studies.listVersions.useQuery({ studyId });
  const frozen = (versions.data ?? []).filter((v) => v.kind !== "autosave");
  const [vs, setVs] = useState<string | undefined>(initialVs);
  const effectiveVs = vs ?? frozen[frozen.length - 1]?.id;

  const cmp = api.studies.compareVersions.useQuery(
    { studyId, vs: effectiveVs ?? "" },
    { enabled: !!effectiveVs },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Compare working copy against:
          <select
            value={effectiveVs ?? ""}
            onChange={(e) => setVs(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-small)]"
          >
            {frozen.length === 0 ? <option value="">No saved versions yet</option> : null}
            {frozen.map((v) => (
              <option key={v.id} value={v.id}>
                {v.kind === "named"
                  ? `v${v.versionNumber}${v.name ? ` — ${v.name}` : ""}`
                  : v.kind === "preregistered"
                    ? `Preregistration v${v.versionNumber}`
                    : `Published v${v.versionNumber}`}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              <span className="inline-block size-3 rounded-sm" style={{ border: `2px solid ${l.color}` }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {!effectiveVs ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Save a version (Builder → Save) to compare against it.
        </p>
      ) : cmp.isLoading ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading compare…</p>
      ) : cmp.isError || !cmp.data ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t load the comparison.
        </p>
      ) : (
        <div className="flex flex-col gap-3 md:flex-row">
          <CompareSide label={cmp.data.leftLabel} nodes={cmp.data.left} />
          <CompareSide label={cmp.data.rightLabel} nodes={cmp.data.right} />
        </div>
      )}
    </div>
  );
}
