import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { ReplicateButton } from "@/components/feature/browse/replicate-button";
import { UseAsTemplateButton } from "@/components/feature/browse/use-as-template-button";
import { CiteShare } from "@/components/feature/study-record/cite-share";
import { SaveButton } from "@/components/feature/study-record/save-button";
import { RecordSections } from "@/components/feature/study-record/record-sections";
import { StudyScreenPreview } from "@/components/feature/browse/study-screen-preview";
import { getServerApi } from "@/server/trpc/server";
import type { PublicStudyDetail } from "@/server/trpc/routers/studies";

/**
 * The Study Record (ADR-0054) — the read-only, citable face of a study, and what
 * Browse lands on. Bound sections (abstract, method, conditions, protocol,
 * replications) auto-compose from the latest frozen version via the public
 * `getPublicStudy`. Finished studies offer Replicate; everything else offers
 * Use-as-template only ("you replicate a finding, not a plan").
 */
export const dynamic = "force-dynamic";

export default async function StudyRecordPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;
  const api = await getServerApi();
  let detail: PublicStudyDetail;
  try {
    detail = await api.studies.getPublicStudy({ studyId });
  } catch {
    notFound();
  }

  const finished = !!detail.finishedAt;
  const marker = detail.registrationWithdrawn
    ? `Preregistration v${detail.latestVersionNumber} (withdrawn)`
    : detail.latestKind === "preregistered"
      ? `Preregistration v${detail.latestVersionNumber}`
      : `Published v${detail.latestVersionNumber}`;

  const year = new Date(detail.record?.publishedAt ?? detail.createdAt).getFullYear();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <Link href={"/browse" as Route} className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90">
        ← Back to Browse
      </Link>

      {/* 2-column publication layout (ADR-0056): wide reading column + sticky
          action sidebar, shared with Browse's width. Stacks on small screens. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="flex min-w-0 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          <div className="flex flex-col gap-2">
            <span
              className={
                "w-fit rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium " +
                (finished
                  ? "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
                  : "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]")
              }
            >
              {finished ? "Finished" : "Preliminary — not yet finished"}
            </span>
            <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">{detail.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              <span>by {detail.authorName || "Unknown"}</span>
              <FollowButton targetType="author" targetId={detail.authorId} name={detail.authorName} />
              <span>· {marker}</span>
              {detail.replicationCount > 0 ? (
                <span>· {detail.replicationCount} replication{detail.replicationCount === 1 ? "" : "s"}</span>
              ) : null}
            </div>
            {detail.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {detail.tags.map((t) => (
                  <span key={t} className="flex items-center gap-1">
                    <span className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">#{t}</span>
                    <FollowButton targetType="tag" targetId={t} name={t} />
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {!finished ? (
            <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              This study is shared but its data collection isn&rsquo;t finished, so there&rsquo;s no result to replicate yet. You can
              start from its design with <strong>Use as template</strong>, or follow the author to hear when it&rsquo;s finished.
            </p>
          ) : null}

          {/* Composed Record (ADR-0054) once published; otherwise the default
              bound composition — rendered via the shared component so the
              composer Preview matches exactly (ADR-0056 C). */}
          <RecordSections detail={detail} />

          {/* See the actual participant screens before replicating / using as a
              template (feedback 01KW4PSR). */}
          <StudyScreenPreview studyId={detail.studyId} />
        </article>

        <aside className="flex h-fit flex-col gap-3 lg:sticky lg:top-3">
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
            {/* Replicate = finished only (ADR-0054); Template always available. */}
            {finished ? <ReplicateButton studyId={detail.studyId} className="w-full justify-center px-4 py-2" /> : null}
            <UseAsTemplateButton studyId={detail.studyId} className="w-full justify-center px-4 py-2" />
            <SaveButton studyId={detail.studyId} />
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
            <CiteShare
              title={detail.title}
              authorName={detail.authorName}
              year={year}
              articleDoi={detail.record?.articleDoi ?? null}
              registrationDoi={detail.registrationDoi}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

