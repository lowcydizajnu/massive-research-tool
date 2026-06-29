import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { FinishStudyCard } from "@/components/feature/results/finish-study-card";
import { ManageData } from "@/components/feature/results/manage-data";
import { ResultsActions } from "@/components/feature/results/results-actions";
import { ReanalyzeEmotionButton } from "@/components/feature/results/reanalyze-emotion-button";
import { SpatialOverlay } from "@/components/feature/results/spatial-overlay";
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
  searchParams: Promise<{ preview?: string; v?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const includePreview = sp.preview === "1";
  // Version filter (ADR-0044): ?v=<n> scopes to one runnable version; absent = pooled.
  const vParsed = sp.v ? Number(sp.v) : NaN;
  const version = Number.isInteger(vParsed) && vParsed > 0 ? vParsed : null;
  const api = await getServerApi();

  let study: StudyDetail | null = null;
  let results: ResultsSummary | null = null;
  try {
    study = await api.studies.get({ id });
    results = await api.studies.getResults({ studyId: id, includePreview, version });
  } catch {
    study = null;
  }
  if (!study) notFound();

  // Filter links preserve the preview toggle.
  const previewQs = includePreview ? "preview=1" : "";
  const versionHref = (n: number | null): Route => {
    const parts = [n != null ? `v=${n}` : "", previewQs].filter(Boolean);
    return `/studies/${id}/results${parts.length ? `?${parts.join("&")}` : ""}` as Route;
  };
  const multiVersion = !!results && results.availableVersions.length > 1;
  const scopeLabel =
    results && multiVersion
      ? results.selectedVersion != null
        ? ` · v${results.selectedVersion} only`
        : ` · pooled across v${Math.min(...results.availableVersions)}–v${Math.max(...results.availableVersions)}`
      : "";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <FinishStudyCard studyId={study.id} />

      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              title={study.title}
              className="truncate font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]"
            >
              {study.title}
            </h1>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              {results
                ? `${results.totalCompleted} completed response${results.totalCompleted === 1 ? "" : "s"} across ${results.conditions.length} condition${results.conditions.length === 1 ? "" : "s"}${results.includesPreview ? " (including preview)" : ""}${scopeLabel}.`
                : "Results appear here once the study is preregistered and collecting responses."}
            </p>
          </div>
          {results && results.totalCompleted > 0 ? (
            <Link
              href={`/studies/${study.id}/results/export` as Route}
              className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Export data
            </Link>
          ) : null}
        </div>

        {multiVersion && results ? (
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)]">
            <span className="text-[var(--color-text-muted)]">Version</span>
            <Link href={versionHref(null)} className={versionChip(results.selectedVersion == null)}>
              All versions
            </Link>
            {results.availableVersions.map((n) => (
              <Link key={n} href={versionHref(n)} className={versionChip(results.selectedVersion === n)}>
                v{n}
              </Link>
            ))}
          </div>
        ) : null}

        {results === null ? (
          <Empty>
            This study isn’t running yet — freeze a version to collect responses from the{" "}
            <Link href={`/studies/${study.id}/run`} className="underline">
              Run stage
            </Link>{" "}
            (Preregister to OSF, or Publish &amp; run without OSF).
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

            {results.participantDataHidden ? (
              <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                Aggregate results are shown. Individual participant responses and exports are hidden
                during support access.
              </p>
            ) : null}

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

            {results.combinations.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
                  By combination
                </h2>
                <ul className="flex flex-col gap-1">
                  {results.combinations.map((c) => (
                    <li
                      key={c.label}
                      className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-[length:var(--text-body)]"
                    >
                      <span className="text-[var(--color-text-primary)]">{c.label}</span>
                      <span className="text-[var(--color-text-secondary)]">
                        {c.completed} completed
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
                  By question
                </h2>
                {/* Re-run any emotion items stuck pending/failed (ADR-0066 H3a amendment). */}
                <ReanalyzeEmotionButton
                  studyId={study.id}
                  stuck={results.questions.reduce((n, q) => n + (q.emotion ? q.emotion.pending + q.emotion.failed : 0), 0)}
                />
              </div>
              {results.questions.length === 0 ? (
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  This study has no answer-collecting questions (stimulus-only).
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.questions.map((q) => (
                    <li
                      key={q.instanceId}
                      className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                          {q.prompt}
                        </span>
                        <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                          {q.kind === "numeric" && q.mean !== null
                            ? `mean ${q.mean.toFixed(2)} · n=${q.n}`
                            : `n=${q.n}`}
                        </span>
                      </div>
                      {q.kind === "categorical" && q.optionCounts.length ? (
                        <ul className="flex flex-col gap-0.5 pl-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                          {q.optionCounts
                            .slice()
                            .sort((a, b) => b.count - a.count)
                            .map((o) => (
                              <li key={o.value} className="flex justify-between gap-2">
                                <span className="min-w-0 truncate">{o.value}</span>
                                <span className="shrink-0">{o.count}</span>
                              </li>
                            ))}
                        </ul>
                      ) : null}
                      {q.spatial ? (
                        <div className="flex flex-col gap-1 pt-1">
                          {q.spatial.kind === "signature" ? (
                            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                              {q.n} signature{q.n === 1 ? "" : "s"} captured — private to your workspace.
                            </span>
                          ) : (
                            <SpatialOverlay spatial={q.spatial} />
                          )}
                          <Link
                            href={`/studies/${study.id}/results/explore/${q.instanceId}${includePreview ? "?preview=1" : ""}` as Route}
                            className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
                          >
                            {q.spatial.kind === "signature" ? "View signatures →" : "Explore responses →"}
                          </Link>
                        </div>
                      ) : q.kind === "text" ? (
                        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                          Open-ended — see CSV export for responses.
                        </span>
                      ) : null}
                      {q.emotion ? (
                        <div className="flex flex-col gap-1 pt-1">
                          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
                            Emotion (Claude) · {q.emotion.n} analyzed
                            {q.emotion.pending ? ` · ${q.emotion.pending} pending` : ""}
                            {q.emotion.failed ? ` · ${q.emotion.failed} failed` : ""}
                          </span>
                          {q.emotion.failed && q.emotion.error ? (
                            <span className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
                              Last error: {q.emotion.error}
                            </span>
                          ) : null}
                          {q.emotion.top.length ? (
                            <ul className="flex flex-col gap-0.5">
                              {q.emotion.top.map((e) => (
                                <li key={e.name} className="flex items-center gap-2 text-[length:var(--text-small)]">
                                  <span className="w-28 shrink-0 truncate text-[var(--color-text-secondary)]">{e.name}</span>
                                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
                                    <span
                                      className="block h-full rounded-full bg-[var(--color-primary)]"
                                      style={{ width: `${Math.round(Math.max(0, Math.min(1, e.score)) * 100)}%` }}
                                    />
                                  </span>
                                  <span className="w-10 shrink-0 text-right text-[var(--color-text-muted)]">{e.score.toFixed(2)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                              No analyzed responses yet.
                            </span>
                          )}
                          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                            Exploratory measure — validate with self-report where the construct matters.
                          </span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ADR-0082 data-lifecycle: owner/admin erasure of collected responses.
                Hidden during operator support access (mutations are blocked then). */}
            {results.participantDataHidden ? null : (
              <ManageData
                studyId={study.id}
                studyTitle={study.title}
                totalCompleted={results.totalCompleted}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Version-filter chip (ADR-0044) — active = primary, inert = subtle. */
function versionChip(active: boolean): string {
  return (
    "rounded-[var(--radius-sm)] border px-2 py-0.5 font-medium " +
    (active
      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
      : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]")
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-4 py-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
      {children}
    </div>
  );
}
