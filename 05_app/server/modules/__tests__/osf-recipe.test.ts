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
