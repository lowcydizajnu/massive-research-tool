import { describe, expect, it } from "vitest";

import { preflightSummary, runPreflight, type PreflightCheck } from "@/server/modules/preflight";

const snap = (blocks: Record<string, unknown>[], extra: Record<string, unknown> = {}): unknown => ({
  blocks,
  ...extra,
});
const likert = (over: Record<string, unknown> = {}) => ({
  instanceId: "b1",
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  config: { prompt: "How accurate?", required: true },
  ...over,
});
const get = (checks: PreflightCheck[], id: string) => checks.find((c) => c.id === id)!;
const noConditions: { slug: string; name: string }[] = [];

describe("runPreflight (ADR-0034)", () => {
  it("fails an empty study and an unconfigured block (with the offender named)", () => {
    const empty = runPreflight({ snapshot: snap([]), conditions: noConditions, mode: "publish" });
    expect(get(empty, "has-blocks").status).toBe("fail");

    const unconfigured = runPreflight({
      snapshot: snap([likert({ title: "My scale", config: { prompt: "", required: true } })]),
      conditions: noConditions,
      mode: "publish",
    });
    const check = get(unconfigured, "blocks-configured");
    expect(check.status).toBe("fail");
    expect(check.blocks?.[0].name).toBe("My scale");
  });

  it("hypotheses severity is mode-aware (fail on preregister, warn on publish)", () => {
    const s = snap([likert()], { overview: { abstract: "", hypotheses: [], sections: [], divergenceNotes: "" } });
    expect(get(runPreflight({ snapshot: s, conditions: noConditions, mode: "preregister" }), "hypotheses").status).toBe("fail");
    expect(get(runPreflight({ snapshot: s, conditions: noConditions, mode: "publish" }), "hypotheses").status).toBe("warn");
  });

  it("flags broken/forward show-if rules and unused conditions", () => {
    const broken = runPreflight({
      snapshot: snap([likert({ showIf: { op: "and", clauses: [{ fromInstanceId: "ghost", operator: "answered", value: null }] } })]),
      conditions: noConditions,
      mode: "publish",
    });
    expect(get(broken, "branching-valid").status).toBe("fail");

    const arms = runPreflight({
      snapshot: snap([likert({ visibility: { showIfCondition: ["treatment"] } })]),
      conditions: [
        { slug: "control", name: "Control" },
        { slug: "treatment", name: "Treatment" },
      ],
      mode: "publish",
    });
    const cu = get(arms, "conditions-used");
    expect(cu.status).toBe("warn"); // control gates nothing
    expect(cu.detail).toContain("Control");
  });

  it("warns on long studies without an attention check; summary counts statuses", () => {
    const many = Array.from({ length: 12 }, (_, i) => likert({ instanceId: `b${i}` }));
    const checks = runPreflight({ snapshot: snap(many), conditions: noConditions, mode: "publish" });
    expect(get(checks, "attention-check").status).toBe("warn");
    const withAc = runPreflight({
      snapshot: snap([
        ...many,
        { instanceId: "ac", source: "core", key: "attention-check", version: "1.0.0", config: { prompt: "Pick Agree", options: ["Agree"], correctAnswer: "Agree", required: true } },
      ]),
      conditions: noConditions,
      mode: "publish",
    });
    expect(get(withAc, "attention-check").status).toBe("pass");
    expect(preflightSummary(checks).warns).toBeGreaterThan(0);
    expect(preflightSummary(checks).fails).toBe(0);
  });
});
