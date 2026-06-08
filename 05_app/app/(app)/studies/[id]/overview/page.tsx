import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { OverviewEditor } from "@/components/feature/overview/overview-editor";
import { ReplicationProvenance, type Provenance } from "@/components/feature/overview/replication-provenance";
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

  // For a replication, fetch the upstream parent + auto-generated block diff.
  let parent: Provenance | null = null;
  if (study.isReplication) {
    try {
      const reps = await api.studies.getReplications({ studyId: study.id });
      parent = reps.parent ?? null;
    } catch {
      parent = null;
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Overview" />
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
              {study.title}
            </h1>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Describe your study — hypotheses, background, methods, analysis plan. This travels with
              the study and is frozen into the preregistration record.
            </p>
          </div>
          <a
            href={`/studies/${study.id}/export-pdf`}
            className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Export PDF
          </a>
        </div>
        {parent ? <ReplicationProvenance parent={parent} studyId={study.id} /> : null}
        <OverviewEditor studyId={study.id} initial={study.overview} isReplication={study.isReplication} />
      </div>
    </main>
  );
}
