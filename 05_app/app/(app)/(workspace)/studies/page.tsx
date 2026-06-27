import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { NewStudyButton } from "@/components/feature/new-study/new-study-button";
import { RunningBoard } from "@/components/feature/studies/running-board";
import { StudyCard } from "@/components/feature/study-card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getServerApi } from "@/server/trpc/server";
import { STUDY_FILTERS, type StudyFilter } from "@/server/trpc/routers/studies";

/**
 * Studies destination — Hanna's home base (studies-destination.md). The work
 * surface inside the (app) shell: destination header + sub-nav filter tabs +
 * the study list (or the empty state). RSC; reads via the in-process caller.
 */

const SUBNAV: { filter: StudyFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "mine", label: "Mine" },
  { filter: "drafts", label: "Drafts" },
  { filter: "preregistered", label: "Preregistered" },
  { filter: "published", label: "Published" },
  { filter: "replicating", label: "Replicating" },
  { filter: "archived", label: "Archived" },
];

function parseFilter(value: string | string[] | undefined): StudyFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return STUDY_FILTERS.includes(v as StudyFilter) ? (v as StudyFilter) : "all";
}

export default async function StudiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[]; tab?: string | string[] }>;
}) {
  const sp = await searchParams;
  // Running is a distinct ops mode (?tab=running), not a list filter — it
  // replaces the study list with the live recruitment board (studies-running-tab.md).
  const running = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "running";
  const filter = parseFilter(sp.filter);
  const api = await getServerApi();
  const studies = running ? [] : await api.studies.list({ filter });

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        Studies
      </h1>

      {/* Sub-nav filter tabs. (A full WAI-ARIA tablist with arrow-key roving is
          a follow-up; these are filter links with aria-current for now.) */}
      <nav
        aria-label="Filter studies"
        className="flex flex-wrap gap-1 border-b border-[var(--color-border-subtle)] pb-2"
      >
        {SUBNAV.map((tab) => {
          const active = !running && tab.filter === filter;
          return (
            <Link
              key={tab.filter}
              href={tab.filter === "all" ? "/studies" : `/studies?filter=${tab.filter}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
                active
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
        {/* Running — the live recruitment board, a sibling of the list filters. */}
        <Link
          href="/studies?tab=running"
          aria-current={running ? "page" : undefined}
          className={cn(
            "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
            running
              ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
          )}
        >
          Running
        </Link>
      </nav>

      {running ? (
        <RunningBoard />
      ) : studies.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {studies.map((study) => (
            <li key={study.id}>
              <StudyCard study={study} />
            </li>
          ))}
        </ul>
      ) : filter === "all" ? (
        <EmptyWorkspace />
      ) : (
        <FilterEmpty />
      )}
    </main>
  );
}

function EmptyWorkspace() {
  return (
    <EmptyState
      icon={FlaskConical}
      title="No studies yet."
      body="Start your first study from scratch or from a framework — it only takes a click."
      action={<NewStudyButton autoFocus />}
    />
  );
}

function FilterEmpty() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        Nothing matches this filter.
      </p>
      <Link
        href="/studies"
        className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
      >
        Reset filter
      </Link>
    </div>
  );
}
