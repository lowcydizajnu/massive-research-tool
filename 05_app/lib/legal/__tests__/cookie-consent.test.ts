import { describe, expect, it } from "vitest";

import { isCookieConsentChoice } from "@/lib/legal/cookie-consent";

describe("cookie-consent (legal-baseline LG2)", () => {
  it("validates the two consent tiers, rejects anything else", () => {
    expect(isCookieConsentChoice("all")).toBe(true);
    expect(isCookieConsentChoice("necessary")).toBe(true);
    expect(isCookieConsentChoice("analytics")).toBe(false);
    expect(isCookieConsentChoice(null)).toBe(false);
    expect(isCookieConsentChoice(undefined)).toBe(false);
  });
});
