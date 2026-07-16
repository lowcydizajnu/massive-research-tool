import { describe, expect, it } from "vitest";

import {
  aiNonDeterminismDisclosure,
  buildOpenEndedBody,
  buildRecipeResponses,
  RECIPE_SCHEMA_NAME,
} from "@/server/modules/osf-recipe";

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
