import { describe, expect, it } from "vitest";

import {
  PANEL_DEFAULTS,
  fillPanelPlaceholders,
  resolvePanelIntegration,
  sanitizePanelIntegration,
} from "@/lib/take/panel-integration";

describe("panel-integration (ADR-0071)", () => {
  it("resolves empty config to defaults (standard flow)", () => {
    expect(resolvePanelIntegration({})).toEqual(PANEL_DEFAULTS);
    expect(resolvePanelIntegration(null).respondentIdParam).toBe("res_id");
  });

  it("sanitize keeps valid http(s) URLs, drops others, clamps delays", () => {
    const s = sanitizePanelIntegration({
      respondentIdParam: "PID_1",
      completionUrl: "https://panel.example.com/done?id={ext_id}",
      completionDelaySec: 9999,
      refusalUrl: "javascript:alert(1)",
      refusalDelaySec: -5,
      skipRefusalScreen: true,
    });
    expect(s.respondentIdParam).toBe("PID_1");
    expect(s.completionUrl).toBe("https://panel.example.com/done?id={ext_id}");
    expect(s.completionDelaySec).toBe(600); // clamped to max
    expect(s.refusalUrl).toBe(""); // non-http dropped
    expect(s.refusalDelaySec).toBe(0); // clamped to min
    expect(s.skipRefusalScreen).toBe(true);
  });

  it("rejects a bad param name back to the default", () => {
    expect(sanitizePanelIntegration({ respondentIdParam: "has spaces!" }).respondentIdParam).toBe("res_id");
  });

  it("fills {ext_id}/{session_id} placeholders, URL-encoded", () => {
    expect(
      fillPanelPlaceholders("https://p.com/r?e={ext_id}&s={session_id}", { extId: "a b", sessionId: "S1" }),
    ).toBe("https://p.com/r?e=a%20b&s=S1");
    // Missing values resolve to empty.
    expect(fillPanelPlaceholders("https://p.com/r?e={ext_id}", { extId: null })).toBe("https://p.com/r?e=");
  });
});
