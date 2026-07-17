import { describe, expect, it } from "vitest";

import { deriveDesignFacts } from "@/server/modules/design-facts";

/** A snapshot shaped like the real thing — blocks in the order they were built. */
const snapshot = (blocks: unknown[]) => ({ blocks, groups: [], overview: {}, theme: null, consent: null });

const likert = (instanceId: string, prompt: string, extra: Record<string, unknown> = {}) => ({
  instanceId,
  source: "core",
  key: "likert-7",
  version: "1.0.0",
  config: { prompt, ...extra },
});

describe("deriveDesignFacts — facts, never intent (ADR-0106 D1)", () => {
  it("reads measures with their prompt and response type", () => {
    const f = deriveDesignFacts(snapshot([likert("b1", "How credible is this post?")]), []);
    expect(f.measures).toEqual([
      {
        instanceId: "b1",
        name: "Likert (7-point)",
        prompt: "How credible is this post?",
        responseType: "7-point scale (1–7)",
        shownOnlyTo: [],
      },
    ]);
  });

  it("counts screens in the order they were built", () => {
    const f = deriveDesignFacts(snapshot([likert("b1", "A"), likert("b2", "B"), likert("b3", "C")]), []);
    expect(f.blockCount).toBe(3);
  });

  /**
   * The load-bearing assertion of the whole item. Nothing shuffles blocks —
   * `randomizeOrder` is option-order inside one multiple-choice question — so
   * "presented in random order", the most standard sentence in a method section,
   * would be a fabrication. This flips only when randomization is DECLARED in
   * the snapshot (ADR-0106 D1's time-bound note).
   */
  it("NEVER claims randomization — nothing shuffles blocks today", () => {
    const f = deriveDesignFacts(snapshot([likert("b1", "A"), likert("b2", "B")]), []);
    expect(f.randomized).toBe(false);
    // Not derivable from a multiple-choice block's own option shuffling either.
    const withOptionShuffle = deriveDesignFacts(
      snapshot([
        { instanceId: "b1", source: "core", key: "multiple-choice", version: "1.0.0", config: { prompt: "Pick", options: ["a", "b"], randomizeOrder: true } },
      ]),
      [],
    );
    expect(withOptionShuffle.randomized).toBe(false);
  });

  it("names the arms a block is gated to — never 'treatment' or 'control'", () => {
    const f = deriveDesignFacts(
      snapshot([{ ...likert("b1", "Credible?"), visibility: { showIfCondition: ["treat"] } }]),
      [
        { slug: "treat", name: "Corrected headline", allocationWeight: 1 },
        { slug: "ctrl", name: "Original headline", allocationWeight: 1 },
      ],
    );
    // The arm's own NAME, which the researcher chose — not a role we invented.
    expect(f.measures[0].shownOnlyTo).toEqual(["Corrected headline"]);
    expect(f.arms).toEqual([
      { name: "Corrected headline", weight: 1 },
      { name: "Original headline", weight: 1 },
    ]);
  });

  it("drops a gate whose condition no longer exists rather than showing a raw slug", () => {
    const f = deriveDesignFacts(
      snapshot([{ ...likert("b1", "?"), visibility: { showIfCondition: ["deleted-arm"] } }]),
      [{ slug: "ctrl", name: "Control", allocationWeight: 1 }],
    );
    expect(f.measures[0].shownOnlyTo).toEqual([]);
  });

  it("reports configured timings verbatim", () => {
    const f = deriveDesignFacts(
      snapshot([
        { instanceId: "t1", source: "core", key: "timed-exposure", version: "1.0.0", config: { exposureMs: 3000 } },
        { instanceId: "t2", source: "core", key: "forced-wait", version: "1.0.0", config: { waitSeconds: 5 } },
      ]),
      [],
    );
    expect(f.timings.map((t) => t.value)).toEqual(["3000 ms", "5 s"]);
  });

  it("offers a candidate variable per measure, with its data type — but no role", () => {
    const f = deriveDesignFacts(snapshot([likert("b1", "Credible?")]), []);
    // Carries the PROMPT so a list of three Likerts is tellable apart — the
    // name alone is the module's, and identical across every instance.
    expect(f.candidateVariables).toEqual([
      { instanceId: "b1", name: "Likert (7-point)", prompt: "Credible?", dataType: "7-point scale (1–7)" },
    ]);
    // Role is intent. Nothing in the fact set assigns one.
    expect(JSON.stringify(f)).not.toMatch(/"role"/);
  });

  it("stops offering a block already claimed by a declared variable", () => {
    const f = deriveDesignFacts(snapshot([likert("b1", "A"), likert("b2", "B")]), [], ["b1"]);
    expect(f.candidateVariables.map((c) => c.instanceId)).toEqual(["b2"]);
  });

  it("ignores blocks that collect no response — they are not measures", () => {
    const f = deriveDesignFacts(
      snapshot([
        { instanceId: "x", source: "core", key: "text", version: "1.0.0", config: { body: "Welcome" } },
        likert("b1", "Credible?"),
      ]),
      [],
    );
    expect(f.measures.map((m) => m.instanceId)).toEqual(["b1"]);
    expect(f.blockCount).toBe(2); // but it IS a screen
  });

  it("is empty and honest for a study with no blocks", () => {
    const f = deriveDesignFacts(snapshot([]), []);
    expect(f).toMatchObject({ blockCount: 0, arms: [], measures: [], candidateVariables: [] });
  });
});
