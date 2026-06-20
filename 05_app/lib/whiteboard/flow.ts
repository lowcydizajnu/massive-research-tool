import type { BlockInstance, StudyGroup } from "@/server/modules/blocks";
import { deriveScreens, type Screen } from "@/lib/whiteboard/screens";
import { summarizeCondition } from "@/lib/whiteboard/conditions";

/**
 * Study flow-graph derivation (ADR-0057). Turns the real study structure —
 * ordered screens (ADR-0028) + experimental-arm visibility (ADR-0014) +
 * answer-based skip logic (`showIf`, ADR-0021) + end-redirect terminals
 * (ADR-0042) — into a directed *execution-flow* graph: a fixed Start, an
 * optional random-assignment node when >1 arm, the ordered spine of screens with
 * inline branch-and-rejoin forks for skip logic, and one or more terminals.
 *
 * Pure + client-safe (no server imports beyond shared types). The diagram is
 * DERIVED, so it can never drift from what the runtime does — this is the whole
 * point of the rethink (vs the old free-placement wiring board).
 */

export type FlowNodeKind = "start" | "assign" | "screen" | "branch" | "terminal";

export type FlowArm = { slug: string; name: string };

export type FlowNode = {
  id: string;
  kind: FlowNodeKind;
  /** Underlying screen/block id for selection + navigation (screen/terminal). */
  refId?: string;
  title?: string;
  /** Screen: blocks on the screen + the arms that see it. */
  blockCount?: number;
  arms?: string[];
  allArms?: boolean;
  /** Swimlane view: this screen is shared across arms (repeated per lane). */
  shared?: boolean;
  incomplete?: boolean;
  /** Branch: a one-line summary of the `showIf` condition. */
  conditionSummary?: string;
  /** Terminal kind + optional redirect target (end-redirect). */
  terminalKind?: "complete" | "early-exit";
  redirectTo?: string | null;
  /** True when no path from Start can reach this node (e.g. after an
   *  unconditional early exit). Drawn dimmed with a warning. */
  unreachable?: boolean;
  /** assign: the arms + weights to show. */
  assignArms?: FlowArm[];
  /** Layout (filled by layoutFlow). */
  x: number;
  y: number;
  lane: number;
};

export type FlowEdgeKind = "default" | "yes" | "no";
export type FlowEdge = { id: string; source: string; target: string; label?: string; kind: FlowEdgeKind };

export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

/** Categorical chip colours per condition (ADR-0057), cycled by condition index. */
export const CONDITION_PALETTE: { bg: string; text: string }[] = [
  { bg: "var(--color-cond-1)", text: "var(--color-cond-1-text)" },
  { bg: "var(--color-cond-2)", text: "var(--color-cond-2-text)" },
  { bg: "var(--color-cond-3)", text: "var(--color-cond-3-text)" },
  { bg: "var(--color-cond-4)", text: "var(--color-cond-4-text)" },
  { bg: "var(--color-cond-5)", text: "var(--color-cond-5-text)" },
  { bg: "var(--color-cond-6)", text: "var(--color-cond-6-text)" },
];
export function conditionColor(index: number): { bg: string; text: string } {
  const n = CONDITION_PALETTE.length;
  return CONDITION_PALETTE[((index % n) + n) % n];
}

export type DeriveFlowInput = {
  blocks: BlockInstance[];
  groups: StudyGroup[];
  /** Experimental arms (the `condition` table), in display order. */
  conditions: FlowArm[];
  /** Resolve a source block's display name for branch summaries. */
  nameOf?: (instanceId: string) => string;
  /** Optional completeness check (drives the "needs setup" badge). */
  isIncomplete?: (block: BlockInstance) => boolean;
};

const TERMINAL_KEY = "end-redirect";

/** The arm slugs a single block is shown to; empty restriction = all arms. */
function blockArms(block: BlockInstance, allSlugs: string[]): string[] {
  const r = block.visibility?.showIfCondition?.filter((s) => allSlugs.includes(s)) ?? [];
  return r.length ? r : allSlugs;
}

/** The arms that see a screen = the union over its blocks (a screen shows if any
 *  of its blocks is visible to that arm). `allArms` when that covers every arm. */
