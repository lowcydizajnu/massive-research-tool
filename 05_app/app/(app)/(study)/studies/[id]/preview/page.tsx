import { notFound } from "next/navigation";

import { TrackEvent } from "@/components/analytics/track-event";
import { PreviewExperience } from "@/components/feature/take/preview-experience";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Preview stage (V1.12, preview-modal.md) — the study as a participant sees it,
 * chrome-free in a full-viewport device-framed overlay. Runs the REAL participant
 * runtime in preview mode (an ephemeral mode:"preview" response on the working
 * draft, started client-side via studies.startPreview): one screen at a time,
 * live validation + branching, nothing counted toward results.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
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
    <>
      <TrackEvent event="study_preview_opened" />
      <PreviewExperience studyId={study.id} title={study.title} />
    </>
  );
}
