import { describe, expect, it } from "vitest";

import {
  aiNonDeterminismDisclosure,
  buildOpenEndedBody,
  buildRecipeResponses,
  derivationDisclosure,
  RECIPE_SCHEMA_NAME,
} from "@/server/modules/osf-recipe";
import { injectReplicationRecipe } from "@/server/modules/replication";
import { planTemplateKey, readOverview } from "@/server/modules/blocks";

const snapshot = {
  blocks: [
    {
      instanceId: "b1",
      source: "core",
      key: "likert-7",
      version: "1.0.0",
      config: { prompt: "How truthful?" },
      title: "Accuracy",
      divergenceNote: "Reworded for clarity.",
    },
  ],
  overview: {
    abstract: "We test source cues.",
    hypotheses: ["H1"],
    replicationNotes: "",
    replicationIntent: "direct",
    sections: [
      { id: "recipe-target-effect", heading: "Target effect", contentMd: "The original effect d=.4." },
      { id: "recipe-planned-sample", heading: "Planned sample", contentMd: "N=400, 95% power." },
      { id: "x", heading: "Analysis plan", contentMd: "Two-sided t-test." },
    ],
  },
};

describe("buildRecipeResponses (ADR-0005 am. 3 — keys verified live 2026-06-12)", () => {
  it("maps our data onto the verified Recipe keys; skips what we don't hold", () => {
    const r = buildRecipeResponses({ snapshot, sourceTitle: "Source cues", sourceAuthor: "Hanna" });
    expect(RECIPE_SCHEMA_NAME).toContain("Replication Recipe");
    expect(r["77-2"]).toContain("The original effect d=.4.");
    expect(r["77-2"]).toContain("Full protocol");
    expect(r["77-12"]).toBe("Source cues (Hanna)");
    expect(r["77-33"]).toBe("N=400, 95% power.");
    expect(r["77-73"]).toContain("Accuracy: Reworded for clarity.");
    expect(r["77-80"]).toBe("Two-sided t-test.");
    expect(Object.keys(r)).not.toContain("77-38"); // selects never auto-filled
  });

  it("amendment header leads the Description", () => {
    const r = buildRecipeResponses({ snapshot, amendmentHeader: "AMENDMENT - supersedes https://osf.io/x/." });
    expect(r["77-2"].startsWith("AMENDMENT")).toBe(true);
  });
});

/**
 * ADR-0101 dual read. The typed field is authoritative when filled; the legacy
 * section is the fallback so studies frozen before item ⑤ (which only ever had
 * sections) keep filing correctly. The suite above is exactly that fallback case
 * — it uses `recipe-planned-sample` + an "Analysis plan" heading and still maps.
 */
