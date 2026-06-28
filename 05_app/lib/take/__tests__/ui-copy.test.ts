import { describe, expect, it } from "vitest";

import { BLOCK_COPY_DEFAULTS, UI_COPY_DEFAULTS, WORDING_GROUPS, formatProgress, readBlockCopy, resolveUiCopy, sanitizeUiCopy } from "@/lib/take/ui-copy";

describe("ui-copy (editable participant chrome)", () => {
  it("gates the Social post wording group on the social-post block (feedback 01KW4S698)", () => {
    const social = WORDING_GROUPS.find((g) => g.title === "Social post");
    expect(social?.requiresBlockKey).toBe("social-post");
    // Chrome groups are always shown (no block requirement).
    expect(WORDING_GROUPS.filter((g) => !g.requiresBlockKey).length).toBeGreaterThanOrEqual(3);
  });

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

  it("sanitize also keeps block-internal keys (social-post labels)", () => {
    const s = sanitizeUiCopy({ postLike: "Polub", postShare: "  ", nope: "x" });
    expect(s).toEqual({ postLike: "Polub" });
  });

  it("readBlockCopy returns only SET overrides (no defaults — blank = native)", () => {
    expect(readBlockCopy({ postCommentPlaceholder: "Napisz komentarz" })).toEqual({
      postCommentPlaceholder: "Napisz komentarz",
    });
    expect(readBlockCopy(undefined)).toEqual({}); // nothing set → native everywhere
    expect(readBlockCopy({ postLike: "  " })).toEqual({}); // blank → native
    expect(Object.keys(BLOCK_COPY_DEFAULTS)).toContain("postLike");
  });
});
