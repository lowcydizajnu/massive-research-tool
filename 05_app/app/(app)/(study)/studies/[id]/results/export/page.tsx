import Link from "next/link";
import { notFound } from "next/navigation";

import { ExportBuilder } from "@/components/feature/results/export-builder";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Export builder (V1.12 D, export-builder.md) — shape + download an
 * analysis-ready dataset from the study's Results.
 */
export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
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
          <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <Link href={`/studies/${study.id}/results`} className="hover:underline">
              Results
            </Link>
            <span aria-hidden>›</span>
            <span>Export</span>
          </div>
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Export data
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Choose, reorder, and rename variables, preview the rows, then download CSV / TSV / JSON
            plus a data dictionary.
          </p>
        </div>
        <ExportBuilder studyId={study.id} title={study.title} />
      </div>
    </main>
  );
}
