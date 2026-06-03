import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The DB client must be lazy (ADR-0016 deploy prep): importing it without
 * DATABASE_URL must NOT throw (so `next build`'s page-data collection imports
 * every server module cleanly), but the first actual query must fail loudly.
 *
 * This file deliberately does NOT mock @/server/db/client (every other test
 * does) — it exercises the real module against a controlled env.
 */
describe("db client (lazy init)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("imports without DATABASE_URL — no throw at import", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    await expect(import("@/server/db/client")).resolves.toHaveProperty("db");
  });

  it("throws a clear error on first use when DATABASE_URL is unset", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { db } = await import("@/server/db/client");
    // Accessing a method goes through the Proxy → getDb() → the clear throw.
    expect(() => db.select()).toThrow(/DATABASE_URL is not set/);
  });
});
