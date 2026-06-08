import { describe, expect, it } from "vitest";

import { getModuleDef } from "@/server/modules/registry";

const def = (key: string) => getModuleDef("core", key, "1.0.0")!;
const ok = (key: string, answer: unknown, config: Record<string, unknown> = {}) =>
  def(key).validateAnswer!(answer, config);

describe("V1.12 Wave 3 — numeric research scales", () => {
  it("registers nps / rating-stars / vas as response-collecting", () => {
    for (const k of ["nps", "rating-stars", "vas"]) {
      expect(def(k).collectsResponse).toBe(true);
      expect(def(k).responseSchema).not.toBeNull();
    }
  });

  it("nps accepts 0..10 integers only", () => {
    expect(ok("nps", { value: 0 })).toBe(true);
    expect(ok("nps", { value: 10 })).toBe(true);
    expect(ok("nps", { value: 11 })).toBe(false);
    expect(ok("nps", { value: 7.5 })).toBe(false);
    expect(def("nps").isAnswerEmpty!({})).toBe(true);
  });

  it("rating-stars respects the configured max", () => {
    expect(ok("rating-stars", { value: 5 }, { max: 5 })).toBe(true);
    expect(ok("rating-stars", { value: 6 }, { max: 5 })).toBe(false);
    expect(ok("rating-stars", { value: 7 }, { max: 7 })).toBe(true);
    expect(ok("rating-stars", { value: 0 }, { max: 5 })).toBe(false);
  });

  it("vas accepts any value within min/max (continuous)", () => {
    expect(ok("vas", { value: 42.7 }, { min: 0, max: 100 })).toBe(true);
    expect(ok("vas", { value: 100 }, { min: 0, max: 100 })).toBe(true);
    expect(ok("vas", { value: 120 }, { min: 0, max: 100 })).toBe(false);
  });
});
