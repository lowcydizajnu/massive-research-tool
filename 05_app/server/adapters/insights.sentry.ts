/**
 * Sentry read-side adapter (ADR-0080) — the ONLY file that calls the Sentry API.
 * Pulls headline reliability metrics (open issues + recent error volume + the top
 * unresolved issues) for the admin dashboard. The Sentry SDK elsewhere is
 * init-only auto-instrumentation; this is read-only insight.
 *
 * Env-gated + never throws: a missing token/org/project or any non-OK / parse
 * failure returns `{ available: false }` so the dashboard renders an "unavailable"
 * tile instead of breaking.
 *
 * Uses the documented Sentry REST API (token = an org auth token / internal
 * integration token with project:read):
 *   GET {base}/api/0/projects/{org}/{project}/issues/?query=is:unresolved&limit=100
 *   GET {base}/api/0/projects/{org}/{project}/stats/?stat=received&resolution=1h&since={unix}
 */

export type SentryInsights =
  | {
      available: true;
      openIssues: number;
      openIssuesCapped: boolean;
      events24h: number | null;
      topIssues: { title: string; count: number; permalink: string | null }[];
    }
  | { available: false; reason: string };

const TOKEN = process.env.SENTRY_AUTH_TOKEN;
const ORG = process.env.SENTRY_ORG;
const PROJECT = process.env.SENTRY_PROJECT;
const TIMEOUT_MS = 8000;
const ISSUE_PAGE = 100;

function base(): string {
  return (process.env.SENTRY_URL ?? "https://sentry.io").replace(/\/$/, "");
}

async function sentryGet(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}/api/0${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Sentry ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Fetch unresolved-issue count + top issues + events received in the last 24h.
 * `events24h` is null when the stats endpoint is unavailable but issues loaded.
 * Returns `{ available:false }` on any failure of the primary (issues) call.
 */
export async function fetchSentryInsights(): Promise<SentryInsights> {
  if (!TOKEN || !ORG || !PROJECT) {
    return { available: false, reason: "Sentry token / org / project not configured" };
  }
  try {
    const issues = (await sentryGet(
      `/projects/${ORG}/${PROJECT}/issues/?query=${encodeURIComponent("is:unresolved")}&limit=${ISSUE_PAGE}&statsPeriod=14d`,
    )) as Array<{ title?: string; culprit?: string; count?: string | number; permalink?: string }>;
    if (!Array.isArray(issues)) throw new Error("Sentry: unexpected issues shape");

    const topIssues = issues.slice(0, 5).map((i) => ({
      title: String(i.title ?? i.culprit ?? "Untitled issue"),
      count: num(i.count),
      permalink: typeof i.permalink === "string" ? i.permalink : null,
    }));

    // Secondary: events received in the last 24h (best-effort; null on failure).
    let events24h: number | null = null;
    try {
      const since = Math.floor(Date.now() / 1000) - 24 * 3600;
      const series = (await sentryGet(
        `/projects/${ORG}/${PROJECT}/stats/?stat=received&resolution=1h&since=${since}`,
      )) as Array<[number, number]>;
      if (Array.isArray(series)) {
        events24h = series.reduce((sum, point) => sum + num(Array.isArray(point) ? point[1] : 0), 0);
      }
    } catch {
      // Leave events24h null — the issue count is the primary signal.
    }

    return {
      available: true,
      openIssues: issues.length,
      openIssuesCapped: issues.length >= ISSUE_PAGE,
      events24h,
      topIssues,
    };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : "Sentry query failed" };
  }
}
