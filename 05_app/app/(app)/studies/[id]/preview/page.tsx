import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { BlockView } from "@/components/feature/take/block-view";
import { Card, PreviewRibbon } from "@/components/feature/take/parts";
import { getServerApi } from "@/server/trpc/server";
import type { RuntimeBlock } from "@/server/runtime/participant";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Preview stage — the study as a participant sees it (participant-runtime.md).
 * Read-only: renders every block through the participant `BlockView`, all on
 * one page, with nothing recorded. Conditional blocks are all shown here (a note
 * says so) so the researcher can eyeball the whole instrument before running.
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

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Preview" />
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <PreviewRibbon />
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
            {study.title}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Preview — exactly what a participant sees. Nothing is recorded; conditional blocks are
            all shown here regardless of their visibility rules.
          </p>
        </div>

        {blocks.length === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            No blocks yet — add some in Builder, then preview.
          </p>
        ) : (
          <ol className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
            {blocks.map((b) => (
              <li key={b.instanceId}>
                <Card>
                  <BlockView block={b} seed={study.id} />
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
