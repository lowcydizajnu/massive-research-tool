import { describe, expect, it } from "vitest";

import { getModuleDef } from "@/server/modules/registry";

describe("module response schemas (ADR-0014 answer validation)", () => {
  it("social-post is a pure stimulus — collects no response", () => {
    const m = getModuleDef("core", "social-post", "1.0.0")!;
    expect(m.collectsResponse).toBe(false);
    expect(m.responseSchema).toBeNull();
  });

  it("likert-7 collects an integer 1..7 and rejects out-of-range / non-integer / empty", () => {
    const m = getModuleDef("core", "likert-7", "1.0.0")!;
    expect(m.collectsResponse).toBe(true);
    const schema = m.responseSchema!;

    expect(schema.safeParse({ value: 1 }).success).toBe(true);
    expect(schema.safeParse({ value: 7 }).success).toBe(true);
    expect(schema.safeParse({ value: 4 }).success).toBe(true);

    expect(schema.safeParse({ value: 0 }).success).toBe(false);
    expect(schema.safeParse({ value: 8 }).success).toBe(false);
    expect(schema.safeParse({ value: 3.5 }).success).toBe(false);
    expect(schema.safeParse({ value: "4" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("social-post v2.0.0 adds veracity + tags; collects engagement interactions (ADR-0024)", () => {
    const m = getModuleDef("core", "social-post", "2.0.0")!;
    expect(m.collectsResponse).toBe(true);
    expect(m.responseSchema).not.toBeNull();
    expect(m.configSchema.safeParse({
      headline: "h", body: "b", source: "s",
      veracityGroundTruth: "misleading", topicTags: ["vaccines"],
      imageUrl: "", shareCountVisible: false,
    }).success).toBe(true);
    // veracity is an enum — a bad value is rejected.
    expect(m.configSchema.safeParse({
      headline: "h", body: "b", source: "s",
      veracityGroundTruth: "kinda-true", topicTags: [], imageUrl: "", shareCountVisible: false,
    }).success).toBe(false);
    // v1.0.0 is still resolvable for studies pinned to it.
    expect(getModuleDef("core", "social-post", "1.0.0")).toBeDefined();
  });

  it("multiple-choice: selected[] shape; empty selection counts as blank", () => {
    const m = getModuleDef("core", "multiple-choice", "1.0.0")!;
    expect(m.collectsResponse).toBe(true);
    expect(m.responseSchema!.safeParse({ selected: ["a"] }).success).toBe(true);
    expect(m.responseSchema!.safeParse({ selected: [] }).success).toBe(true); // shape ok…
    expect(m.isAnswerEmpty!({ selected: [] })).toBe(true); // …but blank for required-check
    expect(m.isAnswerEmpty!({ selected: ["a"] })).toBe(false);
  });

  it("free-text: text shape; whitespace-only counts as blank", () => {
    const m = getModuleDef("core", "free-text", "1.0.0")!;
    expect(m.collectsResponse).toBe(true);
    expect(m.responseSchema!.safeParse({ text: "hello" }).success).toBe(true);
    expect(m.isAnswerEmpty!({ text: "   " })).toBe(true);
    expect(m.isAnswerEmpty!({ text: "x" })).toBe(false);
  });

  it("slider: numeric value shape", () => {
    const m = getModuleDef("core", "slider", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ value: 42 }).success).toBe(true);
    expect(m.responseSchema!.safeParse({ value: "42" }).success).toBe(false);
    expect(m.isAnswerEmpty!({ value: 0 })).toBe(false);
    expect(m.isAnswerEmpty!({})).toBe(true);
  });

  it("ranking: order[] shape; empty order is blank", () => {
    const m = getModuleDef("core", "ranking", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ order: ["b", "a"] }).success).toBe(true);
    expect(m.isAnswerEmpty!({ order: [] })).toBe(true);
    expect(m.isAnswerEmpty!({ order: ["a"] })).toBe(false);
  });

  it("attention-check: single selection shape + a correct answer in config", () => {
    const m = getModuleDef("core", "attention-check", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ selected: ["Strongly agree"] }).success).toBe(true);
    expect((m.defaultConfig as { correctAnswer: string }).correctAnswer).toBe("Strongly agree");
    expect(m.isAnswerEmpty!({ selected: [] })).toBe(true);
  });

  it("demographics: optional fields; blank when none filled", () => {
    const m = getModuleDef("core", "demographics", "1.0.0")!;
    expect(m.responseSchema!.safeParse({ age: "30", country: "PL" }).success).toBe(true);
    expect(m.isAnswerEmpty!({})).toBe(true);
    expect(m.isAnswerEmpty!({ gender: "Woman" })).toBe(false);
  });
});

