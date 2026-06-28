/**
 * PostHog read-side adapter (ADR-0080) — the ONLY file that calls the PostHog
 * query API. Pulls headline operator metrics (active users + top events) for the
 * admin dashboard via HogQL. Distinct from the write-side `analytics.posthog.ts`
 * (event ingestion); this is read-only insight.
 *
 * Env-gated + never throws: a missing key or any non-OK / parse failure returns
 * `{ available: false }` so the dashboard renders an "unavailable" tile instead of
 * breaking (mirrors the OSF adapter degradation + the write adapter's no-op).
 *
 * Uses the documented HogQL query endpoint:
 *   POST {apiHost}/api/projects/{projectId}/query/
 *   Authorization: Bearer {personalApiKey}
 *   body: { query: { kind: "HogQLQuery", query: "<sql>" } }
 *   → { results: unknown[][], ... }
 */

export type PosthogInsights =
  | {
      available: true;
      activeUsers: { dau: number; wau: number; mau: number };
      topEvents: { event: string; count: number }[];
    }
  | { available: false; reason: string };

const PERSONAL_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const TIMEOUT_MS = 8000;

/** Ingestion host (`eu.i.posthog.com`) → API host (`eu.posthog.com`). */
function apiHost(): string {
  if (process.env.POSTHOG_API_HOST) return process.env.POSTHOG_API_HOST.replace(/\/$/, "");
  const ingest = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  return ingest.replace("i.posthog.com", "posthog.com").replace(/\/$/, "");
}

async function hogql(query: string): Promise<unknown[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiHost()}/api/projects/${PROJECT_ID}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERSONAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`PostHog query ${res.status}`);
    const json = (await res.json()) as { results?: unknown[][] };
    if (!Array.isArray(json.results)) throw new Error("PostHog: no results");
    return json.results;
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Fetch active-user counts (DAU/WAU/MAU, approximate `uniq`) + the top product
 * events over the last 7 days. Returns `{ available:false }` on any failure.
 */
export async function fetchPosthogInsights(): Promise<PosthogInsights> {
  if (!PERSONAL_KEY || !PROJECT_ID) {
    return { available: false, reason: "PostHog read key / project id not configured" };
  }
  try {
    const [activeRows, eventRows] = await Promise.all([
      hogql(
        "SELECT uniqIf(person_id, timestamp > now() - INTERVAL 1 DAY) AS dau, " +
          "uniqIf(person_id, timestamp > now() - INTERVAL 7 DAY) AS wau, " +
          "uniq(person_id) AS mau " +
          "FROM events WHERE timestamp > now() - INTERVAL 30 DAY",
      ),
      hogql(
        "SELECT event, count() AS c FROM events WHERE timestamp > now() - INTERVAL 7 DAY " +
          "GROUP BY event ORDER BY c DESC LIMIT 8",
      ),
    ]);
    const a = activeRows[0] ?? [];
    return {
      available: true,
      activeUsers: { dau: num(a[0]), wau: num(a[1]), mau: num(a[2]) },
      topEvents: eventRows
        .filter((r) => Array.isArray(r) && r.length >= 2)
        .map((r) => ({ event: String(r[0]), count: num(r[1]) })),
    };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : "PostHog query failed" };
  }
}
