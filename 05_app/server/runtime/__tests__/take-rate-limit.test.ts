import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No request scope in unit tests — fake next/headers with a stable forwarded IP.
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.7"]]),
}));

import { __resetMemoryLimiter } from "@/server/adapters/ratelimit.upstash";
import { allowAnswer, allowBegin } from "@/server/runtime/take-rate-limit";

beforeEach(() => {
  // No Upstash creds → the in-memory fallback (deterministic, per-instance).
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("UPSTASH_IP_BUCKET_SALT", "test-salt");
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetMemoryLimiter();
});

describe("/take rate limits (security review #9)", () => {
  it("allowBegin: 3 starts per (session × IP), the 4th is blocked", async () => {
    const sess = "rs_1";
    expect(await allowBegin(sess)).toBe(true);
    expect(await allowBegin(sess)).toBe(true);
    expect(await allowBegin(sess)).toBe(true);
    expect(await allowBegin(sess)).toBe(false); // fuzz: 4th within the window
  });

  it("allowBegin: a different recruitment session is independent", async () => {
    for (let i = 0; i < 3; i++) await allowBegin("rs_a");
    expect(await allowBegin("rs_a")).toBe(false);
    expect(await allowBegin("rs_b")).toBe(true); // separate key
  });

  it("allowAnswer: a normal pace passes; a fuzzing loop past 30/min is rejected", async () => {
    const responseId = "resp_1";
    for (let i = 0; i < 30; i++) {
      expect(await allowAnswer(responseId)).toBe(true); // normal completion never nears this
    }
    expect(await allowAnswer(responseId)).toBe(false); // 31st in the window
  });
});