describe("config-membership / range validation (PR-2 hardening)", () => {
  it("multiple-choice: selections must be among options; single-select caps at 1", () => {
    const m = getModuleDef("core", "multiple-choice", "1.0.0")!;
    const cfg = { options: ["A", "B", "C"], multiple: false };
    expect(m.validateAnswer!({ selected: ["B"] }, cfg)).toBe(true);
    expect(m.validateAnswer!({ selected: ["Z"] }, cfg)).toBe(false); // not an option
    expect(m.validateAnswer!({ selected: ["A", "B"] }, cfg)).toBe(false); // >1 on single
    expect(m.validateAnswer!({ selected: ["A", "B"] }, { options: ["A", "B"], multiple: true })).toBe(true);
  });

  it("slider: value must be within [min, max]", () => {
    const m = getModuleDef("core", "slider", "1.0.0")!;
    expect(m.validateAnswer!({ value: 50 }, { min: 0, max: 100 })).toBe(true);
    expect(m.validateAnswer!({ value: 150 }, { min: 0, max: 100 })).toBe(false);
  });

  it("ranking: ranked entries must be among the items", () => {
    const m = getModuleDef("core", "ranking", "1.0.0")!;
    expect(m.validateAnswer!({ order: ["b", "a"] }, { items: ["a", "b"] })).toBe(true);
    expect(m.validateAnswer!({ order: ["x"] }, { items: ["a", "b"] })).toBe(false);
  });

  it("attention-check: the selection must be one of the options", () => {
    const m = getModuleDef("core", "attention-check", "1.0.0")!;
    const cfg = { options: ["Disagree", "Agree"], correctAnswer: "Agree" };
    expect(m.validateAnswer!({ selected: ["Agree"] }, cfg)).toBe(true);
    expect(m.validateAnswer!({ selected: ["Maybe"] }, cfg)).toBe(false);
  });

  it("bounds: free-text caps at 10k chars; mc selection strings cap at 500", () => {
    const ft = getModuleDef("core", "free-text", "1.0.0")!;
    expect(ft.responseSchema!.safeParse({ text: "x".repeat(10001) }).success).toBe(false);
    const mc = getModuleDef("core", "multiple-choice", "1.0.0")!;
    expect(mc.responseSchema!.safeParse({ selected: ["x".repeat(501)] }).success).toBe(false);
  });
});

import { getModuleDef as getDef } from "@/server/modules/registry";

describe("social-post v2 engagement interactions (ADR-0024)", () => {
  const def = getDef("core", "social-post", "2.0.0")!;
  it("collects an interaction answer; v1 stays a pure stimulus", () => {
    expect(def.collectsResponse).toBe(true);
    expect(def.responseSchema!.safeParse({ liked: true, shared: false }).success).toBe(true);
    expect(def.responseSchema!.safeParse({ liked: true, shared: false, comment: "lol" }).success).toBe(true);
    expect(getDef("core", "social-post", "1.0.0")!.collectsResponse).toBe(false);
  });
  it("never blocks the participant (interaction is optional)", () => {
    expect(def.isAnswerEmpty!({ liked: false, shared: false })).toBe(false);
  });
  it("single-reaction mode rejects liking AND sharing together", () => {
    expect(def.validateAnswer!({ liked: true, shared: true }, { singleReaction: true })).toBe(false);
    expect(def.validateAnswer!({ liked: true, shared: false }, { singleReaction: true })).toBe(true);
    expect(def.validateAnswer!({ liked: true, shared: true }, { singleReaction: false })).toBe(true);
  });
  it("rejects a comment when the researcher disabled comments", () => {
    expect(def.validateAnswer!({ liked: false, shared: false, comment: "hi" }, { allowComments: false })).toBe(false);
    expect(def.validateAnswer!({ liked: false, shared: false }, { allowComments: false })).toBe(true);
    expect(def.validateAnswer!({ liked: false, shared: false, comment: "hi" }, { allowComments: true })).toBe(true);
  });
  it("default config carries engagement controls (no legacy shareCountVisible)", () => {
    expect(def.configSchema.safeParse(def.defaultConfig).success).toBe(true);
    expect("likesCount" in def.defaultConfig && "allowComments" in def.defaultConfig).toBe(true);
    expect("shareCountVisible" in def.defaultConfig).toBe(false);
  });
});
