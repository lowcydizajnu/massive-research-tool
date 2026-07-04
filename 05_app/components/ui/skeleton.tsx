/**
 * Skeleton — a shimmer placeholder block for route-level loading states
 * (`loading.tsx`). Used so a section switch paints an instant skeleton while the
 * force-dynamic page renders on the server, instead of freezing on the old page
 * (owner 2026-07-04: "nice to have skeletons when you switch between sections").
 *
 * Pure presentational + token-driven; `animate-pulse` is disabled under
 * `prefers-reduced-motion`.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * A generic "header + optional KPI row + card grid" page skeleton that stands in
 * for any list/dashboard section during navigation. `kpis` shows a stat row;
 * `cards` is how many grid tiles to shim.
 */
export function PageSkeleton({ kpis = false, cards = 6 }: { kpis?: boolean; cards?: number }) {
  return (
    <div className="flex w-full flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading…">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 rounded-[var(--radius-sm)]" />
      </div>
      {kpis ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
          >
            <Skeleton className="aspect-[16/9] w-full rounded-[var(--radius-md)]" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full rounded-[var(--radius-sm)]" />
            <Skeleton className="h-4 w-1/3 rounded-[var(--radius-sm)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
