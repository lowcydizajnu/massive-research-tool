import { describe, expect, it } from "vitest";

import { getModuleDef } from "@/server/modules/registry";

const def = getModuleDef("core", "field-group", "1.0.0")!;

const CONFIG = {
  prompt: "About you",
  required: true,
  fields: [
    { key: "street", label: "Street", type: "text", required: true },
    { key: "age", label: "Age", type: "number" },
    { key: "mail", label: "Email", type: "email" },
    { key: "country", label: "Country", type: "dropdown", options: ["PL", "DE"] },
    { key: "consent", label: "OK?", type: "yes-no" },
  ],
};

describe("field-group (ADR-0030)", () => {
  it("registers as a response-collecting module with a valid default config", () => {
    expect(def.collectsResponse).toBe(true);
    expect(def.configSchema.safeParse(def.defaultConfig).success).toBe(true);
    expect(def.configSchema.safeParse(CONFIG).success).toBe(true);
  });

  it("accepts a well-formed answer", () => {
    expect(
      def.validateAnswer!(
        { values: { street: "Main 1", age: 30, mail: "a@b.co", country: "PL", consent: "yes" } },
        CONFIG,
      ),
    ).toBe(true);
  });

  it("rejects per-field violations (missing required, bad email, off-list dropdown, bad yes-no, stray key)", () => {
    expect(def.validateAnswer!({ values: { age: 30 } }, CONFIG)).toBe(false); // street required
    expect(def.validateAnswer!({ values: { street: "x", mail: "nope" } }, CONFIG)).toBe(false);
    expect(def.validateAnswer!({ values: { street: "x", country: "FR" } }, CONFIG)).toBe(false);
    expect(def.validateAnswer!({ values: { street: "x", consent: "maybe" } }, CONFIG)).toBe(false);
    expect(def.validateAnswer!({ values: { street: "x", hacked: "1" } }, CONFIG)).toBe(false);
  });

  it("optional fields may stay empty; number must be numeric", () => {
    expect(def.validateAnswer!({ values: { street: "x" } }, CONFIG)).toBe(true);
    expect(def.validateAnswer!({ values: { street: "x", age: "30" } }, CONFIG)).toBe(false);
  });

  it("isAnswerEmpty + isComplete behave", () => {
    expect(def.isAnswerEmpty!({ values: {} })).toBe(true);
    expect(def.isAnswerEmpty!({ values: { street: "  " } })).toBe(true);
    expect(def.isAnswerEmpty!({ values: { street: "Main" } })).toBe(false);
    expect(def.isComplete(CONFIG)).toBe(true);
    expect(def.isComplete({ ...CONFIG, prompt: "" })).toBe(false);
    expect(def.isComplete({ ...CONFIG, fields: [] })).toBe(false);
    expect(
      def.isComplete({ ...CONFIG, fields: [{ key: "c", label: "C", type: "dropdown", options: [" "] }] }),
    ).toBe(false);
  });
});
