import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/server/db/schema");
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./server/db/migrations" });
  return { db, schema };
});

import { db } from "@/server/db/client";
import { adminMetricSnapshot } from "@/server/db/schema";
import { resolveCachedMetric } from "@/server/admin/metric-cache";

type V = { available: boolean; n?: number };

beforeEach(async () => {
  await db.delete(adminMetricSnapshot);
});

describe("resolveCachedMetric", () => {
  it("fetches + caches on a miss, then serves from cache within TTL", async () => {
    let calls = 0;
    const fetcher = async (): Promise<V> => ({ available: true, n: ++calls });

    const first = await resolveCachedMetric("k", fetcher);
    expect(first.data.n).toBe(1);
    expect(first.stale).toBe(false);
    expect(first.fetchedAt).toBeInstanceOf(Date);

    const second = await resolveCachedMetric("k", fetcher);
    expect(second.data.n).toBe(1); // served from cache — fetcher NOT called again
    expect(calls).toBe(1);
  });

  it("forceRefresh bypasses the cache", async () => {
    let calls = 0;
    const fetcher = async (): Promise<V> => ({ available: true, n: ++calls });
    await resolveCachedMetric("k", fetcher);
    const refreshed = await resolveCachedMetric("k", fetcher, { forceRefresh: true });
    expect(refreshed.data.n).toBe(2);
    expect(calls).toBe(2);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    let calls = 0;
    const fetcher = async (): Promise<V> => ({ available: true, n: ++calls });
    await resolveCachedMetric("k", fetcher, { ttlMs: 0 });
    await resolveCachedMetric("k", fetcher, { ttlMs: 0 });
    expect(calls).toBe(2);
  });

  it("falls back to the last good snapshot (marked stale) when a refresh fails", async () => {
    await resolveCachedMetric("k", async (): Promise<V> => ({ available: true, n: 7 }));
    const failed = await resolveCachedMetric("k", async (): Promise<V> => ({ available: false }), {
      forceRefresh: true,
    });
    expect(failed.data.available).toBe(true); // last good, not the failed result
    expect(failed.data.n).toBe(7);
    expect(failed.stale).toBe(true);
  });

  it("returns the unavailable result when there is no prior good snapshot", async () => {
    const res = await resolveCachedMetric("k", async (): Promise<V> => ({ available: false }));
    expect(res.data.available).toBe(false);
    expect(res.stale).toBe(false);
  });

  it("never throws — a throwing fetcher degrades to available:false (ADR-0080)", async () => {
    const res = await resolveCachedMetric("k", async (): Promise<V> => {
      throw new Error("boom");
    });
    expect(res.data.available).toBe(false);
    expect(res.fetchedAt).toBeNull();
  });
});
