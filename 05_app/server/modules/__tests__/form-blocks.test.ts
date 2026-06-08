import { describe, expect, it } from "vitest";

import { getModuleDef } from "@/server/modules/registry";

const def = (key: string) => getModuleDef("core", key, "1.0.0")!;
const ok = (key: string, answer: unknown, config: Record<string, unknown> = {}) =>
  def(key).validateAnswer!(answer, config);

describe("V1.12 C2 form blocks", () => {
  it("registers the 6 form blocks as response-collecting", () => {
    for (const k of ["email", "url", "number", "date", "yes-no", "dropdown"]) {
      expect(def(k).collectsResponse).toBe(true);
      expect(def(k).responseSchema).not.toBeNull();
    }
  });

  it("email validates format", () => {
    expect(ok("email", { value: "hanna@uj.edu.pl" })).toBe(true);
    expect(ok("email", { value: "nope" })).toBe(false);
    expect(ok("email", { value: "" })).toBe(true); // empty handled by required check
  });

  it("url requires http(s)", () => {
    expect(ok("url", { value: "https://osf.io/x" })).toBe(true);
    expect(ok("url", { value: "osf.io" })).toBe(false);
  });

  it("number respects min/max", () => {
    expect(ok("number", { value: 5 }, { min: 0, max: 10 })).toBe(true);
    expect(ok("number", { value: 11 }, { min: 0, max: 10 })).toBe(false);
    expect(ok("number", { value: "x" }, { min: 0, max: 10 })).toBe(false);
  });

  it("date accepts ISO; rejects garbage", () => {
    expect(ok("date", { value: "2026-06-08" })).toBe(true);
    expect(ok("date", { value: "not-a-date" })).toBe(false);
  });

  it("yes-no accepts yes/no only", () => {
    expect(ok("yes-no", { value: "yes" })).toBe(true);
    expect(ok("yes-no", { value: "maybe" })).toBe(false);
  });

  it("dropdown requires the value be one of the options", () => {
    expect(ok("dropdown", { value: "B" }, { options: ["A", "B"] })).toBe(true);
    expect(ok("dropdown", { value: "Z" }, { options: ["A", "B"] })).toBe(false);
  });

  it("completeness reflects required config (prompt, dropdown options)", () => {
    expect(def("email").isComplete({ prompt: "Your email" })).toBe(true);
    expect(def("email").isComplete({ prompt: "" })).toBe(false);
    expect(def("dropdown").isComplete({ prompt: "Pick", options: [] })).toBe(false);
    expect(def("dropdown").isComplete({ prompt: "Pick", options: ["A"] })).toBe(true);
  });
});
