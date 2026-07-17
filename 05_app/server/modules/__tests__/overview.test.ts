import { describe, expect, it } from "vitest";

import { planTemplateKey, readOverview } from "@/server/modules/blocks";

/** The v1 plan shape + the typed plan fields added by ADR-0101 (all defaulted).
 *  `templateKey` is deliberately absent — it is only present when explicitly chosen.
 *  `discloseDerivation` IS present and true: unlike `templateKey` it has no derived
 *  default to protect, and absent must mean "on" (ADR-0106 D5) so a study saved
 *  before the toggle existed doesn't silently opt out of a choice nobody made. */
const EMPTY = {
  abstract: "",
  hypotheses: [],
  sections: [],
  replicationNotes: "",
  samplingPlan: { text: "", source: "researcher" },
  analysisPlan: { text: "", source: "researcher" },
  variables: [],
  expectedOutcomes: [],
  originalStudy: { text: "", source: "researcher" },
  targetEffect: { text: "", source: "researcher" },
  differences: { text: "", source: "researcher" },
  discloseDerivation: true,
  templateAnswers: {},
};

describe("readOverview (V1.12 B1)", () => {
  it("returns an empty default for missing/blank snapshots", () => {
    expect(readOverview(null)).toEqual(EMPTY);
    expect(readOverview({})).toEqual(EMPTY);
    expect(readOverview({ blocks: [] })).toEqual(EMPTY);
  });
  it("reads a stored overview incl. hypotheses + replication notes; coerces malformed fields", () => {
    const ov = {
      abstract: "A study about headlines.",
      hypotheses: ["H1: warnings reduce credibility.", "H2: effect is larger for older adults."],
      sections: [{ id: "s1", heading: "Background", contentMd: "…" }],
      replicationNotes: "Swapped the stimulus set; added an attention check.",
    };
    expect(readOverview({ blocks: [], overview: ov })).toEqual({ ...EMPTY, ...ov });
    // malformed: non-string fields → safe defaults
    expect(
      readOverview({ overview: { abstract: 5, hypotheses: "no", sections: "nope", replicationNotes: 9 } }),
    ).toEqual(EMPTY);
    // hypotheses array with non-strings → filtered
    expect(readOverview({ overview: { hypotheses: ["H1", 2, null, "H2"] } }).hypotheses).toEqual(["H1", "H2"]);
  });
});

/**
 * ADR-0101. These guard the single most important invariant of the typed plan:
 * every field must default, because readOverview reads IMMUTABLE snapshots frozen
 * before these fields existed — including preregistrations we can never rewrite.
 */
