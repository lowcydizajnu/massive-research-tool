/**
 * RateLimitAdapter — the vendor-agnostic rate-limit surface (ADR-0007 + ADR-0016).
 *
 * Feature code (the `/take/*` Server Actions) calls `rateLimit.limit(key, rule)`;
 * the vendor (Upstash Redis) lives only in `ratelimit.upstash.ts`. A shared,
 * hosted counter is what makes limiting correct across serverless instances —
 * an in-process Map would reset per cold start and per region (this is exactly
 * participant-runtime security review #9, deferred to the production deploy).
 * Swapping to self-managed Redis later is a new impl file + a one-line change
 * here (see the Upstash row in lock-in-inventory.md).
 */
export type RateLimitRule = {
  /** Max requests permitted within the window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  /** True if this request is within the limit (i.e. should proceed). */
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** The configured max (echoed for headers / messaging). */
  limit: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
};

export interface RateLimitAdapter {
  /**
   * Count one hit against `key` and report whether it's allowed. Fixed-window
   * semantics: the first hit starts a `windowSeconds` window; the (max+1)th hit
   * in that window is denied.
   */
  limit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

// Active implementation. Switching vendors is a one-line change here.
import { upstashRateLimit } from "./ratelimit.upstash";

export const rateLimit: RateLimitAdapter = upstashRateLimit;
