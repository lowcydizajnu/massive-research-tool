import { describe, expect, it } from "vitest";

import {
  byPage,
  readOsfQuestions,
  toRegistrationResponses,
  unansweredRequired,
  type OsfSchemaBlock,
} from "@/server/modules/osf-schema";

// REAL payloads, captured from api.osf.io 2026-07-17 — not hand-written mocks.
// A mock agrees with whatever we already believe about a vendor; that is how the
// six-week DOI-null bug survived. These are what OSF actually serves.
import openEnded from "./fixtures/open-ended.blocks.json";
import osfPrereg from "./fixtures/osf-preregistration.blocks.json";

const PREREG = osfPrereg.data as OsfSchemaBlock[];
const OPEN_ENDED = openEnded.data as OsfSchemaBlock[];

describe("readOsfQuestions — against the live OSF Preregistration schema", () => {
  const qs = readOsfQuestions(PREREG);

  it("finds the 29 answerable questions, 16 of them required", () => {
    expect(qs).toHaveLength(29);
    expect(qs.filter((q) => q.required)).toHaveLength(16);
    expect(qs.filter((q) => q.required).map((q) => q.key)).toEqual([
      "344-2", "344-4", "344-17", "344-32", "344-40", "344-47", "344-51",
      "344-55", "344-58", "344-62", "344-66", "344-71", "344-75", "344-77",
      "344-79", "344-81",
    ]);
  });

  /**
   * ADR-0107 D5 — the defect this whole module exists to prevent. If labels were
   * read off the input block, EVERY label here would be "" and the form would
   * render blank rows with unlabelled inputs, while passing every other gate.
   */
  it("resolves every answerable label from the question-label sibling — none blank", () => {
    // Every question a researcher types into has a label. The two exceptions are
    // bare file-inputs (344-42, 344-60) whose own label block ships EMPTY — OSF
    // hangs them off the preceding question ("Study design", "Manipulated
    // variables") as an upload slot. Both optional; files are out of v1 scope.
    // Found by the real fixture contradicting my assumption that all 29 had labels.
    expect(qs.filter((q) => q.kind !== "file").every((q) => q.label.length > 0)).toBe(true);
    expect(qs.filter((q) => !q.label).map((q) => q.key)).toEqual(["344-42", "344-60"]);
    expect(qs.filter((q) => !q.label).every((q) => q.kind === "file" && !q.required)).toBe(true);
    expect(qs.find((q) => q.key === "344-2")!.label).toBe("Research questions or hypotheses");
    expect(qs.find((q) => q.key === "344-55")!.label).toBe("Starting and stopping rules");
    expect(qs.find((q) => q.key === "344-77")!.label).toBe("Inference criteria");
  });

  it("proves the labels could NOT have come from the input blocks", () => {
    // Every input block ships display_text = "" — this is why the sibling lookup exists.
    const inputs = PREREG.filter((b) => (b.attributes.block_type ?? "").endsWith("-input"));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((b) => !(b.attributes.display_text ?? "").trim())).toBe(true);
  });

  it("keeps OSF's own pages and order", () => {
    expect(byPage(qs).map((p) => p.page)).toEqual([
      "Overview", "Research Design", "Sampling", "Variables", "Analysis Plan", "Other",
    ]);
    expect(qs[0].key).toBe("344-2"); // index order, not fixture order
  });

  it("types each input so the right control renders", () => {
    expect(qs.find((q) => q.key === "344-2")!.kind).toBe("long-text");
    expect(qs.find((q) => q.key === "344-4")!.kind).toBe("single-select");
    expect(qs.find((q) => q.key === "344-17")!.kind).toBe("multi-select");
    expect(qs.find((q) => q.key === "344-42")!.kind).toBe("file");
  });

  /** ADR-0107 D6 — a trimmed option is a rejected option (enum IS enforced). */
  it("carries select options BYTE-EXACT, stray whitespace included", () => {
    const q = qs.find((x) => x.key === "344-4")!;
    expect(q.options).toHaveLength(8);
    expect(q.options[0]).toMatch(/^Data does not yet exist\./);
    // The live catalogue's trailing-space option. If a future refactor trims on
    // read, this fails — which is the point.
    const stray = q.options.find((o) => o !== o.trim());
    expect(stray).toBeDefined();
    expect(stray).toMatch(/Authors have observed the data\./);
  });

  it("never invents a key — every key came from the payload", () => {
    const real = new Set(
      PREREG.map((b) => b.attributes.registration_response_key).filter(Boolean),
    );
    expect(qs.every((q) => real.has(q.key))).toBe(true);
  });
});

describe("readOsfQuestions — Open-Ended (the default template)", () => {
  it("has exactly one required question: summary", () => {
    const qs = readOsfQuestions(OPEN_ENDED);
    // ADR-0101 Amendment 2: the claim that this template is "all-optional" was
    // FALSE, and a rule derived from it nearly vetoed OSF Preregistration.
    expect(qs.filter((q) => q.required).map((q) => q.key)).toEqual(["summary"]);
    expect(qs.find((q) => q.key === "uploader")!.required).toBe(false);
  });
});

describe("unansweredRequired — the only completeness check in the chain", () => {
  const qs = readOsfQuestions(PREREG);

  it("names all 16 when nothing is answered", () => {
    // Exactly the scenario run live on the sandbox: OSF returned 201.
    expect(unansweredRequired(qs, {})).toHaveLength(16);
  });

  it("counts whitespace and empty arrays as unanswered", () => {
    const q = unansweredRequired(qs, { "344-2": "   ", "344-17": [] });
    expect(q.map((x) => x.key)).toContain("344-2");
    expect(q.map((x) => x.key)).toContain("344-17");
  });

  it("clears once answered, and returns the question so the warning can name it", () => {
    const left = unansweredRequired(qs, { "344-2": "H1: labels reduce perceived accuracy." });
    expect(left.map((x) => x.key)).not.toContain("344-2");
    expect(left[0].label).toBeTruthy(); // the warning needs the human label
  });

  it("ignores optional questions entirely", () => {
    const optional = qs.filter((q) => !q.required).map((q) => q.key);
    expect(unansweredRequired(qs, {}).some((q) => optional.includes(q.key))).toBe(false);
  });
});

describe("toRegistrationResponses — what actually reaches OSF", () => {
  const qs = readOsfQuestions(PREREG);

  it("emits only answered keys", () => {
    const out = toRegistrationResponses(qs, { "344-2": "H1.", "344-40": "", "344-17": ["Other"] });
    expect(out).toEqual({ "344-2": "H1.", "344-17": ["Other"] });
  });

  it("drops any key the live schema does not have — an unknown key is a hard 400", () => {
    // additionalProperties:False is unconditional in OSF; unlike a missing
    // required key (silence), an unknown key fails the whole filing.
    const out = toRegistrationResponses(qs, { "344-2": "H1.", "77-2": "wrong schema's key" });
    expect(Object.keys(out)).toEqual(["344-2"]);
  });

  it("sends nothing when nothing is answered — never a payload of empties", () => {
    expect(toRegistrationResponses(qs, {})).toEqual({});
  });
});
