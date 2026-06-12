import { describe, expect, it } from "vitest";

import type { StudyBlock } from "@/server/trpc/routers/studies";

import { conditionNodeId, deriveGraph } from "../graph";

function block(partial: Partial<StudyBlock> & { instanceId: string }): StudyBlock {
  return {
    source: "core",
    key: "likert-7",
    version: "1.0.0",
    name: "Likert (7-point)",
    title: null,
    ref: "core/likert-7@1.0.0",
    config: {},
    complete: true,
    showIfCondition: [],
    branchRules: [],
    showIf: null,
    groupId: null,
    divergenceNote: null,
    ...partial,
  };
}

describe("deriveGraph (ADR-0020 §A4)", () => {
  it("maps each block to a node and carries ref + completeness", () => {
    const { nodes, edges } = deriveGraph([
      block({ instanceId: "b1", name: "Social post", ref: "core/social-post@2.0.0", complete: false }),
      block({ instanceId: "b2" }),
    ]);
    expect(edges).toHaveLength(0);
    const b1 = nodes.find((n) => n.id === "b1")!;
    expect(b1).toMatchObject({ kind: "block", label: "Social post", ref: "core/social-post@2.0.0", complete: false });
    expect(nodes.filter((n) => n.kind === "block")).toHaveLength(2);
  });

  it("creates one condition entry-point per distinct slug and edges to gated blocks", () => {
    const { nodes, edges } = deriveGraph([
      block({ instanceId: "b1", showIfCondition: ["treatment"] }),
      block({ instanceId: "b2", showIfCondition: ["treatment", "control"] }),
      block({ instanceId: "b3" }),
    ]);
    const condNodes = nodes.filter((n) => n.kind === "condition");
    expect(condNodes.map((n) => n.id).sort()).toEqual(
      [conditionNodeId("control"), conditionNodeId("treatment")].sort(),
    );
    // treatment → b1, b2 ; control → b2
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: "e:treatment->b1",
      source: conditionNodeId("treatment"),
      target: "b1",
    });
    expect(edges).toContainEqual({
      id: "e:control->b2",
      source: conditionNodeId("control"),
      target: "b2",
    });
    // b3 is ungated — no incoming edge.
    expect(edges.some((e) => e.target === "b3")).toBe(false);
  });

  it("is deterministic — condition column ordered by first appearance, blocks by order", () => {
    const { nodes } = deriveGraph([
      block({ instanceId: "b1", showIfCondition: ["second"] }),
      block({ instanceId: "b2", showIfCondition: ["first"] }),
    ]);
    const conds = nodes.filter((n) => n.kind === "condition");
    // "second" appears before "first" in block order, so it's row 0.
    expect(conds[0].label).toBe("Condition: second");
    expect(conds[1].label).toBe("Condition: first");
    const blocks = nodes.filter((n) => n.kind === "block");
    expect(blocks[0].position.y).toBeLessThan(blocks[1].position.y);
  });
});