function screenArms(screen: Screen, allSlugs: string[]): { arms: string[]; allArms: boolean } {
  if (allSlugs.length <= 1) return { arms: allSlugs, allArms: true };
  const set = new Set<string>();
  for (const b of screen.blocks) for (const s of blockArms(b, allSlugs)) set.add(s);
  const arms = allSlugs.filter((s) => set.has(s)); // keep declared order
  return { arms, allArms: arms.length === allSlugs.length };
}

function isTerminalScreen(screen: Screen): boolean {
  return screen.kind === "single" && screen.blocks[0]?.key === TERMINAL_KEY;
}

function redirectTarget(screen: Screen): string | null {
  const url = screen.blocks[0]?.config?.url;
  return typeof url === "string" && url ? url : null;
}

/** A screen's display title: the group/screen title, else the first block's name. */
function screenTitle(screen: Screen, nameOf: (id: string) => string): string {
  if (screen.title?.trim()) return screen.title.trim();
  const first = screen.blocks[0];
  return first ? nameOf(first.instanceId) : "Screen";
}

/**
 * Derive the flow graph (positions zeroed; call `layoutFlow` to place nodes).
 * Default representation = one spine with arm chips (the swimlane view is a
 * separate layout over the same nodes).
 */
export function deriveFlow(input: DeriveFlowInput): FlowGraph {
  const { blocks, groups, conditions } = input;
  const nameOf = input.nameOf ?? ((id: string) => id);
  const allSlugs = conditions.map((c) => c.slug);
  const screens = deriveScreens(blocks, groups);

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const push = (n: Omit<FlowNode, "x" | "y" | "lane">) => {
    nodes.push({ ...n, x: 0, y: 0, lane: 0 });
    return n.id;
  };
  const link = (source: string, target: string, kind: FlowEdgeKind = "default", label?: string) =>
    edges.push({ id: `${source}->${target}:${kind}`, source, target, kind, label });

  push({ id: "start", kind: "start", title: "Start" });
  let entry = "start"; // the node the next trunk step connects from
  if (conditions.length > 1) {
    push({ id: "assign", kind: "assign", title: "Random assignment", assignArms: conditions });
    link("start", "assign");
    entry = "assign";
  }

  // Build screen/branch/terminal nodes; collect the trunk's "next entry" targets
  // in a second pass so a branch's skip edge can point at the following step.
  type Step = { entryId: string; exitId: string | null; isTerminal: boolean };
  const steps: Step[] = [];
  let sawUnconditionalTerminal = false;

  for (const screen of screens) {
    const terminal = isTerminalScreen(screen);
    const { arms, allArms } = screenArms(screen, allSlugs);
    const cond = summarizeCondition(screen.showIf, nameOf);
    const incomplete = input.isIncomplete ? screen.blocks.some((b) => input.isIncomplete!(b)) : undefined;
    const unreachable = sawUnconditionalTerminal || undefined;

    if (terminal) {
      const termId = `term:${screen.id}`;
      push({
        id: termId,
        kind: "terminal",
        refId: screen.id,
        title: screenTitle(screen, nameOf),
        terminalKind: "early-exit",
        redirectTo: redirectTarget(screen),
        unreachable,
      });
      if (cond) {
        const brId = `branch:${screen.id}`;
        push({ id: brId, kind: "branch", refId: screen.id, conditionSummary: cond, unreachable });
        link(brId, termId, "yes", "if");
        steps.push({ entryId: brId, exitId: brId, isTerminal: false }); // continues via "no"
      } else {
        // Unconditional early exit — the trunk ends here.
        steps.push({ entryId: termId, exitId: null, isTerminal: true });
        sawUnconditionalTerminal = true;
      }
      continue;
    }

    const scrId = `screen:${screen.id}`;
    push({
      id: scrId,
      kind: "screen",
      refId: screen.id,
      title: screenTitle(screen, nameOf),
      blockCount: screen.blocks.length,
      arms,
      allArms,
      incomplete,
      unreachable,
    });
    if (cond) {
      const brId = `branch:${screen.id}`;
      push({ id: brId, kind: "branch", refId: screen.id, conditionSummary: cond, unreachable });
      link(brId, scrId, "yes", "if");
      steps.push({ entryId: brId, exitId: scrId, isTerminal: false });
    } else {
      steps.push({ entryId: scrId, exitId: scrId, isTerminal: false });
    }
  }

  // Connect the trunk: entry → each step's entry; a conditioned step's branch
  // also gets a "no" skip edge to the following step's entry (rejoin).
  const finishId = "finish";
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const nextEntry = i + 1 < steps.length ? steps[i + 1].entryId : finishId;
    link(entry, step.entryId);
    // A branch entry: the "yes" arm was already linked at build; add the "no" skip.
    if (step.entryId.startsWith("branch:")) link(step.entryId, nextEntry, "no", "else");
    // Advance the trunk from this step's exit (null for an unconditional terminal).
    if (step.exitId === null) {
      entry = nextEntry; // trunk ended; the rest is unreachable but still drawn
    } else if (step.exitId !== step.entryId) {
      // conditioned screen: its normal out continues the trunk
      entry = step.exitId;
    } else {
      entry = step.exitId;
    }
  }

  push({ id: finishId, kind: "terminal", title: "Finish", terminalKind: "complete", unreachable: sawUnconditionalTerminal || undefined });
  link(entry, finishId);

  markUnreachable(nodes, edges);
  return { nodes, edges };
}

