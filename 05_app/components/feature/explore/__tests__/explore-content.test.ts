import { describe, expect, it } from "vitest";

import { templateCoverSrc } from "@/components/feature/explore/template-cover";
import {
  STARTER_AB_TEMPLATE_ID,
  STARTER_MISINFO_TEMPLATE_ID,
  STARTER_PILOT_TEMPLATE_ID,
} from "@/lib/system/starter";

describe("templateCoverSrc — featured-template cover precedence (ADR-0091)", () => {
  it("app-shipped starters resolve to their committed cover asset", () => {
    expect(templateCoverSrc({ id: STARTER_MISINFO_TEMPLATE_ID, coverImageR2Key: null })).toBe(
      "/explore-covers/misinfo.png",
    );
    expect(templateCoverSrc({ id: STARTER_AB_TEMPLATE_ID, coverImageR2Key: null })).toBe(
      "/explore-covers/ab.png",
    );
    expect(templateCoverSrc({ id: STARTER_PILOT_TEMPLATE_ID, coverImageR2Key: null })).toBe(
      "/explore-covers/pilot.png",
    );
  });

  it("the committed starter asset wins even if a coverImageR2Key is also set", () => {
    expect(
      templateCoverSrc({ id: STARTER_MISINFO_TEMPLATE_ID, coverImageR2Key: "ws/x/y.png" }),
    ).toBe("/explore-covers/misinfo.png");
  });

  it("a non-starter template with a coverImageR2Key uses the /api/media gateway", () => {
    expect(templateCoverSrc({ id: "user-template-123", coverImageR2Key: "ws/w/abc.png" })).toBe(
      "/api/media/ws/w/abc.png",
    );
  });

  it("a template with neither returns null (card falls back to the gradient)", () => {
    expect(templateCoverSrc({ id: "user-template-123", coverImageR2Key: null })).toBeNull();
    // The survey starter intentionally has no committed cover yet.
    expect(templateCoverSrc({ id: "starter-survey-v1", coverImageR2Key: null })).toBeNull();
  });
});
