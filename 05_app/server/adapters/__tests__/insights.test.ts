import { describe, expect, it } from "vitest";

import { fetchPosthogInsights } from "@/server/adapters/insights.posthog";
import { fetchSentryInsights } from "@/server/adapters/insights.sentry";

/**
 * The read adapters must degrade gracefully (ADR-0080): with no credentials in the
 * test env they return `{ available: false }` WITHOUT making a network call —
 * never throwing into the admin dashboard.
 */
describe("insights adapters — graceful degradation without keys", () => {
  it("PostHog returns available:false when the read key/project id are unset", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    const r = await fetchPosthogInsights();
    expect(r.available).toBe(false);
  });

  it("Sentry returns available:false when token/org/project are unset", async () => {
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT;
    const r = await fetchSentryInsights();
    expect(r.available).toBe(false);
  });
});
