import { describe, expect, it } from "vitest";

import { UI_COPY_DEFAULTS, formatProgress, resolveUiCopy, sanitizeUiCopy } from "@/lib/take/ui-copy";

describe("ui-copy (editable participant chrome)", () => {
  it("resolves overrides over defaults; blank/missing/unknown fall back", () => {
    const r = resolveUiCopy({ continueButton: "Dalej", thankYouTitle: "  ", bogus: "x" });
    expect(r.continueButton).toBe("Dalej"); // override wins
    expect(r.thankYouTitle).toBe(UI_COPY_DEFAULTS.thankYouTitle); // blank → default
    expect(r.backButton).toBe(UI_COPY_DEFAULTS.backButton); // missing → default
    expect(r).not.toHaveProperty("bogus"); // unknown key dropped
  });

  it("resolves to all defaults when nothing is set", () => {
    expect(resolveUiCopy(undefined)).toEqual(UI_COPY_DEFAULTS);
    expect(resolveUiCopy(null)).toEqual(UI_COPY_DEFAULTS);
  });

  it("formats the progress template", () => {
    expect(formatProgress("Page {n} of {total}", 2, 5)).toBe("Page 2 of 5");
    expect(formatProgress("Strona {n}/{total}", 1, 3)).toBe("Strona 1/3");
  });

  it("sanitize keeps only known non-empty keys, trimmed + capped", () => {
    const s = sanitizeUiCopy({ continueButton: "  Go  ", backButton: "   ", nope: "x" });
    expect(s).toEqual({ continueButton: "Go" });
  });
});
