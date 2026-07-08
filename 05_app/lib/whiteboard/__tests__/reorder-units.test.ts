import { describe, expect, it } from "vitest";

import { reorderByUnits } from "@/lib/whiteboard/screens";

// Minimal block shape the reconstruction cares about.
const b = (instanceId: string, groupId: string | null = null) => ({ instanceId, groupId });
const GH = "gh:";
const ids = (rows: { instanceId: string }[]) => rows.map((r) => r.instanceId);

// A study: lone intro, group A (a1,a2,a3), group B (b1,b2), lone outro.
const study = () => [b("intro"), b("a1", "A"), b("a2", "A"), b("a3", "A"), b("b1", "B"), b("b2", "B"), b("outro")];

describe("reorderByUnits (ADR-0028 group drag — collapse to units)", () => {
  it("no-op: units in their current order reproduce the block order exactly", () => {
    const units = ["intro", `${GH}A`, `${GH}B`, "outro"];
    expect(ids(reorderByUnits(study(), units, GH))).toEqual(["intro", "a1", "a2", "a3", "b1", "b2", "outro"]);
  });

  it("moves group A below group B — the WHOLE group travels, members stay together + ordered", () => {
    const units = ["intro", `${GH}B`, `${GH}A`, "outro"];
    expect(ids(reorderByUnits(study(), units, GH))).toEqual(["intro", "b1", "b2", "a1", "a2", "a3", "outro"]);
  });

  it("moves a group to the very top, past a lone block", () => {
    const units = [`${GH}B`, "intro", `${GH}A`, "outro"];
    expect(ids(reorderByUnits(study(), units, GH))).toEqual(["b1", "b2", "intro", "a1", "a2", "a3", "outro"]);
  });

  it("moves a group to the very bottom", () => {
    const units = ["intro", `${GH}B`, "outro", `${GH}A`];
    expect(ids(reorderByUnits(study(), units, GH))).toEqual(["intro", "b1", "b2", "outro", "a1", "a2", "a3"]);
  });

  it("preserves a group's internal member order regardless of unit list", () => {
    const units = [`${GH}A`, `${GH}B`, "intro", "outro"];
    const out = reorderByUnits(study(), units, GH);
    expect(ids(out).filter((x) => x.startsWith("a"))).toEqual(["a1", "a2", "a3"]);
    expect(ids(out).filter((x) => x.startsWith("b"))).toEqual(["b1", "b2"]);
  });

  it("safety net: a unit list missing a group still keeps that group's blocks (appended, never dropped)", () => {
    const units = ["intro", `${GH}A`, "outro"]; // group B omitted
    const out = ids(reorderByUnits(study(), units, GH));
    expect(out).toContain("b1");
    expect(out).toContain("b2");
    expect(out).toHaveLength(7); // nothing lost
  });

  it("a grouped member id leaking into the unit list is ignored in place (emitted once, via its header)", () => {
    const units = ["intro", "a2", `${GH}A`, `${GH}B`, "outro"]; // stray a2 before its header
    const out = ids(reorderByUnits(study(), units, GH));
    expect(out.filter((x) => x === "a2")).toHaveLength(1);
    expect(out).toEqual(["intro", "a1", "a2", "a3", "b1", "b2", "outro"]); // a2 rides group A, not its own slot
  });

  it("never duplicates or drops blocks under any unit permutation", () => {
    const units = [`${GH}B`, "outro", `${GH}A`, "intro"];
    const out = ids(reorderByUnits(study(), units, GH));
    expect([...out].sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "intro", "outro"].sort());
  });
});
