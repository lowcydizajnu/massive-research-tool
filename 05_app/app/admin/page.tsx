import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { getServerApi } from "@/server/trpc/server";

export const metadata: Metadata = { title: "Admin" };

/**
 * Admin overview (platform-foundation). Entry point + at-a-glance counts for the
 * env-allowlisted admin sections. Auth is enforced by app/admin/layout.tsx.
 */
export default async function AdminOverviewPage() {
  const api = await getServerApi();
  const [feedback, announcements] = await Promise.all([
    api.feedback.adminList({ limit: 200 }).catch(() => []),
    api.announcements.list({ limit: 50 }).catch(() => []),
  ]);
  const newFeedback = feedback.filter((f) => f.status === "new").length;

  const cards: { label: string; href: Route; stat: string; hint: string }[] = [
    {
      label: "Feedback",
      href: "/admin/feedback" as Route,
      stat: `${newFeedback} new`,
      hint: `${feedback.length} total`,
    },
    {
      label: "Announcements",
      href: "/admin/announcements" as Route,
      stat: `${announcements.length}`,
      hint: "published",
    },
  ];

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Overview
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Operator tools. The full Admin destination (cross-workspace) arrives with the analytics + admin work.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 hover:bg-[var(--color-surface-subtle)]"
            >
              <span className="text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
                {c.label}
              </span>
              <span className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
                {c.stat}
              </span>
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{c.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