/** Flag nodes with no path from Start (BFS over edges). */
function markUnreachable(nodes: FlowNode[], edges: FlowEdge[]): void {
  const adj = new Map<string, string[]>();
  for (const e of edges) (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
  const seen = new Set<string>(["start"]);
  const queue = ["start"];
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of adj.get(id) ?? []) if (!seen.has(t)) (seen.add(t), queue.push(t));
  }
  for (const n of nodes) if (!seen.has(n.id)) n.unreachable = true;
}

/* ---------- layout: longest-path layering (chips-on-spine default) ---------- */

export const FLOW_LAYOUT = { colX: 300, rowY: 120, nodeW: 240, nodeH: 72 } as const;

/**
 * Place nodes top-to-bottom by longest-path depth from Start; trunk stays in
 * lane 0, a branch's "yes" target (the conditioned screen / early exit) sits one
 * lane to the right so the fork reads as a side detour that rejoins. Pure: writes
 * x/y/lane on the nodes and returns the same graph.
 */
export function layoutFlow(graph: FlowGraph): FlowGraph {
  const { nodes, edges } = graph;
  const preds = new Map<string, string[]>();
  for (const e of edges) (preds.get(e.target) ?? preds.set(e.target, []).get(e.target)!).push(e.source);

  // Longest-path layer via memoized DFS (the graph is a DAG: edges only go forward).
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (visiting.has(id)) return 0; // defensive against an unexpected cycle
    visiting.add(id);
    const ps = preds.get(id) ?? [];
    const d = ps.length ? Math.max(...ps.map(depth)) + 1 : 0;
    visiting.delete(id);
    layer.set(id, d);
    return d;
  };
  for (const n of nodes) depth(n.id);

  // Lane: "yes" targets go right; everything else stays on the trunk.
  const yesTargets = new Set(edges.filter((e) => e.kind === "yes").map((e) => e.target));
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    n.lane = yesTargets.has(n.id) ? 1 : 0;
    n.y = l * FLOW_LAYOUT.rowY;
    n.x = n.lane * FLOW_LAYOUT.colX;
  }
  return graph;
}

/** Convenience: derive + layout in one call. */
export function buildFlow(input: DeriveFlowInput): FlowGraph {
  return layoutFlow(deriveFlow(input));
}

/* ---------- swimlane view: one lane per arm (ADR-0057) ---------- */

const SWIMLANE = { laneX: 300, rowY: 110 } as const;

/**
 * The "by arm" reading: a separate top-to-bottom lane per experimental arm, each
 * showing exactly the screens that arm sees (in order, with its branches), so you
 * can trace one arm's literal path. Shared screens are REPEATED in each lane that
 * sees them (tagged "shared") — chosen over span-lanes so each lane stays a clean,
 * traceable column. Start / Random assignment / Finish are shared anchors.
 * Positions are set here (no separate layout pass).
 */
