import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { SpatialExplorer } from "@/components/feature/results/spatial-explorer";
import { getServerApi } from "@/server/trpc/server";
import type { ResultsSummary, StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Explore spatial responses (spatial-explore.md, ADR-0041 amendment) — a
 * dedicated per-question surface for heat-map / hot-spot / graphic-slider:
 * filter by condition, switch aggregate ↔ per-respondent, dots ↔ density.
 * Reached from the Results "Explore responses →" link and the CSV/Excel viz
 * link. Honors ?preview=1 for parity with the Results view.
 */
export default async function ExploreSpatialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; instanceId: string }>;
  searchParams: Promise<{ preview?: string; c?: string; r?: string }>;
}) {
  const sp = await searchParams;
  const { id, instanceId } = await params;
  const includePreview = sp.preview === "1";
  const initialCondition = sp.c ?? "all";
  const initialRespondentId = sp.r ?? null;
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

  const question = results?.questions.find((q) => q.instanceId === instanceId && q.spatial);
  const backHref = `/studies/${study.id}/results${includePreview ? "?preview=1" : ""}` as Route;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Results" />
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <Link href={backHref} className="hover:underline">
              Results
            </Link>
            <span aria-hidden>›</span>
            <span>Explore</span>
          </div>
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            {question?.prompt ?? "Explore responses"}
          </h1>
        </div>

        {!question || !question.spatial ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-4 py-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            Nothing to explore here yet — this question has no spatial responses.{" "}
            <Link href={backHref} className="underline">
              Back to Results
            </Link>
            .
          </div>
        ) : (
          <SpatialExplorer
            spatial={question.spatial}
            conditions={results!.conditions.map((c) => ({ slug: c.slug, name: c.name }))}
            initialCondition={initialCondition}
            initialRespondentId={initialRespondentId}
          />
        )}
      </div>
    </main>
  );
}
