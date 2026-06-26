import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { CompareView } from "@/components/feature/whiteboard/compare-view";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Whiteboard multi-version compare (ADR-0020 §A6). Working copy vs a chosen
 * frozen version, side-by-side with diff-colored nodes. Read-only — restoring a
 * version still happens from the Versions sub-tab (ADR-0019).
 */
export default async function WhiteboardComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vs?: string | string[] }>;
}) {
  const { id } = await params;
  const vsParam = (await searchParams).vs;
  const vs = Array.isArray(vsParam) ? vsParam[0] : vsParam;

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
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
            Compare versions
          </h1>
          <Link
            href={`/studies/${study.id}/build/whiteboard` as Route}
            className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
          >
            ← Back to Whiteboard
          </Link>
        </div>
        <CompareView studyId={study.id} initialVs={vs} />
      </div>
    </main>
  );
}
