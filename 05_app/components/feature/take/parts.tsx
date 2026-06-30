/** Shared participant-runtime presentational parts (participant-runtime.md). */

export function Card({ children }: { children: React.ReactNode }) {
  // Edge-to-edge on mobile (full-bleed: no side border / rounding, tighter pad) so
  // the stimulus + the flush progress bar use the whole width and aren't "boxed in
  // a box" (feedback 01KWCJ30X9); a centered, rounded, bordered card from `sm` up.
  // `--take-card-pad` scales with the padding so ScreenHeader's negative-margin
  // full-bleed stays exact at every breakpoint.
  return (
    <div className="flex flex-col gap-4 border-y border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-[var(--take-card-pad)] shadow-[var(--shadow-md)] [--take-card-pad:1rem] sm:rounded-[var(--radius-lg)] sm:border sm:[--take-card-pad:2rem]">
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

/**
 * Full-bleed screen header (grouping review #7): a progress bar flush to the
 * card's top edge + the page count and a compact "Preview" chip — above the
 * question content, not inside it. Cancels the Card's p-8 with negative margin.
 */
export function ScreenHeader({
  position,
  total,
  preview,
  progress = "bar",
  stepLabel,
}: {
  position: number;
  total: number;
  preview: boolean;
  /** Researcher-chosen progress style (ADR-0024): bar / step counter / none. */
  progress?: "bar" | "steps" | "none";
  /** Researcher-editable progress text (uiCopy.progressLabel); falls back to the default. */
  stepLabel?: string;
}) {
  const pct = total > 0 ? Math.round(((position + 1) / total) * 100) : 0;
  if (progress === "none" && !preview) return null;
  return (
    <div className="mx-[calc(-1*var(--take-card-pad,2rem))] mt-[calc(-1*var(--take-card-pad,2rem))] mb-1 flex flex-col">
      {progress === "bar" ? (
        <div className="h-1.5 w-full overflow-hidden rounded-t-[var(--radius-lg)] bg-[var(--color-surface-subtle)]">
          <div className="h-full bg-[var(--color-primary)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <div className="flex items-center justify-between px-[var(--take-card-pad,2rem)] pt-3">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {progress === "none" ? "" : stepLabel ?? `Page ${position + 1} of ${total}`}
        </span>
        {preview ? (
          <span className="rounded-full bg-[var(--color-warning-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]">
            Preview · not recorded
          </span>
        ) : null}
      </div>
    </div>
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
