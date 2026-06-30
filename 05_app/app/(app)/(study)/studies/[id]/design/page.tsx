import { notFound } from "next/navigation";

import { DesignWorkspace } from "@/components/feature/design/design-workspace";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Design stage (ADR-0024, design-stage.md) — researcher-controlled participant
 * theming: preset picker + granular primitives + live sample. Only affects the
 * /take surface; the researcher workspace look is untouched.
 */
export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Design
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            How your study looks to participants. The theme travels with this study’s version —
            preregistering freezes it, and replications copy it.
          </p>
        </div>
        <DesignWorkspace
          studyId={study.id}
          initialTheme={study.theme}
          aiBlocks={study.blocks
            .filter((b) => b.key === "ai-chat")
            .map((b) => ({ instanceId: b.instanceId, title: b.title ?? b.name, config: b.config }))}
          socialBlocks={study.blocks
            .filter((b) => b.key === "social-post")
            .map((b) => ({ instanceId: b.instanceId, title: b.title ?? b.name, config: b.config }))}
        />
      </div>
    </main>
  );
}