describe("buildRecipeResponses — typed plan fields (ADR-0101)", () => {
  const typed = {
    ...snapshot,
    overview: {
      ...snapshot.overview,
      samplingPlan: { text: "N=1200 (typed), 90% power on d=.2.", source: "researcher" },
      analysisPlan: { text: "Pre-registered ANCOVA (typed).", source: "researcher" },
      variables: [
        { id: "v1", name: "Warning label", role: "iv", instanceId: "b1", notes: "present/absent", source: "researcher" },
        { id: "v2", name: "Perceived accuracy", role: "dv", instanceId: null, notes: "", source: "researcher" },
      ],
      expectedOutcomes: [
        { id: "o1", hypothesisIndex: 1, prediction: "Labelled headlines rated less accurate.", source: "researcher" },
      ],
    },
  };

  it("typed samplingPlan/analysisPlan WIN over the legacy sections", () => {
    const r = buildRecipeResponses({ snapshot: typed });
    expect(r["77-33"]).toBe("N=1200 (typed), 90% power on d=.2.");
    expect(r["77-80"]).toBe("Pre-registered ANCOVA (typed).");
    // the legacy section text must not leak through once the typed field is filled
    expect(r["77-33"]).not.toContain("N=400");
    expect(r["77-80"]).not.toContain("Two-sided t-test");
  });

  it("falls back to the legacy sections when the typed fields are empty", () => {
    const r = buildRecipeResponses({ snapshot }); // no typed fields at all
    expect(r["77-33"]).toBe("N=400, 95% power.");
    expect(r["77-80"]).toBe("Two-sided t-test.");
  });

  it("carries variables + expected outcomes in the Description — no invented key", () => {
    const r = buildRecipeResponses({ snapshot: typed });
    expect(r["77-2"]).toContain("VARIABLES");
    expect(r["77-2"]).toContain("Warning label (Independent; measured by \"Accuracy\"; present/absent)");
    expect(r["77-2"]).toContain("Perceived accuracy (Dependent)"); // unlinked → no measure clause
    expect(r["77-2"]).toContain("EXPECTED OUTCOMES");
    expect(r["77-2"]).toContain("H1: Labelled headlines rated less accurate.");
    // Only keys verified live against api.osf.io may ever be emitted. 77-12
    // (original study) is absent here because no sourceTitle was passed.
    expect(Object.keys(r).sort()).toEqual(["77-2", "77-33", "77-73", "77-80"].sort());
  });

  it("still emits only verified keys when nothing typed is held", () => {
    const r = buildRecipeResponses({ snapshot });
    for (const k of Object.keys(r)) expect(["77-2", "77-12", "77-33", "77-73", "77-80"]).toContain(k);
  });

  /**
   * The Recipe's own three questions. Before these were typed they existed only as
   * sections auto-seeded onto FORKS, so a non-fork picking the Recipe had no way
   * to answer them at all (owner caught the picker being a visual no-op, which is
   * what exposed the half-built template).
   */
  describe("recipe-only typed fields", () => {
    const recipeTyped = {
      blocks: snapshot.blocks,
      overview: {
        abstract: "A",
        hypotheses: [],
        sections: [],
        replicationNotes: "",
        templateKey: "replication-recipe",
        originalStudy: { text: "Pennycook & Rand (2019), Cognition.", source: "researcher" },
        targetEffect: { text: "Accuracy nudge, d = .21.", source: "researcher" },
        differences: { text: "Ran online instead of lab.", source: "researcher" },
      },
    };

    it("a NON-fork can now answer original study / target effect / differences", () => {
      // No sourceTitle passed — this is not a fork.
      const r = buildRecipeResponses({ snapshot: recipeTyped });
      expect(r["77-12"]).toBe("Pennycook & Rand (2019), Cognition.");
      expect(r["77-2"]).toContain("Accuracy nudge, d = .21.");
      expect(r["77-73"]).toContain("Ran online instead of lab.");
    });

    it("a typed original study wins over the fork's source title", () => {
      const r = buildRecipeResponses({
        snapshot: recipeTyped,
        sourceTitle: "Source cues",
        sourceAuthor: "Hanna",
      });
      expect(r["77-12"]).toBe("Pennycook & Rand (2019), Cognition.");
    });

    it("a fork with no typed answer still falls back to its source study", () => {
      const r = buildRecipeResponses({ snapshot, sourceTitle: "Source cues", sourceAuthor: "Hanna" });
      expect(r["77-12"]).toBe("Source cues (Hanna)");
    });

    it("typed targetEffect/differences win the slot over the legacy seeded sections", () => {
      const withBoth = {
        ...snapshot,
        overview: { ...snapshot.overview, ...recipeTyped.overview, sections: snapshot.overview.sections },
      };
      const r = buildRecipeResponses({ snapshot: withBoth });
      // The typed answer LEADS the description — it took the target-effect slot
      // from the legacy `recipe-target-effect` section.
      expect(r["77-2"].startsWith("Accuracy nudge, d = .21.")).toBe(true);
      expect(r["77-73"]).toContain("Ran online instead of lab.");

      // The legacy section's text still appears further down, inside the
      // auto-generated protocol dump — protocolText lists every overview section,
      // and we deliberately don't delete a researcher's sections when they fill
      // the typed field. Only the SLOT is taken, not the prose.
      const legacyOnly = buildRecipeResponses({ snapshot });
      expect(legacyOnly["77-2"].startsWith("The original effect d=.4.")).toBe(true);
    });

    it("per-block divergence notes are still merged into differences alongside the typed answer", () => {
      const r = buildRecipeResponses({ snapshot: { ...recipeTyped, blocks: snapshot.blocks } });
      expect(r["77-73"]).toContain("Ran online instead of lab.");
      expect(r["77-73"]).toContain("Accuracy: Reworded for clarity."); // block divergenceNote
    });
  });
});

