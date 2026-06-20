import { describe, expect, it } from "vitest";

import { buildFlow, deriveFlow } from "@/lib/whiteboard/flow";
import type { BlockInstance, StudyGroup } from "@/server/modules/blocks";
import type { ConditionGroup } from "@/lib/whiteboard/conditions";

function block(id: string, over: Partial<BlockInstance> = {}): BlockInstance {
  return { instanceId: id, source: "core", key: "likert-7", version: "1.0.0", config: {}, ...over };
}
const arms = (...slugs: string[]) => slugs.map((s) => ({ slug: s, name: s.toUpperCase() }));
const showIf = (fromInstanceId: string): ConditionGroup => ({ op: "and", clauses: [{ fromInstanceId, operator: "answered", value: [] }] });
const groups: StudyGroup[] = [];
const ids = (g: ReturnType<typeof deriveFlow>) => g.nodes.map((n) => n.id);

describe("deriveFlow (ADR-0057)", () => {
  it("a plain linear study: Start → screens → Finish, no assignment node", () => {
    const g = deriveFlow({ blocks: [block("a"), block("b")], groups, conditions: arms() });
    expect(ids(g)).toEqual(["start", "screen:a", "screen:b", "finish"]);
    expect(g.nodes.find((n) => n.id === "finish")!.terminalKind).toBe("complete");
    // Sequential default edges, no branches.
    expect(g.edges.map((e) => `${e.source}->${e.target}`)).toEqual(["start->screen:a", "screen:a->screen:b", "screen:b->finish"]);
    expect(g.edges.every((e) => e.kind === "default")).toBe(true);
  });

  it("more than one arm inserts a Random assignment node after Start", () => {
    const g = deriveFlow({ blocks: [block("a")], groups, conditions: arms("control", "treat") });
    expect(ids(g)).toEqual(["start", "assign", "screen:a", "finish"]);
    expect(g.nodes.find((n) => n.id === "assign")!.assignArms).toHaveLength(2);
  });

  it("tags each screen with the arms that see it (chips); allArms when shared", () => {
    const g = deriveFlow({
      blocks: [block("shared"), block("only-a", { visibility: { showIfCondition: ["a"] } })],
      groups,
      conditions: arms("a", "b"),
    });
    const shared = g.nodes.find((n) => n.id === "screen:shared")!;
    const onlyA = g.nodes.find((n) => n.id === "screen:only-a")!;
    expect(shared.allArms).toBe(true);
    expect(onlyA.allArms).toBe(false);
    expect(onlyA.arms).toEqual(["a"]);
  });

  it("an answer-conditioned screen becomes a branch that rejoins (yes → screen, else → next)", () => {
    const g = deriveFlow({ blocks: [block("a"), block("b", { showIf: showIf("a") }), block("c")], groups, conditions: arms() });
    expect(ids(g)).toContain("branch:b");
    const e = (s: string, t: string) => g.edges.find((x) => x.source === s && x.target === t);
    expect(e("branch:b", "screen:b")!.kind).toBe("yes");
    // The "no"/else arm skips the conditioned screen and rejoins at the next step (c).
    expect(e("branch:b", "screen:c")!.kind).toBe("no");
    // The conditioned screen's normal out also continues to c (rejoin).
    expect(e("screen:b", "screen:c")).toBeTruthy();
  });

  it("a conditional end-redirect is an early-exit terminal reached via the branch; the else path continues", () => {
    const g = deriveFlow({
      blocks: [block("a"), block("bye", { key: "end-redirect", config: { url: "https://x.test" }, showIf: showIf("a") }), block("c")],
      groups,
      conditions: arms(),
    });
    const term = g.nodes.find((n) => n.id === "term:bye")!;
    expect(term.kind).toBe("terminal");
    expect(term.terminalKind).toBe("early-exit");
    expect(term.redirectTo).toBe("https://x.test");
    const e = (s: string, t: string) => g.edges.find((x) => x.source === s && x.target === t);
    expect(e("branch:bye", "term:bye")!.kind).toBe("yes");
    expect(e("branch:bye", "screen:c")!.kind).toBe("no"); // continues
    expect(g.nodes.find((n) => n.id === "screen:c")!.unreachable).toBeFalsy();
  });

  it("an UNCONDITIONAL end-redirect ends the trunk; everything after is unreachable", () => {
    const g = deriveFlow({
      blocks: [block("a"), block("bye", { key: "end-redirect" }), block("c")],
      groups,
      conditions: arms(),
    });
    expect(g.nodes.find((n) => n.id === "term:bye")!.unreachable).toBeFalsy();
    expect(g.nodes.find((n) => n.id === "screen:c")!.unreachable).toBe(true);
    expect(g.nodes.find((n) => n.id === "finish")!.unreachable).toBe(true);
  });

  it("empty study: just Start → Finish", () => {
    const g = deriveFlow({ blocks: [], groups, conditions: arms() });
    expect(ids(g)).toEqual(["start", "finish"]);
    expect(g.edges).toEqual([{ id: "start->finish:default", source: "start", target: "finish", kind: "default", label: undefined }]);
  });
});

describe("layoutFlow", () => {
  it("places nodes top-to-bottom and offsets a branch's yes-target into lane 1", () => {
    const g = buildFlow({ blocks: [block("a"), block("b", { showIf: showIf("a") }), block("c")], groups, conditions: arms() });
    const n = (id: string) => g.nodes.find((x) => x.id === id)!;
    expect(n("start").y).toBe(0);
    expect(n("start").lane).toBe(0);
    // The conditioned screen (yes target) is pushed to the right.
    expect(n("screen:b").lane).toBe(1);
    expect(n("branch:b").lane).toBe(0);
    // Finish sits below the branch + screen.
    expect(n("finish").y).toBeGreaterThan(n("branch:b").y);
  });
});
