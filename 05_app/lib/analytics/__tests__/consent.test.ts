import { describe, expect, it } from "vitest";

import { shouldCaptureAnalytics, shouldRecordSession } from "@/lib/analytics/consent";

describe("analytics consent gating (ADR-0074)", () => {
  it("captures + records ONLY on 'accept all'", () => {
    expect(shouldCaptureAnalytics("all")).toBe(true);
    expect(shouldRecordSession("all")).toBe(true);
  });

  it("does not capture or record on 'necessary'", () => {
    expect(shouldCaptureAnalytics("necessary")).toBe(false);
    expect(shouldRecordSession("necessary")).toBe(false);
  });

  it("treats no recorded choice (null/undefined) as no-capture", () => {
    expect(shouldCaptureAnalytics(null)).toBe(false);
    expect(shouldCaptureAnalytics(undefined)).toBe(false);
    expect(shouldRecordSession(null)).toBe(false);
    expect(shouldRecordSession(undefined)).toBe(false);
  });
});
