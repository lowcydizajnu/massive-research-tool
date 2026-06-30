import { describe, expect, it } from "vitest";

import { preflightSummary, runPreflight, type PreflightCheck } from "@/server/modules/preflight";
import { ACADEMIC } from "@/lib/themes/themes";

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

  it("flags an AI conversation as non-deterministic (informational, never failing)", () => {
    const noAi = runPreflight({ snapshot: snap([likert()]), conditions: noConditions, mode: "preregister" });
    expect(noAi.find((c) => c.id === "ai-nondeterministic")).toBeUndefined();

    const ai = runPreflight({
      snapshot: snap([{ instanceId: "ai1", source: "core", key: "ai-chat", version: "1.0.0", config: { role: "Interviewer" } }]),
      conditions: noConditions,
      mode: "preregister",
    });
    const check = get(ai, "ai-nondeterministic");
    expect(check.status).toBe("pass"); // informational — researcher autonomy
    expect(check.title).toContain("non-deterministic");
    expect(check.detail).toContain("preregistration");
    expect(check.blocks?.[0].instanceId).toBe("ai1");
  });

  // ADR-0084 — advisory branding/IRB row (the freeze mutations enforce it).
  it("only flags branded social-post, and passes when logo + attestation present", () => {
    const sp = (config: Record<string, unknown>) => ({
      instanceId: "sp1",
      source: "core",
      key: "social-post",
      version: "2.0.0",
      config,
    });
    const base = { headline: "H", source: "S", veracityGroundTruth: "false" };

    // No branded block → no branding row at all.
    const none = runPreflight({ snapshot: snap([likert()]), conditions: noConditions, mode: "publish" });
    expect(none.find((c) => c.id === "branding-irb")).toBeUndefined();

    // Branded, no logo / no attestation → fail.
    const bad = runPreflight({
      snapshot: snap([sp({ ...base, brandingTier: "branded" })]),
      conditions: noConditions,
      mode: "publish",
    });
    expect(get(bad, "branding-irb").status).toBe("fail");

    // Logo + IRB attestation → pass.
    const ok = runPreflight({
      snapshot: snap([sp({ ...base, brandingTier: "branded", brandLogoKey: "/api/media/ws/a/logo.png" })], {
        theme: {
          ...ACADEMIC,
          socialPost: {
            irbAttestation: {
              attested: true,
              byUserId: "00000000-0000-4000-8000-00000000abcd",
              at: "2026-06-30T00:00:00Z",
              statement: "IRB approved.",
            },
          },
        },
      }),
      conditions: noConditions,
      mode: "publish",
    });
    expect(get(ok, "branding-irb").status).toBe("pass");
  });
});
