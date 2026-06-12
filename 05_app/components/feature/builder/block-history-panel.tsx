"use client";

import { api } from "@/lib/trpc/react";

/**
 * Block-level History tab (owner request: "History" on a selected block must
 * mean THIS block's history, not the study timeline): which save introduced
 * it and what each save changed about it, newest first. Derived from the
 * frozen snapshots (ADR-0033 philosophy).
 */
const KIND_LABEL = { introduced: "Introduced", changed: "Changed", removed: "Removed" } as const;

export function BlockHistoryPanel({ studyId, instanceId }: { studyId: string; instanceId: string }) {
  const { data, isLoading } = api.studies.blockHistory.useQuery({ studyId, instanceId });
  if (isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading history…</p>;
  }
  if (!data?.length) {
    return (
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        No saved history yet — this block exists only in the working copy. Save a version and its
        story starts here.
      </p>
    );
  }
  return (
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
  );
}
