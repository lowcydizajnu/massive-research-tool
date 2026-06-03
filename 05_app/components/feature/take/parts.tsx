/** Shared participant-runtime presentational parts (participant-runtime.md). */

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-8 shadow-[var(--shadow-md)]">
      {children}
    </div>
  );
}

export function PreviewRibbon() {
  return (
    <p
      role="status"
      className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-2 text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]"
    >
      Preview — no responses are recorded.
    </p>
  );
}

/** "Question n of total" — text, not color-only (a11y). */
export function Progress({ position, total }: { position: number; total: number }) {
  const pct = total > 0 ? Math.round(((position + 1) / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Question {position + 1} of {total}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
        <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
