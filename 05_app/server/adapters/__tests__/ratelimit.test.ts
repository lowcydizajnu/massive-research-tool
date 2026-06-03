import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A controllable fake Redis (no network); the adapter is the only @upstash importer.
const store = new Map<string, { value: number; ttl: number }>();
const fakeRedis = {
  incr: vi.fn(async (k: string) => {
    const e = store.get(k) ?? { value: 0, ttl: -1 };
    e.value += 1;
    store.set(k, e);
    return e.value;
  }),
  expire: vi.fn(async (k: string, s: number) => {
    const e = store.get(k);
    if (e) e.ttl = s;
    return 1;
  }),
  ttl: vi.fn(async (k: string) => store.get(k)?.ttl ?? -2),
};
vi.mock("@upstash/redis", () => ({ Redis: vi.fn(() => fakeRedis) }));

import { __resetMemoryLimiter, upstashRateLimit } from "@/server/adapters/ratelimit.upstash";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  store.clear();
  __resetMemoryLimiter();
});

describe("rate limiter — in-memory dev fallback (no Upstash creds)", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("allows up to max, denies at max+1 (boundary)", async () => {
    const rule = { max: 3, windowSeconds: 60 };
    const r1 = await upstashRateLimit.limit("k", rule);
    const r2 = await upstashRateLimit.limit("k", rule);
    const r3 = await upstashRateLimit.limit("k", rule);
    const r4 = await upstashRateLimit.limit("k", rule);
    expect([r1.allowed, r2.allowed, r3.allowed, r4.allowed]).toEqual([true, true, true, false]);
    expect(r1.remaining).toBe(2);
    expect(r3.remaining).toBe(0);
    expect(r4.remaining).toBe(0);
    expect(r4.limit).toBe(3);
  });

  it("isolates separate keys", async () => {
    const rule = { max: 1, windowSeconds: 60 };
    expect((await upstashRateLimit.limit("a", rule)).allowed).toBe(true);
    expect((await upstashRateLimit.limit("a", rule)).allowed).toBe(false);
    expect((await upstashRateLimit.limit("b", rule)).allowed).toBe(true); // different key, fresh window
  });

  it("Upstash creds absent in PRODUCTION is fatal (no silent no-op limiter)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(upstashRateLimit.limit("k", { max: 1, windowSeconds: 60 })).rejects.toThrow(
      /UPSTASH_REDIS_REST_URL/,
    );
  });
});

describe("rate limiter — Upstash path (mocked Redis)", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    vi.stubEnv("NODE_ENV", "production");
  });

  it("INCRs, sets EXPIRE on the first hit only, and denies past max", async () => {
    const rule = { max: 2, windowSeconds: 30 };
    const r1 = await upstashRateLimit.limit("sess", rule);
    const r2 = await upstashRateLimit.limit("sess", rule);
    const r3 = await upstashRateLimit.limit("sess", rule);

    expect(r1).toMatchObject({ allowed: true, remaining: 1, limit: 2, resetSeconds: 30 });
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(fakeRedis.incr).toHaveBeenCalledTimes(3);
    // EXPIRE set exactly once — on the first hit (count === 1).
    expect(fakeRedis.expire).toHaveBeenCalledTimes(1);
    expect(fakeRedis.expire).toHaveBeenCalledWith("rl:sess", 30);
  });
});
