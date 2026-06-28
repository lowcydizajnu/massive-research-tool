"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Admin operator dashboard (ADR-0080). DB metrics are fresh; PostHog + Sentry
 * tiles are served from a 15-min server cache, and the Refresh button forces a
 * re-fetch (forceRefresh bypasses the TTL). External tiles show "unavailable" when
 * a key is missing or the vendor API errors — they never break the dashboard.
 */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const int = new Intl.NumberFormat("en-US");

function agoLabel(iso: string | Date | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <span className="text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      <span className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
      {hint ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{hint}</span> : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

export function AdminMetrics() {
  const [force, setForce] = useState(false);
  const q = api.admin.metrics.useQuery({ forceRefresh: force }, { refetchOnWindowFocus: false });

  async function onRefresh() {
    if (!force) setForce(true); // flips the query key → refetches with forceRefresh
    else await q.refetch();
  }

  if (q.isLoading && !q.data) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading metrics…</p>;
  }
  if (!q.data) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn&rsquo;t load metrics. Try refresh.
      </p>
    );
  }

  const { growth, research, cost, posthog, sentry } = q.data;
  const dbError = "dbError" in q.data ? (q.data.dbError as string | null) : null;
  const fetching = q.isFetching;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          DB metrics are live. PostHog + Sentry update on a 15-min cache (Refresh to force).
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={fetching}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${fetching ? "animate-spin" : ""}`} aria-hidden />
          {fetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {dbError ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Some metrics couldn&rsquo;t load: {dbError}
        </p>
      ) : null}

      {/* ---- Platform metrics (live from our database) ---- */}
      <Group title="Growth">
        <ul className={GRID}>
          <li><Tile label="Total users" value={int.format(growth.totalUsers)} /></li>
          <li><Tile label="New today" value={int.format(growth.newToday)} /></li>
          <li><Tile label="New (7d)" value={int.format(growth.new7d)} /></li>
          <li><Tile label="New (30d)" value={int.format(growth.new30d)} /></li>
        </ul>
      </Group>

      <Group title="Studies & responses">
        <ul className={GRID}>
          <li><Tile label="Studies" value={int.format(research.studiesTotal)} hint={`+${research.studies7d} (7d) · +${research.studies30d} (30d)`} /></li>
          <li><Tile label="Running now" value={int.format(research.runningStudies)} hint="open recruitment" /></li>
          <li><Tile label="Responses" value={int.format(research.responsesTotal)} hint="completed" /></li>
          <li><Tile label="By stage" value={`${research.stages.published} pub`} hint={`${research.stages.preregistered} prereg · ${research.stages.draft} draft`} /></li>
        </ul>
      </Group>

      <Group title="AI cost">
        <ul className={GRID}>
          <li><Tile label="This month" value={usd.format(cost.thisMonthUsd)} hint="workspace-attributed" /></li>
          <li><Tile label="Last month" value={usd.format(cost.lastMonthUsd)} /></li>
        </ul>
      </Group>

      {/* ---- PostHog (product analytics) ---- */}
      <Group title="PostHog · product analytics">
        {posthog.data.available ? (
          <div className="flex flex-col gap-3">
            <ul className={GRID}>
              <li><Tile label="Active (DAU)" value={int.format(posthog.data.activeUsers.dau)} /></li>
              <li><Tile label="Active (WAU)" value={int.format(posthog.data.activeUsers.wau)} /></li>
              <li><Tile label="Active (MAU)" value={int.format(posthog.data.activeUsers.mau)} /></li>
            </ul>
            {posthog.data.topEvents.length ? (
              <ul className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
                {posthog.data.topEvents.map((e) => (
                  <li key={e.event} className="flex items-center justify-between gap-3 text-[length:var(--text-body)]">
                    <span className="truncate text-[var(--color-text-secondary)]">{e.event}</span>
                    <span className="shrink-0 font-medium text-[var(--color-text-primary)]">{int.format(e.count)}</span>
                  </li>
                ))}
                <li className="pt-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Top events, last 7 days</li>
              </ul>
            ) : null}
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Active users + top events · updated {agoLabel(posthog.fetchedAt)}
              {posthog.stale ? " · showing last good data" : ""}
            </p>
          </div>
        ) : (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Unavailable{"reason" in posthog.data ? ` — ${posthog.data.reason}` : ""}. Check the PostHog read key + project id.
          </p>
        )}
      </Group>

      {/* ---- Sentry (error monitoring) ---- */}
      <Group title="Sentry · error monitoring">
        {sentry.data.available ? (
          <div className="flex flex-col gap-3">
            <ul className={GRID}>
              <li><Tile label="Open issues" value={`${int.format(sentry.data.openIssues)}${sentry.data.openIssuesCapped ? "+" : ""}`} /></li>
              <li><Tile label="Errors (24h)" value={sentry.data.events24h == null ? "—" : int.format(sentry.data.events24h)} /></li>
            </ul>
            {sentry.data.topIssues.length ? (
              <ul className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
                {sentry.data.topIssues.map((i, idx) => (
                  <li key={`${i.title}-${idx}`} className="flex items-center justify-between gap-3 text-[length:var(--text-body)]">
                    {i.permalink ? (
                      <a href={i.permalink} target="_blank" rel="noreferrer" className="truncate text-[var(--color-primary)] hover:underline">
                        {i.title}
                      </a>
                    ) : (
                      <span className="truncate text-[var(--color-text-secondary)]">{i.title}</span>
                    )}
                    <span className="shrink-0 font-medium text-[var(--color-text-primary)]">{int.format(i.count)}</span>
                  </li>
                ))}
                <li className="pt-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Top unresolved issues</li>
              </ul>
            ) : null}
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Updated {agoLabel(sentry.fetchedAt)}</p>
          </div>
        ) : (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Unavailable{"reason" in sentry.data ? ` — ${sentry.data.reason}` : ""}. Check the Sentry token + org/project.
          </p>
        )}
      </Group>
    </div>
  );
}
