import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { getServerApi } from "@/server/trpc/server";

export const metadata: Metadata = { title: "Admin" };

/**
 * Admin overview (Analytics + Admin handoff, AA2; ADR-0075). Cross-workspace
 * census + current-month AI cost + queues. Auth is enforced by
 * app/admin/layout.tsx.
 */
export default async function AdminOverviewPage() {
  const api = await getServerApi();
  const o = await api.admin.overview();
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const stats: { label: string; value: string; href?: Route; hint?: string }[] = [
    { label: "Workspaces", value: String(o.workspaces), href: "/admin/workspaces" as Route },
    { label: "Users", value: String(o.users) },
    { label: "Studies", value: String(o.studies) },
    { label: "AI cost (this month)", value: usd.format(o.monthlyAiCostUsd), hint: "workspace-attributed" },
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
          Operator census across all workspaces. Behavior funnels live in PostHog (linked separately).
        </p>
      </header>

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
    </main>
  );
}
