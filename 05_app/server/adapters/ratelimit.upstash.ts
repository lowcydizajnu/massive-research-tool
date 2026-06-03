import { Redis } from "@upstash/redis";

import type { RateLimitAdapter, RateLimitResult, RateLimitRule } from "./ratelimit";

/**
 * Upstash Redis implementation of RateLimitAdapter — the ONLY file importing
 * `@upstash/*` (ADR-0007 adapter discipline). Fixed-window counter via INCR +
 * EXPIRE: the first hit on a key starts the window and sets its TTL; each hit
 * increments; the count crossing `max` denies. One Redis round-trip in the
 * common case (INCR), a second only on the first hit of a window (EXPIRE).
 *
 * Dev/test fallback (parallel to the Inngest dev fallback in jobs.inngest.ts):
 * when the Upstash REST creds aren't set, fall back to an in-memory per-instance
 * counter so local dev + tests work without a hosted store. In PRODUCTION a
 * missing cred is fatal — a silent no-op limiter is worse than a loud failure.
 */
let redis: Redis | null = null;
function client(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// In-memory fallback (per instance; resets on cold start — fine for dev/test).
const memory = new Map<string, { count: number; resetAtMs: number }>();
function memoryLimit(key: string, rule: RateLimitRule, nowMs: number): RateLimitResult {
  const entry = memory.get(key);
  if (!entry || entry.resetAtMs <= nowMs) {
    memory.set(key, { count: 1, resetAtMs: nowMs + rule.windowSeconds * 1000 });
    return { allowed: true, remaining: rule.max - 1, limit: rule.max, resetSeconds: rule.windowSeconds };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= rule.max,
    remaining: Math.max(0, rule.max - entry.count),
    limit: rule.max,
    resetSeconds: Math.max(1, Math.ceil((entry.resetAtMs - nowMs) / 1000)),
  };
}

/** Visible for tests — clears the in-memory fallback between cases. */
export function __resetMemoryLimiter(): void {
  memory.clear();
}

export const upstashRateLimit: RateLimitAdapter = {
  async limit(key, rule) {
    const r = client();
    if (!r) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — the rate limiter is required in production (ADR-0016).",
        );
      }
      return memoryLimit(key, rule, Date.now());
    }

    const redisKey = `rl:${key}`;
    const count = await r.incr(redisKey);
    if (count === 1) {
      await r.expire(redisKey, rule.windowSeconds);
    }
    let ttl = await r.ttl(redisKey);
    if (ttl < 0) {
      // Key exists without a TTL (shouldn't happen, but never leak a stuck key).
      await r.expire(redisKey, rule.windowSeconds);
      ttl = rule.windowSeconds;
    }
    return {
      allowed: count <= rule.max,
      remaining: Math.max(0, rule.max - count),
      limit: rule.max,
      resetSeconds: ttl,
    };
  },
};