export function deriveSwimlaneFlow(input: DeriveFlowInput): FlowGraph {
  const { blocks, groups, conditions } = input;
  const nameOf = input.nameOf ?? ((id: string) => id);
  const allSlugs = conditions.map((c) => c.slug);
  if (allSlugs.length <= 1) return buildFlow(input); // no lanes to split

  const screens = deriveScreens(blocks, groups);
  const seenByMany = (s: Screen) => {
    const { arms, allArms } = screenArms(s, allSlugs);
    return allArms || arms.length > 1;
  };

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const centerX = ((conditions.length - 1) * SWIMLANE.laneX) / 2;
  const at = (n: Omit<FlowNode, "x" | "y" | "lane">, x: number, y: number, lane: number) => {
    nodes.push({ ...n, x, y, lane });
    return n.id;
  };
  const link = (source: string, target: string, kind: FlowEdgeKind = "default", label?: string) =>
    edges.push({ id: `${source}->${target}:${kind}`, source, target, kind, label });

  at({ id: "start", kind: "start", title: "Start" }, centerX, 0, 0);
  at({ id: "assign", kind: "assign", title: "Random assignment", assignArms: conditions }, centerX, SWIMLANE.rowY, 0);
  link("start", "assign");

  let maxRow = 2;
  const finishId = "finish";

  conditions.forEach((arm, lane) => {
    const laneX = lane * SWIMLANE.laneX;
    const armScreens = screens.filter((s) => {
      const { arms, allArms } = screenArms(s, allSlugs);
      return allArms || arms.includes(arm.slug);
    });
    let entry = "assign";
    let row = 2;
    const pfx = `L${lane}:`;
    type Step = { entryId: string; exitId: string | null };
    const steps: Step[] = [];

    for (const screen of armScreens) {
      const cond = summarizeCondition(screen.showIf, nameOf);
      const incomplete = input.isIncomplete ? screen.blocks.some((b) => input.isIncomplete!(b)) : undefined;
      const terminal = isTerminalScreen(screen);
      if (terminal) {
        const termId = `${pfx}term:${screen.id}`;
        at({ id: termId, kind: "terminal", refId: screen.id, title: screenTitle(screen, nameOf), terminalKind: "early-exit", redirectTo: redirectTarget(screen) }, laneX, row * SWIMLANE.rowY, lane);
        if (cond) {
          const brId = `${pfx}branch:${screen.id}`;
          at({ id: brId, kind: "branch", refId: screen.id, conditionSummary: cond }, laneX, row * SWIMLANE.rowY, lane);
          link(brId, termId, "yes", "if");
          steps.push({ entryId: brId, exitId: brId });
          row += 1;
        } else {
          steps.push({ entryId: termId, exitId: null });
        }
        continue;
      }
      const scrId = `${pfx}screen:${screen.id}`;
      at(
        { id: scrId, kind: "screen", refId: screen.id, title: screen.title ?? undefined, blockCount: screen.blocks.length, arms: [arm.slug], allArms: false, shared: seenByMany(screen), incomplete },
        laneX,
        row * SWIMLANE.rowY,
        lane,
      );
      if (cond) {
        const brId = `${pfx}branch:${screen.id}`;
        at({ id: brId, kind: "branch", refId: screen.id, conditionSummary: cond }, laneX, row * SWIMLANE.rowY, lane);
        link(brId, scrId, "yes", "if");
        steps.push({ entryId: brId, exitId: scrId });
        row += 2;
      } else {
        steps.push({ entryId: scrId, exitId: scrId });
        row += 1;
      }
    }

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const nextEntry = i + 1 < steps.length ? steps[i + 1].entryId : finishId;
      link(entry, step.entryId);
      if (step.entryId.includes("branch:")) link(step.entryId, nextEntry, "no", "else");
      entry = step.exitId === null ? nextEntry : step.exitId;
    }
    if (steps.length === 0) link("assign", finishId);
    maxRow = Math.max(maxRow, row);
  });

  at({ id: finishId, kind: "terminal", title: "Finish", terminalKind: "complete" }, centerX, (maxRow + 1) * SWIMLANE.rowY, 0);
  markUnreachable(nodes, edges);
  return { nodes, edges };
}
