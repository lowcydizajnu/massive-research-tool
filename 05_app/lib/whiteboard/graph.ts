import type { StudyBlock } from "@/server/trpc/routers/studies";

/**
 * Whiteboard graph derivation (ADR-0020 §A4). The canvas is a translation layer
 * over `definition_snapshot.blocks` (ADR-0012): each block becomes a node, and
 * each `visibility.showIfCondition` slug becomes an edge from a synthetic
 * "Condition: <slug>" entry-point node to the block it gates. Pure + deterministic
 * so it can be unit-tested and rendered identically server- or client-side.
 */
export type WhiteboardNodeKind = "block" | "condition";

export type WhiteboardGraphNode = {
  id: string;
  kind: WhiteboardNodeKind;
  /** Display label: block name, or "Condition: <slug>". */
  label: string;
  /** `source/key@version` — blocks only. */
  ref?: string;
  /** Block config completeness (drives the node status dot). Blocks only. */
  complete?: boolean;
  position: { x: number; y: number };
};

export type WhiteboardGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type WhiteboardGraph = {
  nodes: WhiteboardGraphNode[];
  edges: WhiteboardGraphEdge[];
};

const COND_PREFIX = "cond:";
const COL_CONDITION_X = 0;
const COL_BLOCK_X = 320;
const ROW_GAP = 120;

/** Stable id for a condition entry-point node. */
export function conditionNodeId(slug: string): string {
  return `${COND_PREFIX}${slug}`;
}

/**
 * Derive the whiteboard graph from a study's blocks. Condition entry-points are
 * laid out in a left column (in first-seen order), blocks in a column to the
 * right (in block order); the user's pan/zoom is restored separately from the
 * persisted viewport. A dagre/elk auto-layout is a future enhancement (ADR-0020).
 */
export function deriveGraph(blocks: StudyBlock[]): WhiteboardGraph {
  const condOrder: string[] = [];
  for (const b of blocks) {
    for (const slug of b.showIfCondition ?? []) {
      if (!condOrder.includes(slug)) condOrder.push(slug);
    }
  }

  const conditionNodes: WhiteboardGraphNode[] = condOrder.map((slug, i) => ({
    id: conditionNodeId(slug),
    kind: "condition",
    label: `Condition: ${slug}`,
    position: { x: COL_CONDITION_X, y: i * ROW_GAP },
  }));

  const blockNodes: WhiteboardGraphNode[] = blocks.map((b, i) => ({
    id: b.instanceId,
    kind: "block",
    label: b.name,
    ref: b.ref,
    complete: b.complete,
    position: { x: COL_BLOCK_X, y: i * ROW_GAP },
  }));

  const edges: WhiteboardGraphEdge[] = blocks.flatMap((b) =>
    (b.showIfCondition ?? []).map((slug) => ({
      id: `e:${slug}->${b.instanceId}`,
      source: conditionNodeId(slug),
      target: b.instanceId,
    })),
  );

  return { nodes: [...conditionNodes, ...blockNodes], edges };
}
