import { describe, expect, it } from "vitest";

import { DEFAULT_CONSENT, hasCustomConsent, readConsent } from "@/server/modules/consent";
import { changelogBetween } from "@/server/modules/changelog";

describe("consent screen (ADR-0035)", () => {
  it("missing or empty fields fall back to the defaults (existing studies unchanged)", () => {
    expect(readConsent({})).toEqual(DEFAULT_CONSENT);
    expect(readConsent({ consent: { body: "", agreeLabel: "  " } })).toEqual(DEFAULT_CONSENT);
    const custom = readConsent({ consent: { body: "IRB-approved text." } });
    expect(custom.body).toBe("IRB-approved text.");
    expect(custom.agreeLabel).toBe(DEFAULT_CONSENT.agreeLabel);
  });

  it("hasCustomConsent distinguishes default vs customized", () => {
    expect(hasCustomConsent({})).toBe(false);
    expect(hasCustomConsent({ consent: { disagreeLabel: "No thanks" } })).toBe(true);
  });

  it("changelog reports a consent change", () => {
    const prev = { blocks: [] };
    const next = { blocks: [], consent: { body: "New consent wording." } };
    expect(changelogBetween(prev, next)).toContain("～ Consent screen updated");
    expect(changelogBetween(prev, prev)).toEqual([]);
  });
});
