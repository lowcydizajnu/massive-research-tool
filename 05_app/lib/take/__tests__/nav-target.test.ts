import { describe, expect, it } from "vitest";

import { resolveNavTarget } from "@/lib/take/nav-target";

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

  it("returns null when the target is blank", () => {
    expect(resolveNavTarget({ targetKind: "url", targetUrl: "   ", targetStudyId: "" })).toBeNull();
    expect(resolveNavTarget({ targetKind: "study", targetUrl: "", targetStudyId: "" })).toBeNull();
  });
});
