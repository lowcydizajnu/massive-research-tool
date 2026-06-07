import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { ReplicateButton } from "@/components/feature/browse/replicate-button";
import { getServerApi } from "@/server/trpc/server";
import type { PublicStudyDetail } from "@/server/trpc/routers/studies";

/**
 * Read-only public study Details (browse-public-studies.md). Renders the latest
 * published/preregistered version's blocks; cross-tenant via the public
 * `getPublicStudy` (the workspace-scoped reads would 404 across tenants).
 */
export const dynamic = "force-dynamic";

export default async function PublicStudyPage({
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

  const marker =
    detail.latestKind === "preregistered"
      ? `Preregistration v${detail.latestVersionNumber}`
      : `Published v${detail.latestVersionNumber}`;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <Link
        href={"/browse" as Route}
        className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
      >
        ← Back to Browse
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-ink-deep)]">
            {detail.title}
          </h1>
          <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <span>by {detail.authorName || "Unknown"}</span>
            <FollowButton targetType="author" targetId={detail.authorId} name={detail.authorName} />
            <span>· {marker}</span>
            {detail.replicationCount > 0 ? (
              <span>
                · {detail.replicationCount} replication{detail.replicationCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {detail.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {detail.tags.map((t) => (
                <span key={t} className="flex items-center gap-1">
                  <span className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    #{t}
                  </span>
                  <FollowButton targetType="tag" targetId={t} name={t} />
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ReplicateButton studyId={detail.studyId} className="px-4 py-2" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Blocks</h2>
        {detail.blocks.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            This version has no blocks.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.blocks.map((b) => (
              <li
                key={b.instanceId}
                className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
              >
                <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  {b.name}
                </span>
                <span className="font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                  {b.ref}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
