import type { Metadata } from "next";
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
import { studyRecordJsonLd } from "@/lib/seo/jsonld";
import { recordUrl } from "@/lib/site-url";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { getServerApi } from "@/server/trpc/server";
import type { PublicStudyDetail } from "@/server/trpc/routers/studies";

/** SEO: crawlable title/description + canonical + OpenGraph (ADR-0055 am.1). A
 *  non-public / not-found study returns robots:noindex so existence isn't leaked. */
export async function generateMetadata({ params }: { params: Promise<{ studyId: string }> }): Promise<Metadata> {
  const { studyId } = await params;
  const api = await getServerApi();
  const detail = await api.studies.getPublicStudy({ studyId }).catch(() => null);
  if (!detail) return { title: "Not found — My Research Lab", robots: { index: false } };
  const description = (detail.record?.abstract || detail.overview.abstract || undefined)?.slice(0, 300);
  return {
    title: `${detail.title} — My Research Lab`,
    description,
    alternates: { canonical: recordUrl(detail.studyId) },
    openGraph: {
      type: "article",
      title: detail.title,
      description,
      url: recordUrl(detail.studyId),
      publishedTime: detail.record?.publishedAt ?? detail.createdAt,
      authors: [detail.authorName || "Unknown"],
      tags: detail.tags,
    },
    twitter: { title: detail.title, description },
  };
}

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

  // GitHub-model (ADR-0055 am.1): this page is public. Anonymous visitors see the
  // whole record + the action buttons; the buttons route to /signin on click.
  const authed = !!(await getCurrentDbUser());

  const finished = !!detail.finishedAt;
  // The marker names the study's CURRENT state, so it is keyed off `latestKind`.
  // `registrationWithdrawn` must NOT lead here: ADR-0102 D4 re-derived that flag
  // from the newest *preregistered* version, which is no longer necessarily the
  // latest frozen one. Leading with it printed "Preregistration v8 (withdrawn)" for
  // a study preregistered at v3 and published at v8 — a version number that is not
  // a preregistration, on a study that is not withdrawn, contradicting the
  // Preregistration section directly below it (which cites v3, correctly). A
  // withdrawal is a fact about the plan, not about the study's state; the
  // Preregistration section is where it belongs and where it already renders.
  const marker =
    detail.latestKind === "preregistered"
      ? `Preregistration v${detail.latestVersionNumber}${detail.registrationWithdrawn ? " (withdrawn)" : ""}`
      : `Published v${detail.latestVersionNumber}`;

  const year = new Date(detail.record?.publishedAt ?? detail.createdAt).getFullYear();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {/* schema.org structured data for search engines / Google Dataset Search
          (ADR-0055 am.1). Escape `<` so a value can't break out of the script. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(studyRecordJsonLd(detail)).replace(/</g, "\\u003c") }}
      />
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
              {detail.authorOrcid ? (
                <a
                  href={`https://orcid.org/${detail.authorOrcid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[length:var(--text-mono)] text-[var(--color-primary)] hover:opacity-90"
                  aria-label={`ORCID iD ${detail.authorOrcid}`}
                >
                  ORCID {detail.authorOrcid}
                </a>
              ) : null}
              <FollowButton targetType="author" targetId={detail.authorId} name={detail.authorName} authed={authed} />
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
                    <FollowButton targetType="tag" targetId={t} name={t} authed={authed} />
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
            {finished ? <ReplicateButton studyId={detail.studyId} className="w-full justify-center px-4 py-2" authed={authed} /> : null}
            <UseAsTemplateButton studyId={detail.studyId} className="w-full justify-center px-4 py-2" authed={authed} />
            <SaveButton studyId={detail.studyId} authed={authed} />
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

