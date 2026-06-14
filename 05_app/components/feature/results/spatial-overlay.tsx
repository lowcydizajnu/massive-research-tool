import type { ResultsSummary } from "@/server/trpc/routers/studies";

/**
 * Spatial results overlay (ADR-0041): renders the stimulus image with every
 * participant's clicks dotted on it (heat-map) or region-hit counts shaded
 * over the regions (hot-spot). Coordinates are normalized 0..1, so they place
 * correctly at any display width. Server component — pure SVG/CSS, no JS.
 */
type Spatial = NonNullable<ResultsSummary["questions"][number]["spatial"]>;

export function SpatialOverlay({ spatial }: { spatial: Spatial }) {
  if (!spatial.imageUrl) {
    return (
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        No stimulus image configured — coordinates only (see CSV export).
      </span>
    );
  }
  const maxCount = spatial.regions?.reduce((m, r) => Math.max(m, r.count), 0) ?? 0;
  return (
    <div className="relative max-w-[480px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- researcher stimulus, normalized overlay */}
      <img src={spatial.imageUrl} alt="" className="block w-full select-none" />
      {/* heat-map: a translucent dot per click */}
      {spatial.points?.map((p, i) => (
        <span
          key={i}
          aria-hidden
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary)] opacity-40 mix-blend-multiply"
        />
      ))}
      {/* hot-spot: shade each region by hit share, label with its count */}
      {spatial.regions?.map((r) => (
        <span
          key={r.key}
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
            opacity: maxCount > 0 ? 0.15 + 0.5 * (r.count / maxCount) : 0.15,
          }}
          className="absolute flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-primary)] text-[length:var(--text-small)] font-medium text-white"
        >
          <span className="rounded bg-black/40 px-1" style={{ opacity: 1 }}>{r.label}: {r.count}</span>
        </span>
      ))}
    </div>
  );
}
