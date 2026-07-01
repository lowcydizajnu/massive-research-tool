"use client";

import { api } from "@/lib/trpc/react";

/**
 * Block-level History tab (owner request: "History" on a selected block must
 * mean THIS block's history, not the study timeline): which save introduced
 * it and what each save changed about it, newest first. Derived from the
 * frozen snapshots (ADR-0033 philosophy).
 */
const KIND_LABEL = { introduced: "Introduced", changed: "Changed", removed: "Removed" } as const;

export function BlockHistoryPanel({
  studyId,
  instanceId,
  onOpenVersions,
}: {
  studyId: string;
  instanceId: string;
  /** Jump to the study-level Versions tab, where any saved version can be restored. */
  onOpenVersions?: () => void;
}) {
  const { data, isLoading } = api.studies.blockHistory.useQuery({ studyId, instanceId });
  // Restore-a-version lives on the study-level Versions tab; surface a link here so
  // "History" is a discoverable path to it (owner: "I could revert to any version,
  // now I cannot" — it was there, just one deselect away).
  const restoreLink = onOpenVersions ? (
    <button
      type="button"
      onClick={onOpenVersions}
      className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
    >
      Restore an earlier saved version →
    </button>
  ) : null;
  if (isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading history…</p>;
  }
  if (!data?.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No saved history yet — this block exists only in the working copy. Save a version and its
          story starts here.
        </p>
        {restoreLink}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {data.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-l-2 border-[var(--color-border-subtle)] pl-3">
            <span className="text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
              {e.label}
              <span className="pl-2 text-[length:var(--text-small)] font-normal text-[var(--color-text-muted)]">
                {KIND_LABEL[e.kind]} · {new Date(e.date).toLocaleDateString()}
              </span>
            </span>
            {e.changes.map((line, j) => (
              <span key={j} className="text-[length:var(--text-small)] leading-snug text-[var(--color-text-secondary)]">
                {line}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {restoreLink}
    </div>
  );
}
