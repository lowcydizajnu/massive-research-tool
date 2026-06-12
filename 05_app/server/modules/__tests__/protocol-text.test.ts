import { describe, expect, it } from "vitest";

import { protocolText } from "@/server/modules/protocol-text";

const SNAPSHOT = {
  overview: {
    abstract: "We test misinformation.",
    hypotheses: ["Belief increases", "Sharing decreases"],
    sections: [],
    replicationNotes: "Changed the stimulus.",
  },
  blocks: [
    {
      instanceId: "a",
      source: "core",
      key: "likert-7",
      version: "1.0.0",
      title: "Believability",
      config: { prompt: "Believable?", leftAnchor: "No", rightAnchor: "Yes", required: true },
      visibility: { showIfCondition: ["treatment"] },
    },
    {
      instanceId: "b",
      source: "core",
      key: "field-group",
      version: "1.0.0",
      config: {
        prompt: "About you",
        required: true,
        fields: [
          { key: "street", label: "Street", type: "text", required: true },
          { key: "country", label: "Country", type: "dropdown", options: ["PL", "DE"] },
        ],
      },
      groupId: "g1",
    },
  ],
  groups: [{ id: "g1", title: "Demographics" }],
};

describe("protocolText (ADR-0031)", () => {
  it("serializes overview + blocks in researcher language, deterministic", () => {
    const lines = protocolText(SNAPSHOT);
    expect(lines).toContain("H1: Belief increases");
    expect(lines).toContain("Replication notes:");
    expect(lines.some((l) => l.includes("1. Likert (7-point) — “Believability”"))).toBe(true);
    expect(lines.some((l) => l.includes("Shown only for: treatment"))).toBe(true);
    expect(lines.some((l) => l.includes("Prompt: Believable?"))).toBe(true);
    expect(lines.some((l) => l.includes("Required: yes"))).toBe(true);
    expect(lines).toContain("Screen group: Demographics");
    expect(lines.some((l) => l.includes("Field: Street (text, required)"))).toBe(true);
    expect(lines.some((l) => l.includes("Choice: PL"))).toBe(true);
    expect(protocolText(SNAPSHOT)).toEqual(lines); // deterministic
  });
  it("empty snapshot still yields the section headers", () => {
    const lines = protocolText({});
    expect(lines[0]).toBe("OVERVIEW");
    expect(lines).toContain("PROTOCOL");
  });
});

describe("protocol text carries replication + consent documentation (ADR-0039/0035)", () => {
  it("includes intent, per-block rationale, and CUSTOM consent only", () => {
    const snapshot = {
      blocks: [
        {
          instanceId: "b1",
          source: "core",
          key: "likert-7",
          version: "1.0.0",
          config: { prompt: "How truthful?" },
          divergenceNote: "Original wording was ambiguous in pilot.",
        },
      ],
      overview: { abstract: "", hypotheses: [], sections: [], replicationNotes: "", replicationIntent: "direct" },
      consent: { body: "IRB-approved custom text." },
    };
    const lines = protocolText(snapshot);
    expect(lines).toContain("Replication kind: direct");
    expect(lines.some((l) => l.includes("Differs from the original: Original wording was ambiguous"))).toBe(true);
    expect(lines).toContain("CONSENT");
    expect(lines.some((l) => l.includes("IRB-approved custom text."))).toBe(true);
    // Default consent adds NO lines (no diff churn for ordinary studies).
    const plain = protocolText({ blocks: [] });
    expect(plain).not.toContain("CONSENT");
  });
});
