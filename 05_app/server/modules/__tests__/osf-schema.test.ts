import { describe, expect, it } from "vitest";

import {
  byPage,
  isAnswered,
  isListQuestion,
  isReversibleListQuestion,
  prependAmendmentHeader,
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

describe("prependAmendmentHeader — the supersedes header reaches structured templates", () => {
  const qs = readOsfQuestions(PREREG);
  const firstLongText = qs.find((q) => q.kind === "long-text")!;
  const HEADER = "AMENDMENT - supersedes the registration at https://osf.io/abcde.\n\nReason: bigger N.";

  it("the fixture actually has a long-text question to land in", () => {
    expect(firstLongText).toBeTruthy();
  });

  it("prepends to the first long-text answer, preserving what the researcher wrote", () => {
    const responses = toRegistrationResponses(qs, { [firstLongText.key]: "My hypotheses." });
    const out = prependAmendmentHeader(responses, qs, HEADER);
    expect(out[firstLongText.key]).toBe(`${HEADER}\n\nMy hypotheses.`);
    // Original object is not mutated.
    expect(responses[firstLongText.key]).toBe("My hypotheses.");
  });

  it("fills the first long-text question with the header when it was unanswered", () => {
    const out = prependAmendmentHeader({}, qs, HEADER);
    expect(out[firstLongText.key]).toBe(HEADER);
  });

  it("returns the responses unchanged when the schema has no long-text question", () => {
    const noLongText = qs.filter((q) => q.kind !== "long-text");
    const responses = { "x": "y" } as Record<string, string | string[]>;
    expect(prependAmendmentHeader(responses, noLongText, HEADER)).toEqual(responses);
  });
});

/**
 * Shapes OBSERVED live on test.osf.io 2026-07-17 (draft-only probe, nothing
 * registered). These pin facts about a vendor we do not control — if OSF ever
 * changes them, these fail loudly rather than the filing failing quietly.
 */
describe("the OSF wire contract, as observed", () => {
  const qs = readOsfQuestions(PREREG);

  it("passes a multi-select through as an ARRAY — a bare string is a 400", () => {
    // ["<opt>"] -> 200 · "<opt>" -> 400 · "<a>, <b>" -> 400 · [] -> 200
    const out = toRegistrationResponses(qs, { "344-17": ["Other"] });
    expect(Array.isArray(out["344-17"])).toBe(true);
    expect(out["344-17"]).toEqual(["Other"]);
  });

  it("treats an empty multi-select as unanswered, and never emits it", () => {
    // OSF accepts [] with a 200, so it is not an error — it is simply no answer.
    expect(unansweredRequired(qs, { "344-17": [] }).map((q) => q.key)).toContain("344-17");
    expect(toRegistrationResponses(qs, { "344-17": [] })).toEqual({});
  });

  it("hands a select option to OSF byte-for-byte — trimming it would 400", () => {
    // Observed: the stray-whitespace option verbatim -> 200; trimmed -> 400.
    const q = qs.find((x) => x.key === "344-4")!;
    const stray = q.options.find((o) => o !== o.trim())!;
    const out = toRegistrationResponses(qs, { "344-4": stray });
    expect(out["344-4"]).toBe(stray);
    expect(out["344-4"]).not.toBe(stray.trim());
  });
});

/**
 * List-shaped questions (owner 2026-07-17): hypotheses are EDITED as separate
 * entries — matching how the researcher's own plan holds them — and COMBINED
 * into OSF's one text field only at push. This dissolves the reverse-sync
 * corruption problem: both sides are lists, so prefill and update-origin are
 * clean copies, never a text→structure parse.
 */
describe("list-shaped questions (hypotheses)", () => {
  const qs = readOsfQuestions(PREREG);
  const hyp = qs.find((q) => q.key === "344-2")!; // "Research questions or hypotheses"

  it("recognises the hypothesis question as list-shaped, and prose questions as not", () => {
    expect(isListQuestion(hyp)).toBe(true);
    expect(isListQuestion(qs.find((q) => q.key === "344-51")!)).toBe(false); // Sample size — prose
    expect(isListQuestion(qs.find((q) => q.key === "344-4")!)).toBe(false); // Foreknowledge — a select
  });

  it("combines list entries into OSF's single numbered text field at push", () => {
    const out = toRegistrationResponses(qs, {
      "344-2": ["Labels reduce perceived accuracy.", "The effect is larger for older adults."],
    });
    expect(out["344-2"]).toBe("1. Labels reduce perceived accuracy.\n2. The effect is larger for older adults.");
    expect(typeof out["344-2"]).toBe("string"); // OSF's field is text, never an array
  });

  it("still passes a real multi-select through as an array — not every array is a list question", () => {
    const out = toRegistrationResponses(qs, { "344-17": ["Randomized Experiment: …"] });
    expect(Array.isArray(out["344-17"])).toBe(true);
  });

  it("treats an empty hypothesis list as unanswered", () => {
    expect(unansweredRequired(qs, { "344-2": [] }).map((q) => q.key)).toContain("344-2");
    expect(toRegistrationResponses(qs, { "344-2": [] })).toEqual({});
  });
});

/**
 * Variables as list questions (owner 2026-07-17: "independent/dependent variables
 * might also be taken from the plan"). Manipulated (344-58) and Measured (344-62)
 * are list-shaped for prefill, but — unlike hypotheses — NOT reversible: the plan
 * holds them as structured rows, so update-origin would flatten them (D11
 * addendum). The list combines into OSF's one text field at push, same as hypotheses.
 */
describe("variables as list questions — prefill-only, not reversible", () => {
  const qs = readOsfQuestions(PREREG);
  const manipulated = qs.find((q) => q.key === "344-58")!; // "Manipulated variables"
  const measured = qs.find((q) => q.key === "344-62")!; // "Measured variables"

  it("recognises Manipulated and Measured variables as list-shaped", () => {
    expect(manipulated.label).toBe("Manipulated variables");
    expect(measured.label).toBe("Measured variables");
    expect(isListQuestion(manipulated)).toBe(true);
    expect(isListQuestion(measured)).toBe(true);
  });

  it("does NOT treat the file-upload variant (344-64) as a list question", () => {
    const fileVariant = qs.find((q) => q.key === "344-64")!; // "Measured variables - File upload"
    expect(fileVariant.kind).toBe("file");
    expect(isListQuestion(fileVariant)).toBe(false);
  });

  it("marks hypotheses reversible but variables NOT — the plan is variables' structured home", () => {
    expect(isReversibleListQuestion(qs.find((q) => q.key === "344-2")!)).toBe(true); // hypotheses
    expect(isReversibleListQuestion(manipulated)).toBe(false);
    expect(isReversibleListQuestion(measured)).toBe(false);
    // Every reversible question is a list question, but not vice-versa.
    expect(qs.filter(isReversibleListQuestion).every(isListQuestion)).toBe(true);
  });

  it("combines a variable list into OSF's single numbered text field at push", () => {
    const out = toRegistrationResponses(qs, {
      "344-58": ["Warning label presence — present / absent", "Message framing — gain / loss"],
    });
    expect(out["344-58"]).toBe("1. Warning label presence — present / absent\n2. Message framing — gain / loss");
    expect(typeof out["344-58"]).toBe("string");
  });
});

/**
 * Blank-row handling in list questions (found by the sync audit 2026-07-17). A
 * list editor shows an empty row by default and "+ Add" yields another, so `[""]`
 * and mixed `["A",""]` are reached in ordinary use. They must never file bogus
 * numbered empty lines under a permanent DOI, and must never read as "answered".
 */
describe("list questions — blank rows never leak to OSF or a false all-clear", () => {
  const qs = readOsfQuestions(PREREG);

  it("treats an all-blank list as blank (unanswered), for [] , [\"\"], and whitespace", () => {
    // 344-2 (hypotheses) is required — the completeness gate must flag all three.
    for (const v of [[], [""], ["   ", "\t"]] as string[][]) {
      expect(unansweredRequired(qs, { "344-2": v }).map((q) => q.key)).toContain("344-2");
      expect(isAnswered(v)).toBe(false);
      expect(toRegistrationResponses(qs, { "344-2": v })).toEqual({});
    }
  });

  it("a list with any real entry is answered; isAnswered matches the gate exactly", () => {
    const v = ["", "Real hypothesis", "  "];
    expect(isAnswered(v)).toBe(true);
    expect(unansweredRequired(qs, { "344-2": v }).map((q) => q.key)).not.toContain("344-2");
  });

  it("drops blank rows and renumbers the survivors — no '2. ' empty line, no gaps", () => {
    const out = toRegistrationResponses(qs, { "344-58": ["Warning label", "", "Message framing", "  "] });
    expect(out["344-58"]).toBe("1. Warning label\n2. Message framing");
  });

  it("still passes a real multi-select array straight through (kind decides shape, not the list heuristic)", () => {
    const out = toRegistrationResponses(qs, { "344-17": ["Randomized Experiment: …"] });
    expect(Array.isArray(out["344-17"])).toBe(true);
    expect(out["344-17"]).toEqual(["Randomized Experiment: …"]);
  });
});
