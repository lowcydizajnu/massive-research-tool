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
});
