import { describe, expect, it } from "vitest";

import { handleIssue, isValidHandle, normalizeHandle, suggestHandleFromEmail } from "@/lib/profile/handle";

describe("public-profile handle rules (EE2, ADR-0077)", () => {
  it("normalizes to lowercase alphanumeric + single hyphens, trimmed", () => {
    expect(normalizeHandle("  Hanna O'Brien!! ")).toBe("hanna-o-brien");
    expect(normalizeHandle("A__B--C")).toBe("a-b-c");
    expect(normalizeHandle("---xyz---")).toBe("xyz");
  });

  it("accepts a clean handle and rejects bad ones with a reason", () => {
    expect(handleIssue("hanna-lab")).toBeNull();
    expect(isValidHandle("hanna-lab")).toBe(true);
    expect(handleIssue("ab")).toMatch(/at least/i); // too short
    expect(handleIssue("a".repeat(31))).toMatch(/at most/i); // too long
    expect(handleIssue("-nope")).toMatch(/hyphen/i);
    expect(handleIssue("nope-")).toMatch(/hyphen/i);
    expect(handleIssue("Bad Caps")).toMatch(/lowercase/i); // space + caps already excluded by regex
  });

  it("rejects reserved route segments", () => {
    // (single-letter reserved words like "u" are caught by the length rule first)
    for (const r of ["admin", "settings", "explore", "signup", "api"]) {
      expect(handleIssue(r)).toMatch(/reserved/i);
    }
  });

  it("suggests a handle from an email local part", () => {
    expect(suggestHandleFromEmail("Hanna.OBrien@uni.edu")).toBe("hanna-obrien");
    expect(suggestHandleFromEmail("x@y.com")).toBe("x");
  });
});
