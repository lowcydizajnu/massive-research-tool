import { describe, expect, it } from "vitest";

import { CURRENT_LEGAL_VERSION, getLegalDoc, isLegalKind } from "@/lib/legal/content";

describe("legal content (legal-baseline LG1)", () => {
  it("recognizes valid kinds, rejects others", () => {
    expect(isLegalKind("terms")).toBe(true);
    expect(isLegalKind("privacy")).toBe(true);
    expect(isLegalKind("cookies")).toBe(true);
    expect(isLegalKind("nope")).toBe(false);
  });

  it("returns the in-force version by default; a specific version on request; null for missing", () => {
    const t = getLegalDoc("terms");
    expect(t?.version).toBe(CURRENT_LEGAL_VERSION.terms);
    expect(getLegalDoc("terms", 1)?.version).toBe(1);
    expect(getLegalDoc("terms", 999)).toBeNull();
  });

  it("every in-force doc has a body + effective date", () => {
    for (const kind of ["terms", "privacy", "cookies"] as const) {
      const d = getLegalDoc(kind);
      expect(d?.body.length ?? 0).toBeGreaterThan(0);
      expect(d?.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
