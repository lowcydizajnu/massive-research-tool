import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { adminMetricSnapshot } from "@/server/db/schema";

/**
 * Cross-instance TTL cache for slow external operator metrics (ADR-0080). DB
 * metrics are NOT cached (computed per request); this is only for the rate-limited
 * PostHog / Sentry reads. Backed by `admin_metric_snapshot` so the cache survives
 * serverless cold starts and gives an honest "updated Nm ago" timestamp.
 */
export const METRIC_TTL_MS = 15 * 60 * 1000;

export type CachedMetric<T> = {
  data: T;
  /** When the returned data was fetched (null = never successfully fetched). */
  fetchedAt: Date | null;
  /** True when a refresh failed and we fell back to the last good snapshot. */
  stale: boolean;
};

/**
 * Return a cached external metric, refreshing through `fetcher` when the snapshot
 * is older than `ttlMs` or `forceRefresh` is set. Only `available` results are
 * cached; if a refresh fails (`available:false`) but a good snapshot exists, the
 * last-good value is returned marked `stale` rather than flashing "unavailable".
 */
export async function resolveCachedMetric<T extends { available: boolean }>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { forceRefresh?: boolean; ttlMs?: number } = {},
): Promise<CachedMetric<T>> {
  // The cache must NEVER break the dashboard (ADR-0080). Any failure — a missing
  // snapshot table, a DB hiccup, an adapter throw — degrades to an "unavailable"
  // tile rather than 500-ing the whole metrics query.
  try {
    const ttlMs = opts.ttlMs ?? METRIC_TTL_MS;
    const [row] = await db
      .select()
      .from(adminMetricSnapshot)
      .where(eq(adminMetricSnapshot.key, key))
      .limit(1);

    const fresh = row && Date.now() - row.fetchedAt.getTime() < ttlMs;
    if (row && fresh && !opts.forceRefresh) {
      return { data: row.value as T, fetchedAt: row.fetchedAt, stale: false };
    }

    const result = await fetcher();
    if (result.available) {
      const now = new Date();
      await db
        .insert(adminMetricSnapshot)
        .values({ key, value: result, fetchedAt: now })
        .onConflictDoUpdate({
          target: adminMetricSnapshot.key,
          set: { value: result, fetchedAt: now },
        });
      return { data: result, fetchedAt: now, stale: false };
    }

    // Refresh failed — prefer the last good snapshot if we have one.
    if (row && (row.value as { available?: boolean }).available) {
      return { data: row.value as T, fetchedAt: row.fetchedAt, stale: true };
    }
    return { data: result, fetchedAt: row?.fetchedAt ?? null, stale: false };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "metric cache error";
    return { data: { available: false, reason } as unknown as T, fetchedAt: null, stale: false };
  }
}
