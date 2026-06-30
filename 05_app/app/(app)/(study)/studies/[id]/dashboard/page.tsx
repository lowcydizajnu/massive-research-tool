import { Check, Circle } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { getServerApi } from "@/server/trpc/server";
import type { ChangelogEntry, StudyDashboardData } from "@/server/trpc/routers/studies";
import { StudyChangelog } from "@/components/feature/study-dashboard/study-changelog";

/**
 * Study Dashboard — the FIRST stage tab (ADR-0056). "Where are we with this
 * study": a lifecycle tracker, recruitment/data at a glance, concrete
 * next-actions, and a recent-activity timeline. Read-only aggregate; the spine
 * answers the creator's "what's next / what's blocking".
 */
export const dynamic = "force-dynamic";

const toneCls: Record<"primary" | "warning" | "muted", string> = {
  primary: "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]",
  warning: "border-[var(--color-warning)] bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  muted: "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
};

export default async function StudyDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getServerApi();
  let d: StudyDashboardData;
  let changelog: ChangelogEntry[] = [];
  try {
    const [dash, log] = await Promise.all([
      api.studies.studyDashboard({ studyId: id }),
      api.studies.changelog({ studyId: id, limit: 20 }),
    ]);
    d = dash;
    changelog = log;
  } catch {
    notFound();
  }

  const maxN = Math.max(1, ...d.conditionBalance.map((c) => c.n));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">{d.title}</h1>

        {/* Lifecycle tracker */}
        <section className="flex flex-col gap-2">
          <h2 className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Progress</h2>
          <ol className="flex flex-wrap items-center gap-1.5">
            {d.lifecycle.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[length:var(--text-small)] font-medium " +
                    (s.done
                      ? "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
                      : s.key === d.currentStep
                        ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                        : "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]")
                  }
                >
                  {s.done ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3 [stroke-width:3]" aria-hidden />}
                  {s.label}
                </span>
                {i < d.lifecycle.length - 1 ? <span className="text-[var(--color-text-muted)]" aria-hidden>→</span> : null}
              </li>
            ))}
          </ol>
        </section>

        {/* Next actions */}
        {d.nextActions.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Next</h2>
            <div className="flex flex-col gap-1.5">
              {d.nextActions.map((a) => (
                <Link key={a.href + a.label} href={a.href as Route} className={"flex items-center justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[length:var(--text-body)] font-medium " + toneCls[a.tone]}>
                  {a.label}
                  <span aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Recruitment + data at a glance */}
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Completed responses" value={String(d.completedResponses)} sub={d.recruitment.targetN != null ? `of ${d.recruitment.targetN} target` : undefined} />
          <Stat label="Recruitment" value={d.recruitment.status ? d.recruitment.status[0].toUpperCase() + d.recruitment.status.slice(1) : "Not opened"} />
          <Stat label="Replications" value={String(d.replicationCount)} />
        </section>

        {/* Condition balance */}
        {d.conditionBalance.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Condition balance</h2>
            <ul className="flex flex-col gap-1.5">
              {d.conditionBalance.map((c) => (
                <li key={c.name} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{c.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
                    <span className="block h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.round((c.n / maxN) * 100)}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[length:var(--text-small)] text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">{c.n}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

      </div>

      {/* Changelog — its own widget card. When / what / who: version saves +
          lifecycle events, with a reader-chosen detail level (feedback 01KW4R8M). */}
      <StudyChangelog studyId={id} entries={changelog} />
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
      <span className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)] [font-variant-numeric:tabular-nums]">{value}</span>
      {sub ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{sub}</span> : null}
    </div>
  );
}
