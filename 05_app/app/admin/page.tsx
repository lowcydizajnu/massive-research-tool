import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { AdminMetrics } from "@/components/feature/admin/admin-metrics";
import { getServerApi } from "@/server/trpc/server";

export const metadata: Metadata = { title: "Admin" };

/**
 * Admin overview (Analytics + Admin handoff, AA2; ADR-0075 + ADR-0080). The
 * operator metrics dashboard (<AdminMetrics>) carries growth / research / PostHog
 * engagement / Sentry + cost; this server shell adds the navigational queue tiles.
 * Auth is enforced by app/admin/layout.tsx.
 */
export default async function AdminOverviewPage() {
  const api = await getServerApi();
  const o = await api.admin.overview();

  const stats: { label: string; value: string; href?: Route; hint?: string }[] = [
    { label: "Workspaces", value: String(o.workspaces), href: "/admin/workspaces" as Route },
    { label: "New feedback", value: String(o.newFeedback), href: "/admin/feedback" as Route },
    { label: "Announcements", value: String(o.announcements), href: "/admin/announcements" as Route },
  ];

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Overview
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Operator metrics across all workspaces. Deep funnels + error triage live in PostHog / Sentry (linked below).
        </p>
      </header>

      {/* Queues (navigational) up top. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const inner = (
            <div className="flex h-full flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
              <span className="text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
                {s.label}
              </span>
              <span className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
                {s.value}
              </span>
              {s.hint ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{s.hint}</span> : null}
            </div>
          );
          return (
            <li key={s.label}>
              {s.href ? (
                <Link href={s.href} className="block h-full hover:opacity-90">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>

      <AdminMetrics />

      {/* External operator dashboards — analytics + error monitoring live in
          their own consoles (ADR-0074 / ADR-0072), not rebuilt in-app. */}
      <section aria-labelledby="admin-external" className="flex flex-col gap-2">
        <h2
          id="admin-external"
          className="text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]"
        >
          External dashboards
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {EXTERNAL_DASHBOARDS.map((d) => (
            <li key={d.label}>
              <a
                href={d.href}
                target="_blank"
                rel="noreferrer"
                className="flex h-full flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 hover:opacity-90"
              >
                <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {d.label} ↗
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{d.hint}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/**
 * Operator consoles for the data MRT deliberately does NOT rebuild in-app:
 * product analytics + session replay (PostHog, EU) and error monitoring
 * (Sentry, EU). Links open the provider's own dashboard; each redirects to the
 * signed-in operator's org/project.
 */
const EXTERNAL_DASHBOARDS: { label: string; href: string; hint: string }[] = [
  { label: "PostHog", href: "https://eu.posthog.com", hint: "Funnels, retention, session replay" },
  { label: "Sentry", href: "https://sentry.io", hint: "Errors + performance" },
];