describe("buildOpenEndedBody — typed plan fields (ADR-0101)", () => {
  it("expresses the typed structure as labelled sections of the single summary", () => {
    const body = buildOpenEndedBody({
      blocks: snapshot.blocks,
      overview: {
        abstract: "A",
        hypotheses: ["H1"],
        sections: [],
        replicationNotes: "",
        samplingPlan: { text: "N=300.", source: "researcher" },
        analysisPlan: { text: "OLS.", source: "researcher" },
        variables: [{ id: "v1", name: "Label", role: "iv", instanceId: "b1", notes: "", source: "researcher" }],
        expectedOutcomes: [{ id: "o1", hypothesisIndex: null, prediction: "Null effect.", source: "researcher" }],
      },
    })!;
    expect(body).toContain("SAMPLING PLAN\nN=300.");
    expect(body).toContain("VARIABLES");
    expect(body).toContain('Label (Independent; measured by "Accuracy")');
    expect(body).toContain("EXPECTED OUTCOMES\n- Null effect."); // no hypothesis ref → no H prefix
    expect(body).toContain("ANALYSIS PLAN\nOLS.");
  });

  it("omits typed sections that are empty", () => {
    const body = buildOpenEndedBody({ blocks: [], overview: { abstract: "A", hypotheses: [], sections: [] } })!;
    expect(body).not.toContain("SAMPLING PLAN");
    expect(body).not.toContain("VARIABLES");
    expect(body).not.toContain("EXPECTED OUTCOMES");
    expect(body).not.toContain("ANALYSIS PLAN");
  });
});

describe("buildOpenEndedBody (audit step 3 — real OSF summary, not just a JSON dump)", () => {
  it("includes abstract, numbered hypotheses, and the protocol", () => {
    const body = buildOpenEndedBody(snapshot)!;
    expect(body).toContain("ABSTRACT\nWe test source cues.");
    expect(body).toContain("HYPOTHESES\n1. H1");
    expect(body).toContain("PROTOCOL");
    expect(body).toContain("Accuracy"); // the block surfaces in the protocol text
  });

  it("omits empty abstract/hypotheses sections (only the protocol scaffold remains)", () => {
    const body = buildOpenEndedBody({ blocks: [], overview: { abstract: "", hypotheses: [], sections: [] } });
    expect(body).toContain("PROTOCOL"); // protocolText always emits the protocol section
    expect(body).not.toContain("ABSTRACT");
    expect(body).not.toContain("HYPOTHESES");
  });
});

describe("aiNonDeterminismDisclosure (ADR-0061 amendment 1)", () => {
  const withAi = {
    blocks: [{ instanceId: "a1", source: "core", key: "ai-chat", version: "1.0.0", config: { role: "Interviewer" } }],
    overview: { abstract: "A", hypotheses: [], sections: [] },
  };

  it("is undefined when there is no ai-chat block", () => {
    expect(aiNonDeterminismDisclosure(snapshot)).toBeUndefined();
  });

  it("discloses non-determinism (and the count) when ai-chat is present", () => {
    const d = aiNonDeterminismDisclosure(withAi)!;
    expect(d).toContain("NON-DETERMINISM");
    expect(d).toContain("1 AI conversation step");
    expect(d).toContain("transcript");
  });

  it("auto-appends the disclosure to the Open-Ended registration body", () => {
    expect(buildOpenEndedBody(withAi)).toContain("NON-DETERMINISM DISCLOSURE");
    expect(buildOpenEndedBody(snapshot)).not.toContain("NON-DETERMINISM"); // no AI block → no note
  });
});

/**
 * ADR-0101 am. 1 D8. `fork` used to seed the Recipe sections with GUIDANCE TEXT
 * as their content, and item ⑤'s dual read treats a section as the fallback
 * answer — so a replication nobody had filled in published our own prompts to
 * OSF as the researcher's scientific commitment.
 */
