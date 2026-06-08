import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { OverviewEditor } from "@/components/feature/overview/overview-editor";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Overview stage (V1.12 B1, overview-stage.md) — researcher-authored study
 * documentation (abstract + named markdown sections). The first stage tab;
 * rides with the snapshot so a preregistered version freezes the narrative.
 */
export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getServerApi();
  let study: StudyDetail | null = null;
  try {
    study = await api.studies.get({ id });
  } catch {
    study = null;
  }
  if (!study) notFound();

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Overview" />
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            {study.title}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Describe your study — hypotheses, background, methods, analysis plan. This travels with
            the study and is frozen into the preregistration record.
          </p>
        </div>
        <OverviewEditor studyId={study.id} initial={study.overview} />
      </div>
    </main>
  );
}
