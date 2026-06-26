import { notFound } from "next/navigation";

import { ProlificRecruitCard } from "@/components/feature/run/prolific-recruit-card";
import { RunPanel } from "@/components/feature/run/run-panel";
import { ReadOnlyBanner } from "@/components/feature/workspace/role-gate";
import { canWriteRole } from "@/lib/workspace/roles";
import { getServerApi } from "@/server/trpc/server";
import type { RunInfo, StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Run stage (run-a-study JTBD). Surfaces recruitment status + the shareable
 * recruitment link for the preregistered version, and a Preview link. The
 * interactive bits (open recruitment, copy) live in the client RunPanel.
 */
export default async function RunStagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getServerApi();

  let study: StudyDetail | null = null;
  let info: RunInfo | null = null;
  try {
    study = await api.studies.get({ id });
    info = await api.studies.getRunInfo({ studyId: id });
  } catch {
    study = null;
  }
  if (!study || !info) notFound();

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const recruitmentUrl = `${base}/take/${id}/start`;
  // The dedicated participant preview needs no open recruitment session — the
  // `/take` link is recruitment-gated and dead-ends before recruitment opens.
  const previewUrl = `/studies/${id}/preview`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="min-w-0">
          <h1
            title={study.title}
            className="truncate font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]"
          >
            {study.title}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Recruit participants and collect responses.
          </p>
        </div>

        <ReadOnlyBanner role={study.viewerRole} />
        <fieldset disabled={!canWriteRole(study.viewerRole)} className="contents">
          <RunPanel
            studyId={study.id}
            info={info}
            recruitmentUrl={recruitmentUrl}
            previewUrl={previewUrl}
          />
        </fieldset>
      </div>

      {info.runnable ? <ProlificRecruitCard studyId={study.id} studyTitle={study.title} /> : null}
    </main>
  );
}
