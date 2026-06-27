import { describe, expect, it, vi } from "vitest";

// Simulate a request scope where the consent mirror cookie is present.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "cookie_consent" ? { value: "all" } : undefined),
  }),
}));

import { getServerConsent } from "@/server/analytics/consent";

describe("getServerConsent — cookie source (ADR-0073 am.1)", () => {
  it("prefers the per-request consent cookie over the DB row (works even with no userId)", async () => {
    expect(await getServerConsent("any-user")).toBe("all");
    expect(await getServerConsent(null)).toBe("all");
  });
});
