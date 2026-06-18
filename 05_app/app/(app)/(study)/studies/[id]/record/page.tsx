import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { RecordComposer } from "@/components/feature/study-record/record-composer";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Study Record composer — the LAST stage tab (ADR-0056; was nested under
 * Results). The owner's edit mode for the finished-study publication: compose
 * bound + authored sections, preview, then publish (visibility = public).
 */
export const dynamic = "force-dynamic";

export default async function RecordStagePage({ params }: { params: Promise<{ id: string }> }) {
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StageTabs studyId={study.id} active="Record" />
        {study.forkableBy === "public" ? (
          <Link
            href={`/browse/${study.id}` as Route}
            className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            View public record →
          </Link>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Study record
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            The readable, citable face of this study. Bound sections fill from your data; authored sections are yours
            to write. Reorder, show/hide, then publish a public record.
          </p>
        </div>
        <RecordComposer studyId={study.id} />
      </div>
    </main>
  );
}
