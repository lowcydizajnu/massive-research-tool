import Link from "next/link";
import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { ResultsActions } from "@/components/feature/results/results-actions";
import { getServerApi } from "@/server/trpc/server";
import type { ResultsSummary, StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Results stage (results-stage.md). Per-condition completion counts + per-
 * question summaries (likert mean + n), with a preview-included toggle and CSV
 * export. Excludes preview by default. Empty state when no responses yet.
 */
export default async function ResultsStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const includePreview = (await searchParams).preview === "1";
  const api = await getServerApi();

  let study: StudyDetail | null = null;
  let results: ResultsSummary | null = null;
  try {
    study = await api.studies.get({ id });
    results = await api.studies.getResults({ studyId: id, includePreview });
  } catch {
    study = null;
  }
  if (!study) notFound();

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Results" />

      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="min-w-0">
          <h1
            title={study.title}
            className="truncate font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]"
          >
            {study.title}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {results
              ? `${results.totalCompleted} completed response${results.totalCompleted === 1 ? "" : "s"} across ${results.conditions.length} condition${results.conditions.length === 1 ? "" : "s"}${results.includesPreview ? " (including preview)" : ""}.`
              : "Results appear here once the study is preregistered and collecting responses."}
          </p>
        </div>

        {results === null ? (
          <Empty>
            This study isn’t preregistered yet.{" "}
            <Link href={`/studies/${study.id}/preregister`} className="underline">
              Preregister it
            </Link>{" "}
            to run it.
          </Empty>
        ) : results.totalCompleted === 0 ? (
          <>
            <ResultsActions studyId={study.id} results={results} includePreview={includePreview} />
            <Empty>
              No responses yet — share your recruitment link from the{" "}
              <Link href={`/studies/${study.id}/run`} className="underline">
                Run stage
              </Link>
              .
            </Empty>
          </>
        ) : (
          <>
            <ResultsActions studyId={study.id} results={results} includePreview={includePreview} />

            <section className="flex flex-col gap-2">
              <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
                By condition
              </h2>
              <ul className="flex flex-col gap-1">
                {results.conditions.map((c) => (
                  <li
                    key={c.slug}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-[length:var(--text-body)]"
                  >
                    <span className="text-[var(--color-text-primary)]">{c.name}</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {c.completed} completed
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
                By question
              </h2>
              {results.questions.length === 0 ? (
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  This study has no answer-collecting questions (stimulus-only).
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.questions.map((q) => (
                    <li
                      key={q.instanceId}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                        {q.prompt}
                      </span>
                      <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                        {q.mean !== null ? `mean ${q.mean.toFixed(2)} · n=${q.n}` : `n=${q.n}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-4 py-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
      {children}
    </div>
  );
}
