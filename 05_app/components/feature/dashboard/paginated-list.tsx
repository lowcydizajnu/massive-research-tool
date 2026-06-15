"use client";

import { Children, useState } from "react";

/**
 * Client list pager for dashboard widgets — shows `pageSize` rows (default 10)
 * at a time with Prev/Next, so a long list doesn't make one card tower over its
 * neighbours. Children are server-rendered `<li>`s (incl. server-action forms);
 * this only controls which slice is mounted, so the rows keep working.
 */
export function PaginatedList({
  children,
  pageSize = 10,
}: {
  children: React.ReactNode;
  pageSize?: number;
}) {
  const all = Children.toArray(children);
  const [page, setPage] = useState(0);
  const pages = Math.ceil(all.length / pageSize);
  const safePage = Math.min(page, Math.max(0, pages - 1));
  const start = safePage * pageSize;
  const shown = all.slice(start, start + pageSize);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">{shown}</ul>
      {/* Footer always renders when there are rows, so every list widget looks
          consistent (Prev/Next disable themselves on a single page). */}
      {all.length > 0 ? (
        <div className="flex items-center justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-[var(--radius-sm)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Prev
          </button>
          <span aria-live="polite">
            {start + 1}–{Math.min(start + pageSize, all.length)} of {all.length}
          </span>
          <button
            type="button"
            disabled={safePage >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="rounded-[var(--radius-sm)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
