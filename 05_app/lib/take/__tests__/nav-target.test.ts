import { describe, expect, it } from "vitest";

import { resolveNavTarget, resolveScreenHref } from "@/lib/take/nav-target";

describe("resolveNavTarget", () => {
  it("resolves an external URL to a new tab", () => {
    expect(resolveNavTarget({ targetKind: "url", targetUrl: "https://example.com", targetStudyId: "" })).toEqual({
      href: "https://example.com",
      newTab: true,
    });
  });

  it("resolves a study target to its take-start, same tab, id-encoded", () => {
    expect(resolveNavTarget({ targetKind: "study", targetUrl: "", targetStudyId: "abc-123" })).toEqual({
      href: "/take/abc-123/start",
      newTab: false,
    });
    expect(resolveNavTarget({ targetKind: "study", targetUrl: "", targetStudyId: "a b" })).toEqual({
      href: "/take/a%20b/start",
      newTab: false,
    });
  });

  it("returns null when the target is blank, or for the screen kind", () => {
    expect(resolveNavTarget({ targetKind: "url", targetUrl: "   ", targetStudyId: "" })).toBeNull();
    expect(resolveNavTarget({ targetKind: "study", targetUrl: "", targetStudyId: "" })).toBeNull();
    expect(resolveNavTarget({ targetKind: "screen", targetUrl: "", targetStudyId: "" })).toBeNull();
  });
});

describe("resolveScreenHref (same-study jump)", () => {
  it("builds a same-session URL for a 1-based screen number", () => {
    expect(resolveScreenHref("/take/study-1/sess-9/2", 4)).toBe("/take/study-1/sess-9/3");
    expect(resolveScreenHref("/take/study-1/sess-9/2", 1)).toBe("/take/study-1/sess-9/0");
  });
  it("clamps a bad target to the first screen", () => {
    expect(resolveScreenHref("/take/s/x/5", 0)).toBe("/take/s/x/0");
    expect(resolveScreenHref("/take/s/x/5", -3)).toBe("/take/s/x/0");
  });
  it("returns null outside a take session (e.g. the Builder preview)", () => {
    expect(resolveScreenHref("/studies/abc/build", 2)).toBeNull();
    expect(resolveScreenHref("/take/study-1/start", 2)).toBeNull();
  });
});
