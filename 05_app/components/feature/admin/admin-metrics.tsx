"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { InfoTooltip } from "@/components/ui/info-tooltip";
import { describeEvent } from "@/lib/admin/posthog-events";
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

/** A "?" icon whose explanation shows in a design-system tooltip on hover/focus. */
function Help({ text }: { text: string }) {
  return <InfoTooltip text={text} className="align-middle" />;
}

function Tile({ label, value, hint, help }: { label: string; value: string; hint?: string; help?: string }) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <span className="flex items-center gap-1 text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
        {help ? <Help text={help} /> : null}
      </span>
      <span className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
      {hint ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{hint}</span> : null}
    </div>
  );
}

function Group({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
        {help ? <Help text={help} /> : null}
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
      <Group title="Growth" help="New and total researcher accounts, counted live from our database. System accounts are excluded.">
        <ul className={GRID}>
          <li><Tile label="Total users" value={int.format(growth.totalUsers)} help="All researcher accounts that have ever signed up." /></li>
          <li><Tile label="New today" value={int.format(growth.newToday)} help="Accounts created since midnight UTC." /></li>
          <li><Tile label="New (7d)" value={int.format(growth.new7d)} help="Accounts created in the last 7 days." /></li>
          <li><Tile label="New (30d)" value={int.format(growth.new30d)} help="Accounts created in the last 30 days." /></li>
        </ul>
      </Group>

      <Group title="Studies & responses" help="What researchers are building and collecting, from our database.">
        <ul className={GRID}>
          <li><Tile label="Studies" value={int.format(research.studiesTotal)} hint={`+${research.studies7d} (7d) · +${research.studies30d} (30d)`} help="Total studies, with how many were created in the last 7 and 30 days." /></li>
          <li><Tile label="Running now" value={int.format(research.runningStudies)} hint="open recruitment" help="Studies that currently have an open recruitment session collecting participants." /></li>
          <li><Tile label="Responses" value={int.format(research.responsesTotal)} hint="completed" help="Total completed participant responses across all studies." /></li>
          <li><Tile label="By stage" value={`${research.stages.published} pub`} hint={`${research.stages.preregistered} prereg · ${research.stages.draft} draft`} help="Studies grouped by their current version's lifecycle stage: published, preregistered, or draft." /></li>
        </ul>
      </Group>

      <Group title="AI cost" help="What workspaces have spent on AI features (billed to their own provider keys), summed from usage records.">
        <ul className={GRID}>
          <li><Tile label="This month" value={usd.format(cost.thisMonthUsd)} hint="workspace-attributed" help="AI spend since the 1st of this month (UTC)." /></li>
          <li><Tile label="Last month" value={usd.format(cost.lastMonthUsd)} help="AI spend in the previous calendar month." /></li>
        </ul>
      </Group>

      {/* ---- PostHog (product analytics) ---- */}
      <Group title="PostHog · product analytics" help="Live from PostHog (product-analytics tool). Names starting with $ are PostHog's automatic events; the rest are our own. Hover any row for what it means.">
        {posthog.data.available ? (
          <div className="flex flex-col gap-3">
            <ul className={GRID}>
              <li><Tile label="Active today" value={int.format(posthog.data.activeUsers.dau)} help="Daily active users — distinct people who used the app in the last 24 hours (DAU)." /></li>
              <li><Tile label="Active this week" value={int.format(posthog.data.activeUsers.wau)} help="Weekly active users — distinct people in the last 7 days (WAU)." /></li>
              <li><Tile label="Active this month" value={int.format(posthog.data.activeUsers.mau)} help="Monthly active users — distinct people in the last 30 days (MAU)." /></li>
            </ul>
            {posthog.data.topEvents.length ? (
              <ul className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
                {posthog.data.topEvents.map((e) => {
                  const info = describeEvent(e.event);
                  return (
                    <li key={e.event} className="flex items-center justify-between gap-3 text-[length:var(--text-body)]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[var(--color-text-secondary)]">{info.label}</span>
                        <Help text={`${info.description} (raw event: ${e.event})`} />
                      </span>
                      <span className="shrink-0 font-medium text-[var(--color-text-primary)]">{int.format(e.count)}</span>
                    </li>
                  );
                })}
                <li className="pt-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Most-fired events, last 7 days</li>
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
      <Group title="Sentry · error monitoring" help="Live from Sentry (error-tracking tool). Click an issue to open it in Sentry.">
        {sentry.data.available ? (
          <div className="flex flex-col gap-3">
            <ul className={GRID}>
              <li><Tile label="Open issues" value={`${int.format(sentry.data.openIssues)}${sentry.data.openIssuesCapped ? "+" : ""}`} help="Distinct unresolved error types. A '+' means there are more than we list here." /></li>
              <li><Tile label="Errors (24h)" value={sentry.data.events24h == null ? "—" : int.format(sentry.data.events24h)} help="Total error events received in the last 24 hours (one issue can fire many times)." /></li>
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
