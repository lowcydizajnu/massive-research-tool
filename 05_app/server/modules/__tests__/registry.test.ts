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

  it("social-post v2.0.0 adds veracity + tags and stays a stimulus", () => {
    const m = getModuleDef("core", "social-post", "2.0.0")!;
    expect(m.collectsResponse).toBe(false);
    expect(m.responseSchema).toBeNull();
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
