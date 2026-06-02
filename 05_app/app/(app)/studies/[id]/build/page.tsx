import { Plus } from "lucide-react";
import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { getServerApi } from "@/server/trpc/server";
import type { StudyDetail } from "@/server/trpc/routers/studies";

/**
 * Build stage — Builder mode shell (build-stage-builder-mode.md v0.5.3).
 *
 * The canonical three-zone surface: stage-tabs pill + work-surface card in the
 * center column, Details panel on the right. This is the read-only shell — the
 * title is static and + Add block is inert; title editing, block add (module
 * picker), drag-reorder, validation, and autosave land with the tRPC HTTP
 * client + React Query in the next units.
 */
const STAGE_LABEL: Record<StudyDetail["stage"], string> = {
  draft: "draft",
  preregistered: "preregistered",
  published: "published",
};

function formatEdited(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function BuildStagePage({
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
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <StageTabs studyId={study.id} />

        <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1
                aria-label="Study title"
                className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]"
              >
                {study.title}
              </h1>
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                v{study.versionNumber} · {STAGE_LABEL[study.stage]} · Edited{" "}
                {formatEdited(study.lastEditedAt)}
                {study.isReplication ? " · replicating an upstream study" : ""}
              </p>
            </div>
            {/* Builder / Whiteboard toggle (Whiteboard deferred V1.5) */}
            <div
              role="group"
              aria-label="Editor mode"
              className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5 text-[length:var(--text-small)]"
            >
              <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-1 font-medium text-[var(--color-primary-text-on-subtle)]">
                Builder
              </span>
              <span
                title="Whiteboard — coming soon"
                className="cursor-default px-2 py-1 text-[var(--color-text-muted)] opacity-60"
              >
                Whiteboard
              </span>
            </div>
          </div>

          {/* Blocks */}
          <section className="flex flex-col gap-3">
            <h2 className="border-b border-[var(--color-border-subtle)] pb-1 font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
              Blocks
            </h2>

            {study.blockCount === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-10 text-center">
                <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                  No blocks yet. Add your first to start building.
                </p>
                <button
                  type="button"
                  disabled
                  title="Block picker — coming next"
                  className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-muted)] opacity-60"
                >
                  <Plus className="size-4" aria-hidden />
                  Add block
                </button>
              </div>
            ) : (
              <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                {study.blockCount} block{study.blockCount === 1 ? "" : "s"} — the
                block list lands with the block editor.
              </p>
            )}
          </section>
        </div>
      </main>

      {/* Right context panel */}
      <aside className="flex w-[250px] shrink-0 flex-col gap-4 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
        <nav role="tablist" aria-label="Context" className="flex flex-wrap gap-1">
          <span
            role="tab"
            aria-current="page"
            className="rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]"
          >
            Details
          </span>
          {["History", "Replications", "Comments", "Validation"].map((t) => (
            <span
              key={t}
              role="tab"
              aria-disabled="true"
              title="Coming soon"
              className="cursor-default px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)] opacity-60"
            >
              {t}
            </span>
          ))}
        </nav>

        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
            At a glance
          </h2>
          <DetailRow label="Status">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              {STAGE_LABEL[study.stage]}
            </span>
          </DetailRow>
          <DetailRow label="Owner">
            <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
              {study.ownerName || "—"}
            </span>
          </DetailRow>
          <DetailRow label="Tags">
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              None yet
            </span>
          </DetailRow>
        </div>
      </aside>
    </>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}
