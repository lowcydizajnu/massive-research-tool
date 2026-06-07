import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { ModeToggle } from "@/components/feature/builder/mode-toggle";
import { WhiteboardCanvas } from "@/components/feature/whiteboard/whiteboard-canvas";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Build stage — Whiteboard mode (ADR-0020). The second face of the Builder/
 * Whiteboard toggle: the study as a node-graph. Reuses the Build chrome (stage
 * pill + work-surface card); the canvas is a translation layer over the same
 * blocks the Builder edits.
 */
export default async function WhiteboardPage({
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

  return (
    <TRPCReactProvider>
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <StageTabs studyId={study.id} active="Build" />
        <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
                {study.title}
              </h1>
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Whiteboard — blocks as a graph, visibility rules as wires.
              </p>
            </div>
            <ModeToggle studyId={study.id} mode="whiteboard" />
          </div>
          <WhiteboardCanvas study={study} />
        </div>
      </main>
    </TRPCReactProvider>
  );
}
