import Link from "next/link";

import type { StudyListItem, StudyStage } from "@/server/trpc/routers/studies";

/**
 * Study card for the Studies destination list. Links to the study's Build
 * stage (the three-zone Builder, ADR-0011).
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
    <Link
      href={`/studies/${study.id}/build`}
      className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4 transition-colors hover:border-[var(--color-border-medium)] hover:bg-[var(--color-surface-subtle)]"
    >
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
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-small)] font-medium"
        style={{ backgroundColor: stage.bg, color: stage.text }}
      >
        <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.dot }} />
        {stage.label}
      </span>
    </Link>
  );
}
