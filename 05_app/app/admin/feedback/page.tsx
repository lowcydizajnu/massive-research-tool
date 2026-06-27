import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { FeedbackStatusSelect } from "@/components/feature/admin/feedback-status-select";
import { getServerApi } from "@/server/trpc/server";
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABEL,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback";

export const metadata: Metadata = { title: "Feedback — Admin" };

/**
 * Owner-only feedback queue (platform-foundation PF2, ADR-0072). Minimal
 * standalone page gated by the ADMIN_USER_IDS allow-list until the full Admin
 * destination (user.is_admin + adminProcedure) lands with the Analytics + Admin
 * handoff. Non-admins get a 404 — the page must not reveal it exists.
 */
export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Admin gate is enforced by app/admin/layout.tsx (ADR-0075).
  const sp = await searchParams;
  const activeStatus = (FEEDBACK_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as FeedbackStatus)
    : undefined;

  const api = await getServerApi();
  const rows = await api.feedback.adminList(activeStatus ? { status: activeStatus, limit: 100 } : { limit: 100 });

  const fmt = (d: Date | string) =>
    new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-4">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Feedback
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          In-app product feedback from researchers. Owner-only.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
        <FilterChip label="All" href={"/admin/feedback" as Route} active={!activeStatus} />
        {FEEDBACK_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={FEEDBACK_STATUS_LABEL[s]}
            href={`/admin/feedback?status=${s}` as Route}
            active={activeStatus === s}
          />
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          {activeStatus ? "Nothing matches this filter." : "No feedback yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 font-medium text-[var(--color-primary-text-on-subtle)]">
                  {FEEDBACK_KIND_LABEL[r.kind as FeedbackKind] ?? r.kind}
                </span>
                <FeedbackStatusSelect id={r.id} status={r.status} />
                <span>·</span>
                <span>{r.submitterName ?? r.submitterEmail ?? "(deleted)"}</span>
                {r.workspaceName ? (
                  <>
                    <span>·</span>
                    <span>{r.workspaceName}</span>
                  </>
                ) : null}
                <span>·</span>
                <span>{fmt(r.createdAt)}</span>
              </div>

              <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                {r.body}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {r.routeName ? <code className="font-mono">{r.routeName}</code> : null}
                {r.ipCountry ? <span>· {r.ipCountry}</span> : null}
                {r.screenshotUrl ? (
                  <a
                    href={r.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    View screenshot
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterChip({ label, href, active }: { label: string; href: Route; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium ${
        active
          ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      }`}
    >
      {label}
    </Link>
  );
}
