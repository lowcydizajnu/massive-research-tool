import { notFound } from "next/navigation";

import { PreviewExperience } from "@/components/feature/take/preview-experience";
import { getServerApi } from "@/server/trpc/server";
import type { RuntimeBlock } from "@/server/runtime/participant";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Preview stage (V1.12 A4, preview-modal.md) — the study as a participant sees
 * it, rendered chrome-free in a full-viewport, device-framed overlay (no
 * researcher TopBar / rail / stage tabs). Read-only: every block renders through
 * the participant `BlockView`; nothing recorded; conditional blocks all shown.
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getServerApi();
  let study: StudyDetail | null = null;
  try {
    study = await api.studies.get({ id });
  } catch {
    study = null;
  }
  if (!study) notFound();

  const blocks: RuntimeBlock[] = study.blocks.map((b) => ({
    instanceId: b.instanceId,
    source: b.source,
    key: b.key,
    version: b.version,
    config: b.config,
    visibility: { showIfCondition: b.showIfCondition },
  }));

  return <PreviewExperience studyId={study.id} title={study.title} blocks={blocks} />;
}
