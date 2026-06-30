/**
 * Instant navigation skeleton for every study stage (Dashboard/Build/Design/…).
 * The stage pages are `force-dynamic` (per-request auth + DB), so without a
 * Suspense fallback a tab click showed the OLD page frozen until the server
 * render finished — which read as multi-second lag and provoked re-clicks
 * (feedback). This renders immediately on navigation so the switch feels instant.
 */
export default function StudyStageLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse p-3" aria-busy="true" aria-label="Loading…">
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="h-7 w-1/3 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
        <div className="h-4 w-2/3 rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]" />
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="h-20 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
          <div className="h-20 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
          <div className="h-20 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
        </div>
        <div className="h-4 w-1/2 rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]" />
        <div className="h-4 w-5/6 rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]" />
      </div>
    </div>
  );
}