describe("readOverview — typed plan fields (ADR-0101)", () => {
  it("defaults every typed field on a pre-item-5 snapshot", () => {
    const legacy = { overview: { abstract: "Old plan.", hypotheses: ["H1"], sections: [], replicationNotes: "" } };
    const ov = readOverview(legacy);
    expect(ov.abstract).toBe("Old plan.");
    expect(ov.samplingPlan).toEqual({ text: "", source: "researcher" });
    expect(ov.analysisPlan).toEqual({ text: "", source: "researcher" });
    expect(ov.variables).toEqual([]);
    expect(ov.expectedOutcomes).toEqual([]);
  });

  it("planTemplateKey derives from replicationIntent so no existing study re-files elsewhere", () => {
    // No stored templateKey + a declared replication intent ⇒ Recipe, exactly what
    // registry-push used to decide implicitly.
    expect(planTemplateKey(readOverview({ overview: { replicationIntent: "direct" } }))).toBe("replication-recipe");
    expect(planTemplateKey(readOverview({ overview: { replicationIntent: "conceptual" } }))).toBe("replication-recipe");
    // No intent ⇒ Open-Ended.
    expect(planTemplateKey(readOverview({ overview: { abstract: "x" } }))).toBe("open-ended");
  });

  it("an explicitly stored templateKey wins over the derived default", () => {
    // The researcher can now file a replication under Open-ended if they want.
    expect(
      planTemplateKey(readOverview({ overview: { replicationIntent: "direct", templateKey: "open-ended" } })),
    ).toBe("open-ended");
    expect(planTemplateKey(readOverview({ overview: { templateKey: "replication-recipe" } }))).toBe("replication-recipe");
    // Unknown/garbage key falls back to the derived default rather than throwing.
    expect(planTemplateKey(readOverview({ overview: { templateKey: "nonsense" } }))).toBe("open-ended");
    expect(
      planTemplateKey(readOverview({ overview: { templateKey: "nonsense", replicationIntent: "direct" } })),
    ).toBe("replication-recipe");
  });

  it("NEVER materializes the derived templateKey — round-tripping a plan must not freeze it", () => {
    // Several call sites do `{...readOverview(snap), someField}` and write it back
    // (setReplicationIntent, injectReplicationRecipe). If readOverview materialized
    // the default, "open-ended" would be persisted as an explicit choice BEFORE the
    // replication intent existed, and would then beat the derivation forever.
    const fresh = readOverview({ overview: { abstract: "x" } });
    expect(fresh.templateKey).toBeUndefined();
    expect("templateKey" in fresh).toBe(false);

    // Simulate the round-trip that broke it: read → add intent → write → read.
    const written = { ...fresh, replicationIntent: "direct" as const };
    expect(planTemplateKey(readOverview({ overview: written }))).toBe("replication-recipe");
  });

  it("reads typed plan fields + provenance round-trip", () => {
    const ov = readOverview({
      overview: {
        samplingPlan: { text: "N=400, 95% power.", source: "researcher" },
        analysisPlan: { text: "Two-sided t-test.", source: "derived" },
        variables: [
          { id: "v1", name: "Warning label", role: "iv", instanceId: "b1", notes: "present/absent", source: "researcher" },
        ],
        expectedOutcomes: [{ id: "o1", hypothesisIndex: 1, prediction: "Lower credibility.", source: "researcher" }],
      },
    });
    expect(ov.samplingPlan).toEqual({ text: "N=400, 95% power.", source: "researcher" });
    expect(ov.analysisPlan.source).toBe("derived");
    expect(ov.variables[0]).toEqual({
      id: "v1",
      name: "Warning label",
      role: "iv",
      instanceId: "b1",
      notes: "present/absent",
      source: "researcher",
    });
    expect(ov.expectedOutcomes[0].hypothesisIndex).toBe(1);
  });

  it("coerces malformed typed fields instead of throwing", () => {
    const ov = readOverview({
      overview: {
        samplingPlan: "bare string", // defensive: tolerated as text
        analysisPlan: 42,
        variables: [
          { name: "no id", role: "bogus", instanceId: 7, notes: null, source: "hacked" },
          "not an object",
        ],
        expectedOutcomes: [{ prediction: "p", hypothesisIndex: -3 }],
      },
    });
    expect(ov.samplingPlan).toEqual({ text: "bare string", source: "researcher" });
    expect(ov.analysisPlan).toEqual({ text: "", source: "researcher" });
    expect(ov.variables).toHaveLength(1);
    // unknown role → "iv"; non-string instanceId → null; unknown source → "researcher"
    expect(ov.variables[0]).toMatchObject({ id: "v0", role: "iv", instanceId: null, notes: "", source: "researcher" });
    // a non-positive/invalid hypothesisIndex is dropped to null rather than kept
    expect(ov.expectedOutcomes[0].hypothesisIndex).toBeNull();
  });

  it("gives a deterministic id fallback (readOverview must never mint random ids)", () => {
    const snap = { overview: { variables: [{ name: "a", role: "dv" }, { name: "b", role: "dv" }] } };
    const first = readOverview(snap).variables.map((v) => v.id);
    const second = readOverview(snap).variables.map((v) => v.id);
    expect(first).toEqual(["v0", "v1"]);
    expect(first).toEqual(second); // stable across reads — React keys/diffs depend on it
  });
});

/**
 * ADR-0107 — answers to the chosen template's own OSF questions, keyed by OSF's
 * response key. The snapshot is jsonb we do not control across time, so the read
 * must survive anything a past or hand-edited build left behind.
 */
describe("readOverview — templateAnswers (ADR-0107)", () => {
  it("reads strings and string arrays through unchanged", () => {
    const ov = readOverview({
      overview: { templateAnswers: { "344-2": "H1: labels reduce accuracy.", "344-17": ["Other"] } },
    });
    expect(ov.templateAnswers).toEqual({ "344-2": "H1: labels reduce accuracy.", "344-17": ["Other"] });
  });

  it("preserves an option's stray whitespace — a trimmed option is a REJECTED option", () => {
    const exact = "Authors have observed the data. The authors cannot certify… ";
    expect(readOverview({ overview: { templateAnswers: { "344-4": exact } } }).templateAnswers["344-4"]).toBe(exact);
  });

  it("drops values it cannot read rather than guessing at them", () => {
    // An unreadable answer is not an answer. Coercing 42 to "42" would publish a
    // value the researcher never wrote — permanently, under a DOI (ADR-0107 D2).
    const ov = readOverview({
      overview: { templateAnswers: { good: "keep", n: 42, obj: { a: 1 }, mixed: ["ok", 7], nul: null } },
    });
    expect(ov.templateAnswers).toEqual({ good: "keep" });
  });

  it("defaults to {} for every shape of absent", () => {
    for (const v of [undefined, null, "nonsense", [], 5]) {
      expect(readOverview({ overview: { templateAnswers: v } }).templateAnswers).toEqual({});
    }
  });
});
