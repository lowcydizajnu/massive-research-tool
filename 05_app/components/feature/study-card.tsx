import Link from "next/link";

import { StudyActionsMenu } from "@/components/chrome/study-actions-menu";
import type { StudyListItem, StudyStage } from "@/server/trpc/routers/studies";

/**
 * Study card for the Studies destination list. Links to the study's Build
 * stage (the three-zone Builder, ADR-0011), with a ⋯ actions menu (Duplicate /
 * Archive / Delete + exports) in the top-right — the same menu as the focused
 * top bar (study-actions-menu.tsx). The card is a full-surface overlay link; the
 * menu sits above it (relative z-10) so its clicks don't navigate.
 *
 * Stage badge encoding per studies-destination.md (token .subtle washes with
 * dark-on-subtle text; the full token only on the status dot).
 */
const STAGE_STYLES: Record<
  StudyStage,
  { label: string; bg: string; text: string; dot: string }
> = {
  draft: {
    label: "Draft",
    bg: "var(--color-surface-subtle)",
    text: "var(--color-text-secondary)",
    dot: "var(--color-text-muted)",
  },
  preregistered: {
    label: "Preregistered",
    bg: "var(--color-primary-subtle)",
    text: "var(--color-primary-text-on-subtle)",
    dot: "var(--color-primary)",
  },
  published: {
    label: "Published",
    bg: "var(--color-success-subtle)",
    text: "var(--color-success-text-on-subtle)",
    dot: "var(--color-success)",
  },
};

function formatEdited(iso: string): string {
  // Fixed locale so server and client render identically (no hydration drift).
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function StudyCard({ study }: { study: StudyListItem }) {
  const stage = STAGE_STYLES[study.stage];
  return (
    <div className="relative flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4 transition-colors hover:border-[var(--color-border-medium)] hover:bg-[var(--color-surface-subtle)]">
      {/* Full-surface overlay link — clicking anywhere but the badges/menu opens
          the builder. The menu (relative z-10) paints above it. */}
      <Link
        href={`/studies/${study.id}/build`}
        aria-label={`Open ${study.title}`}
        className="absolute inset-0 rounded-[var(--radius-md)]"
      />
      <div className="min-w-0">
        <h3 className="truncate font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
          {study.title}
        </h3>
        {study.isReplication ? (
          <p className="truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Replication of another study
          </p>
        ) : null}
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Edited {formatEdited(study.lastEditedAt)}
        </p>
      </div>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {/* Finished is a study-lifecycle tag shown ALONGSIDE the version tag, not
            instead of it (ADR-0056) — a finished study is still Preregistered/
            Published. Consistent wording with the focused top-bar badge. */}
        {study.finishedAt ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-small)] font-medium"
            style={{ backgroundColor: "var(--color-success-subtle)", color: "var(--color-success-text-on-subtle)" }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
            Finished
          </span>
        ) : null}
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-small)] font-medium"
          style={{ backgroundColor: stage.bg, color: stage.text }}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.dot }} />
          {stage.label}
        </span>
        {/* Above the overlay link so its own clicks/menu don't navigate. */}
        <span className="relative z-10">
          <StudyActionsMenu studyId={study.id} />
        </span>
      </span>
    </div>
  );
}