describe("a fresh replication never files our own prompt text (ADR-0101 am. 1)", () => {
  const freshFork = (intent: "direct" | "conceptual" | "extension" = "direct") => {
    const overview = injectReplicationRecipe(readOverview({}), "Original Study Title", intent);
    return { blocks: [], groups: [], overview, theme: null, consent: null };
  };

  it("declares the intent — which is what selects the Recipe template", () => {
    const ov = readOverview(freshFork().overview ? freshFork() : {});
    expect(ov.replicationIntent).toBe("direct");
    expect(planTemplateKey(ov)).toBe("replication-recipe");
  });

  it("seeds NO sections — the typed fields are the plan now", () => {
    expect(freshFork().overview.sections).toEqual([]);
  });

  it("OMITS the planned sample rather than filing the instruction that used to sit there", () => {
    const res = buildRecipeResponses({ snapshot: freshFork(), sourceTitle: "Original Study Title" });
    // Was: "Target N and the power analysis that produced it (aim for high power…)"
    // published to OSF as the researcher's answer. Now the key is absent —
    // unanswered is honest; a prompt masquerading as an answer is not.
    expect(res["77-33"]).toBeUndefined();
    expect(JSON.stringify(res)).not.toMatch(/Target N and the power analysis/);
    expect(JSON.stringify(res)).not.toMatch(/Define the effect being replicated/);
    expect(JSON.stringify(res)).not.toMatch(/cite the paper \/ OSF page/);
    expect(JSON.stringify(res)).not.toMatch(/summarize anything protocol-wide/);
  });

  it("still honours a section on a study FROZEN before item ⑤ — that is what the dual read is for", () => {
    // A pre-⑤ snapshot: the section is the only place its plan exists, and it
    // can never be rewritten. Its text must keep filing.
    const legacy = {
      blocks: [],
      groups: [],
      overview: {
        ...readOverview({}),
        replicationIntent: "direct",
        sections: [{ id: "recipe-planned-sample", heading: "Planned sample", contentMd: "N=300, 90% power." }],
      },
      theme: null,
      consent: null,
    };
    expect(buildRecipeResponses({ snapshot: legacy, sourceTitle: "X" })["77-33"]).toBe("N=300, 90% power.");
  });

  it("the typed field wins over a legacy section when both exist", () => {
    const both = {
      blocks: [],
      groups: [],
      overview: {
        ...readOverview({}),
        replicationIntent: "direct",
        samplingPlan: { text: "N=500, preregistered.", source: "researcher" as const },
        sections: [{ id: "recipe-planned-sample", heading: "Planned sample", contentMd: "stale prose" }],
      },
      theme: null,
      consent: null,
    };
    expect(buildRecipeResponses({ snapshot: both, sourceTitle: "X" })["77-33"]).toBe("N=500, preregistered.");
  });
});

describe("derivationDisclosure (ADR-0106 D5 — provenance in the filing)", () => {
  /** A snapshot whose ONLY variable was read from the design, linked to b1. */
  const derivedSnap = (over: Record<string, unknown> = {}) => ({
    ...snapshot,
    overview: {
      ...snapshot.overview,
      variables: [{ id: "v1", name: "Accuracy rating", role: "dv", instanceId: "b1", notes: "", source: "derived" }],
      ...over,
    },
  });

  it("names the derived variable and the step it was read from", () => {
    const snap = derivedSnap();
    const text = derivationDisclosure(readOverview(snap), snap)!;
    expect(text).toContain("HOW THIS PLAN WAS PREPARED");
    // The block's researcher-given title, not the module key.
    expect(text).toContain('Accuracy rating (from "Accuracy")');
    // The role is intent and stays the researcher's — we must not claim we derived it.
    expect(text).not.toMatch(/role .*(was|were) read/i);
    expect(text).toContain("decided by the researcher");
  });

  it("is silent when the researcher opts out", () => {
    const snap = derivedSnap({ discloseDerivation: false });
    expect(derivationDisclosure(readOverview(snap), snap)).toBeUndefined();
  });

  it("defaults ON for a study saved before the toggle existed", () => {
    // No `discloseDerivation` key at all — the tolerant read must resolve true,
    // or every pre-⑨ study would silently opt out of a choice nobody made.
    const snap = derivedSnap();
    expect(readOverview(snap).discloseDerivation).toBe(true);
    expect(derivationDisclosure(readOverview(snap), snap)).toBeDefined();
  });

  it("claims nothing when the researcher wrote every variable by hand", () => {
    const snap = derivedSnap({
      variables: [{ id: "v1", name: "Trust", role: "dv", instanceId: null, notes: "", source: "researcher" }],
    });
    expect(derivationDisclosure(readOverview(snap), snap)).toBeUndefined();
  });

  it("rides in BOTH filings — Open-Ended summary and Recipe description", () => {
    const snap = derivedSnap();
    expect(buildOpenEndedBody(snap)).toContain("HOW THIS PLAN WAS PREPARED");
    expect(buildRecipeResponses({ snapshot: snap })["77-2"]).toContain("HOW THIS PLAN WAS PREPARED");
  });

  it("drops out of both filings on opt-out", () => {
    const snap = derivedSnap({ discloseDerivation: false });
    expect(buildOpenEndedBody(snap)).not.toContain("HOW THIS PLAN WAS PREPARED");
    expect(buildRecipeResponses({ snapshot: snap })["77-2"]).not.toContain("HOW THIS PLAN WAS PREPARED");
    // ...but the variable itself still files. Opting out of the provenance note
    // must not quietly drop the variable from the plan.
    expect(buildRecipeResponses({ snapshot: snap })["77-2"]).toContain("Accuracy rating");
  });
});
