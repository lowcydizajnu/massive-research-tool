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
  // Modified nodes grow with their change lines — keep vertical rhythm by
  // advancing the next node's y past the extra lines (~16px each).
  let y = 0;
  const blockNodes: Node[] = nodes.map((n) => {
    const node: Node = {
      id: n.instanceId,
      type: "compareBlock",
      position: { x: 300, y },
      data: { label: n.name, ref: n.ref, status: n.status, changes: n.changes },
    };
    y += 120 + Math.min(n.changes?.length ?? 0, 5) * 18;
    return node;
  });
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
  const study = api.studies.get.useQuery({ id: studyId });
  const isReplication = study.data?.isReplication === true;
  const frozen = (versions.data ?? []).filter((v) => v.kind !== "autosave");
  const [vs, setVs] = useState<string | undefined>(initialVs);
  const [view, setView] = useState<"visual" | "text">("visual");
  // A replication defaults to juxtaposing against its ORIGINAL study (ADR-0018);
  // otherwise the latest frozen version (ADR-0020 §A6).
  const effectiveVs = vs ?? (isReplication ? "origin" : frozen[frozen.length - 1]?.id);

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
            {isReplication ? <option value="origin">Original study (replication source)</option> : null}
            {frozen.length === 0 && !isReplication ? <option value="">No saved versions yet</option> : null}
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
        <div role="tablist" aria-label="Compare view" className="ml-auto flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5">
          {(["visual", "text"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={
                view === v
                  ? "rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]"
                  : "rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              }
            >
              {v === "visual" ? "Visual" : "Text diff"}
            </button>
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
      ) : view === "text" ? (
        <TextDiff
          oldLabel={cmp.data.rightLabel}
          newLabel={cmp.data.leftLabel}
          lines={cmp.data.textDiff}
        />
      ) : (
        <div className="flex flex-col gap-3 md:flex-row">
          <CompareSide label={cmp.data.leftLabel} nodes={cmp.data.left} />
          <CompareSide label={cmp.data.rightLabel} nodes={cmp.data.right} />
        </div>
      )}
    </div>
  );
}

/** Unified GitHub-style protocol diff (ADR-0031): − old, + new, mono, tinted rows. */
function TextDiff({
  oldLabel,
  newLabel,
  lines,
}: {
  oldLabel: string;
  newLabel: string;
  lines: { type: "same" | "added" | "removed"; text: string }[];
}) {
  const changed = lines.filter((l) => l.type !== "same").length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        <span className="rounded-sm bg-[var(--color-danger-subtle)] px-1 text-[var(--color-danger-text-on-subtle)]">− {oldLabel}</span>{" "}
        <span className="rounded-sm bg-[var(--color-success-subtle)] px-1 text-[var(--color-success-text-on-subtle)]">+ {newLabel}</span>
        {changed === 0 ? " · No differences — the protocols read identically." : ` · ${changed} changed line${changed === 1 ? "" : "s"}`}
      </p>
      <div className="overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]">
        <pre className="m-0 p-0 font-mono text-[length:var(--text-mono)] leading-relaxed">
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                l.type === "added"
                  ? "bg-[var(--color-success-subtle)] px-3 text-[var(--color-success-text-on-subtle)]"
                  : l.type === "removed"
                    ? "bg-[var(--color-danger-subtle)] px-3 text-[var(--color-danger-text-on-subtle)]"
                    : "px-3 text-[var(--color-text-secondary)]"
              }
            >
              <span aria-hidden className="inline-block w-4 select-none opacity-70">
                {l.type === "added" ? "+" : l.type === "removed" ? "−" : " "}
              </span>
              {l.text || " "}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
