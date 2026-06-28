# ADR 0080 — Admin metrics dashboard — embedded headline metrics + insights adapters

- **Status:** accepted
- **Date:** 2026-06-28
- **Deciders:** Paweł (project owner), Claude
- **Tags:** admin, analytics, observability, adapters

## Context

ADR-0074 (PostHog analytics) and ADR-0072 (Sentry) decided the admin destination
would **link out** to the vendor consoles rather than rebuild their dashboards
in-app — the /admin Overview shows a DB census + an "External dashboards" band of
links. The owner now wants a **meaningful operator dashboard inside /admin**: the
headline numbers an operator checks daily, in one place, with a refresh control —
"add all data we need" across growth, research output, product engagement, and
reliability + cost. The PostHog personal API key + project id and the Sentry auth
token + org/project are now provisioned in Vercel.

This is a deliberate, scoped reversal of "linked only": we embed **headline
metrics** (counts, top-N, a couple of time-windows), not the full funnel/retention/
replay analysis — those stay in PostHog/Sentry. The numbers come from three
sources: the app DB (cheap, always fresh), the PostHog **query API** (active users,
top events), and the Sentry **API** (open issues, recent error volume). External
calls are slow and rate-limited, so they cannot run uncached on every page load.

## Options considered

### Option A — Embed headline metrics; DB fresh, external cached behind read adapters (chosen)

- DB metrics computed per-request in the `admin.metrics` tRPC query. External
  metrics fetched through two new read adapters (`insights.posthog.ts`,
  `insights.sentry.ts`) and **cached in an `admin_metric_snapshot` table** with a
  TTL; a `forceRefresh` input bypasses the TTL (the UI's refresh button).
- **Pros:** one in-app dashboard; external APIs hit at most once per TTL across all
  instances (cross-instance cache survives serverless cold starts); honest
  "updated Nm ago" + working refresh; adapters keep vendor HTTP out of feature code
  (ADR-0007); degrades to "unavailable" tiles when a key is missing or an API errors.
- **Cons:** a new table + migration; two more vendor API surfaces to keep working.

### Option B — Keep linking out only (status quo, ADR-0074/0072)

- **Pros:** zero new code; no vendor read APIs.
- **Cons:** doesn't deliver what the owner asked for — no at-a-glance operator view.

### Option C — Embed, but fetch external metrics live on every load (no cache)

- **Pros:** simplest; always current; no table.
- **Cons:** every admin page load makes 3–5 PostHog/Sentry calls → slow page, quota
  burn, rate-limit risk. Rejected.

## Decision

We will **embed headline metrics in the /admin Overview** via an `admin.metrics`
`adminProcedure`: **DB metrics computed fresh**, **external (PostHog + Sentry)
metrics fetched through read adapters and cached in `admin_metric_snapshot`** with a
15-minute TTL. The Overview gains a client refresh control that re-runs the query
with `forceRefresh: true` (bypassing the TTL) and shows the snapshot's `fetchedAt`
("updated Nm ago · auto-refreshes every 15 min"). This **amends ADR-0074 and
ADR-0072**: we now embed *headline* metrics in-app while the deep analysis
(funnels, retention, replay, error triage) stays in the vendor consoles — the
"External dashboards" links remain.

Both read adapters are env-gated and **never throw into the request**: a missing
key or any non-OK/parse failure yields `{ available: false }`, rendering an
"unavailable" tile instead of breaking the dashboard (mirrors the OSF adapter's
degradation + the analytics write adapter's no-op-without-key contract). Vendor
HTTP lives only in `server/adapters/insights.*.ts` (ADR-0007).

## Consequences

- **Easier:** the operator sees growth + research output + engagement + reliability
  + cost in one screen; adding a tile is a query field + a UI entry.
- **Harder:** two more vendor API contracts to maintain; if PostHog/Sentry change
  their API shapes the tiles go "unavailable" until the adapter is updated (safe
  failure, but a maintenance surface). The `admin_metric_snapshot` TTL is a
  freshness/cost tradeoff — 15 min is a guess; tune if operators want fresher.
- **Committed to:** the read-adapter boundary (no vendor HTTP in feature/UI code);
  the env-var names the keys live under (`POSTHOG_PERSONAL_API_KEY`,
  `POSTHOG_PROJECT_ID`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
  optional `POSTHOG_API_HOST`/`SENTRY_URL` overrides).
- **Precluded from:** nothing structurally — the vendor consoles remain the source
  of truth for deep analysis; this is an additive read layer.

## Revisit triggers

- Operators want metrics fresher than the TTL, or the snapshot cache causes
  confusion → shorten TTL or move to on-demand-with-spinner.
- PostHog/Sentry API quota or cost from the dashboard becomes material → widen TTL
  or sample.
- We add a second admin consumer of the same external metrics → promote the
  snapshot cache into a general operator-metrics service.

## References

- Amends ADR-0074 (PostHog analytics — linked) + ADR-0072 (Sentry — linked).
- ADR-0007 (adapter discipline) · ADR-0075 (admin role + census) · ADR-0014 (PII —
  operator metrics are aggregate counts, never participant rows).
- Code: `server/adapters/insights.posthog.ts`, `server/adapters/insights.sentry.ts`,
  `server/trpc/routers/admin.ts` (`metrics`), `app/admin/page.tsx` +
  `components/feature/admin/admin-metrics.tsx`, migration `0048_*` (`admin_metric_snapshot`).
- Lock-in inventory: PostHog read-API + Sentry-API rows.
