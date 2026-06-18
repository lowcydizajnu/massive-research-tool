import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { ReplicateButton } from "@/components/feature/browse/replicate-button";
import { UseAsTemplateButton } from "@/components/feature/browse/use-as-template-button";
import { CiteShare } from "@/components/feature/study-record/cite-share";
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
  const marker =
    detail.latestKind === "preregistered"
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
              bound composition. Authored sections (abstract/narrative/custom/
              article) come from the record; bound sections resolve from `detail`. */}
          {detail.record ? <ComposedRecord detail={detail} /> : <DefaultRecord detail={detail} />}
        </article>

        <aside className="flex h-fit flex-col gap-3 lg:sticky lg:top-3">
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
            {/* Replicate = finished only (ADR-0054); Template always available. */}
            {finished ? <ReplicateButton studyId={detail.studyId} className="w-full justify-center px-4 py-2" /> : null}
            <UseAsTemplateButton studyId={detail.studyId} className="w-full justify-center px-4 py-2" />
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
            <CiteShare
              title={detail.title}
              authorName={detail.authorName}
              year={year}
              articleDoi={detail.record?.articleDoi ?? null}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Default bound composition (Slice 1) — shown until the owner publishes a composed record. */
function DefaultRecord({ detail }: { detail: PublicStudyDetail }) {
  return (
    <>
      {detail.overview.abstract ? (
        <Section title="Abstract">
          <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">{detail.overview.abstract}</p>
        </Section>
      ) : null}
      <MethodSection detail={detail} />
      <ProtocolSection detail={detail} />
    </>
  );
}

/** Composed render — sections in the owner's saved order, hidden ones dropped. */
function ComposedRecord({ detail }: { detail: PublicStudyDetail }) {
  const rec = detail.record!;
  const visible = rec.layout.filter((s) => !s.hidden);
  return (
    <>
      {visible.map((s, i) => {
        const key = `${s.type}-${i}`;
        switch (s.type) {
          case "abstract": {
            const text = rec.abstract || detail.overview.abstract;
            return text ? (
              <Section key={key} title="Abstract">
                <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">{text}</p>
              </Section>
            ) : null;
          }
          case "method":
            return <MethodSection key={key} detail={detail} />;
          case "preregistration":
            return detail.latestKind === "preregistered" ? (
              <Section key={key} title="Preregistration">
                <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  This study was preregistered (v{detail.latestVersionNumber}) — its plan was frozen before data collection.
                </p>
              </Section>
            ) : null;
          case "replications":
            return (
              <Section key={key} title="Replications">
                <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  {detail.replicationCount > 0
                    ? `${detail.replicationCount} replication${detail.replicationCount === 1 ? "" : "s"} so far.`
                    : "No replications yet."}
                </p>
              </Section>
            );
          case "results":
          case "data":
            return (
              <Section key={key} title={s.type === "results" ? "Results" : "Data"}>
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Aggregate results are shared with replicators; raw participant data stays private (ADR-0014).
                </p>
              </Section>
            );
          case "narrative":
            return s.content ? (
              <Section key={key} title="Results narrative">
                <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">{s.content}</p>
              </Section>
            ) : null;
          case "article-link":
            return rec.articleUrl || rec.articleDoi ? (
              <Section key={key} title="Article">
                <div className="flex flex-col gap-1 text-[length:var(--text-small)]">
                  {rec.articleUrl ? (
                    <a href={rec.articleUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:opacity-90">
                      {rec.articleUrl}
                    </a>
                  ) : null}
                  {rec.articleDoi ? <span className="text-[var(--color-text-secondary)]">DOI: {rec.articleDoi}</span> : null}
                </div>
              </Section>
            ) : null;
          case "materials":
            return null; // media inventory deferred (greyed in the composer)
          case "custom":
            return s.content ? (
              <Section key={key} title="More">
                <p className="whitespace-pre-wrap text-[length:var(--text-body)] text-[var(--color-text-primary)]">{s.content}</p>
              </Section>
            ) : null;
          default:
            return null;
        }
      })}
    </>
  );
}

/** Bound Method section — overview narrative + conditions (the comparable skeleton). */
function MethodSection({ detail }: { detail: PublicStudyDetail }) {
  if (detail.overview.sections.length === 0 && detail.conditions.length === 0) return null;
  return (
    <Section title="Method">
      <div className="flex flex-col gap-3">
        {detail.overview.sections.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{s.heading}</h3>
            <p className="whitespace-pre-wrap text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{s.contentMd}</p>
          </div>
        ))}
        {detail.conditions.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Conditions ({detail.conditions.length})</h3>
            <ul className="flex flex-wrap gap-2">
              {detail.conditions.map((c, i) => (
                <li key={i} className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/** Bound Protocol section — the version's blocks (names + refs). */
function ProtocolSection({ detail }: { detail: PublicStudyDetail }) {
  return (
    <Section title="Protocol">
      {detail.blocks.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">This version has no blocks.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detail.blocks.map((b) => (
            <li key={b.instanceId} className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
              <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{b.name}</span>
              <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">{b.ref}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}
