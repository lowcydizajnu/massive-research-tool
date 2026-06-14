"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ResultsSummary } from "@/server/trpc/routers/studies";
import { cn } from "@/lib/utils";

type Spatial = NonNullable<ResultsSummary["questions"][number]["spatial"]>;
type Resp = NonNullable<Spatial["responses"]>[number];

/** Hard cap on individually-rendered dots before we auto-switch to density. */
const DOT_CAP = 2000;
/** Density grid resolution (cells per side). */
const GRID = 24;
/** Graphic-slider value histogram bins over 0..1. */
const HIST_BINS = 20;

/**
 * Explore spatial responses (spatial-explore.md, ADR-0041 amendment). Client
 * island over the already-loaded `spatial` payload — no refetch. Filters by
 * condition, switches aggregate ↔ per-respondent and (heat-map) dots ↔ density.
 * All visuals compose from existing v0.6 tokens; the marker/region/dot layers
 * are decorative (`aria-hidden`) — the text readouts carry the data for AT.
 */
export function SpatialExplorer({
  spatial,
  conditions,
  initialCondition,
  initialRespondentId = null,
}: {
  spatial: Spatial;
  conditions: { slug: string; name: string }[];
  initialCondition: string;
  /** Deep link from the export (?r) — open per-respondent at this responseId. */
  initialRespondentId?: string | null;
}) {
  const responses = useMemo(() => spatial.responses ?? [], [spatial.responses]);
  // Deep link (?r): land in per-respondent view at that respondent. `rows[]` is a
  // superset of `responses[]`, so guard a miss — fall back to aggregate + notice
  // rather than silently opening respondent #1.
  const deepIdx = initialRespondentId ? responses.findIndex((r) => r.responseId === initialRespondentId) : -1;
  const deepMissing = initialRespondentId != null && deepIdx === -1;
  const [cond, setCond] = useState(initialRespondentId ? "all" : initialCondition); // "all" so the target is present
  const [view, setView] = useState<"aggregate" | "respondent">(deepIdx >= 0 ? "respondent" : "aggregate");
  const [mode, setMode] = useState<"dots" | "density" | null>(null); // null = auto
  const [opacity, setOpacity] = useState(0.4);
  const [tone, setTone] = useState(100); // stimulus saturation %, display-only
  const [idx, setIdx] = useState(deepIdx >= 0 ? deepIdx : 0);

  const condName = useMemo(() => new Map(conditions.map((c) => [c.slug, c.name])), [conditions]);

  // Condition chips: only conditions that have ≥1 response here, with counts.
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of responses) counts.set(r.conditionSlug, (counts.get(r.conditionSlug) ?? 0) + 1);
    return [...counts.entries()]
      .map(([slug, count]) => ({ slug, count, name: condName.get(slug) ?? slug }))
      .sort((a, b) => b.count - a.count);
  }, [responses, condName]);

  const filtered = useMemo(
    () => (cond === "all" ? responses : responses.filter((r) => r.conditionSlug === cond)),
    [responses, cond],
  );

  // Reset the per-respondent cursor when the filter CHANGES — but not on mount,
  // which would clobber a deep-linked (?r) starting index.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setIdx(0);
  }, [cond]);

  // Reflect the condition in the URL for shareability — no navigation/refetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (cond === "all") url.searchParams.delete("c");
    else url.searchParams.set("c", cond);
    window.history.replaceState(window.history.state, "", url);
  }, [cond]);

  const safeIdx = Math.min(idx, Math.max(0, filtered.length - 1));
  const current: Resp | undefined = filtered[safeIdx];

  const hasImage = Boolean(spatial.imageUrl);
  const kindLabel =
    spatial.kind === "heat-map" ? "click map" : spatial.kind === "hot-spot" ? "region picks" : "image slider";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {filtered.length} respondent{filtered.length === 1 ? "" : "s"}
        {cond === "all" ? "" : ` in “${condName.get(cond) ?? cond}”`} · {kindLabel}
      </p>

      {/* Control row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {chips.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by condition">
            <Chip active={cond === "all"} onClick={() => setCond("all")}>
              All ({responses.length})
            </Chip>
            {chips.map((c) => (
              <Chip key={c.slug} active={cond === c.slug} onClick={() => setCond(c.slug)}>
                {c.name} ({c.count})
              </Chip>
            ))}
          </div>
        ) : null}

        <Segmented
          label="View"
          value={view}
          onChange={(v) => setView(v as "aggregate" | "respondent")}
          options={[
            { value: "aggregate", label: "Aggregate" },
            { value: "respondent", label: "Per-respondent" },
          ]}
        />

        {spatial.kind === "heat-map" && view === "aggregate" ? (
          <Segmented
            label="Display"
            value={effectiveHeatMode(mode, filtered)}
            onChange={(v) => setMode(v as "dots" | "density")}
            options={[
              { value: "dots", label: "Dots" },
              { value: "density", label: "Density" },
            ]}
          />
        ) : null}

        {spatial.kind === "heat-map" && view === "aggregate" && effectiveHeatMode(mode, filtered) === "dots" ? (
          <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Dot opacity
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="accent-[var(--color-primary)]"
              aria-label="Dot opacity"
            />
          </label>
        ) : null}

        {hasImage ? (
          <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Image saturation
            <input
              type="range"
              min={0}
              max={200}
              step={10}
              value={tone}
              onChange={(e) => setTone(Number(e.target.value))}
              className="accent-[var(--color-primary)]"
              aria-label="Image saturation (0% mutes the stimulus, 100% is unchanged)"
            />
          </label>
        ) : null}
      </div>

      {deepMissing ? (
        <p role="status" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          That respondent has no response for this question — showing the aggregate instead.
        </p>
      ) : null}

      {/* Per-respondent stepper */}
      {view === "respondent" && filtered.length > 0 ? (
        <div
          className="flex items-center gap-3"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
            if (e.key === "ArrowRight") setIdx((i) => Math.min(filtered.length - 1, i + 1));
          }}
        >
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={safeIdx === 0}
            className={stepBtnCls}
          >
            ‹ Prev
          </button>
          <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {safeIdx + 1} / {filtered.length}
            {current ? ` · ${condName.get(current.conditionSlug) ?? current.conditionSlug}` : ""}
            {current?.externalPid ? ` · ${current.externalPid}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(filtered.length - 1, i + 1))}
            disabled={safeIdx >= filtered.length - 1}
            className={stepBtnCls}
          >
            Next ›
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Empty>No responses to explore in this condition yet.</Empty>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Stimulus panel */}
          {hasImage ? (
            <div className="relative w-full max-w-[640px] shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- researcher stimulus, normalized overlay */}
              <img
                src={spatial.imageUrl}
                alt=""
                className="block w-full select-none"
                style={tone === 100 ? undefined : { filter: `saturate(${tone}%)` }}
              />
              <Overlay
                spatial={spatial}
                view={view}
                mode={effectiveHeatMode(mode, filtered)}
                opacity={opacity}
                filtered={filtered}
                current={current}
              />
            </div>
          ) : (
            <Empty>No stimulus image configured — coordinates only (see the readout and CSV export).</Empty>
          )}

          {/* Readout panel (authoritative data for AT) */}
          <div className="min-w-0 flex-1">
            <Readout spatial={spatial} view={view} filtered={filtered} current={current} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- overlay (decorative) ---------- */

function Overlay({
  spatial,
  view,
  mode,
  opacity,
  filtered,
  current,
}: {
  spatial: Spatial;
  view: "aggregate" | "respondent";
  mode: "dots" | "density";
  opacity: number;
  filtered: Resp[];
  current: Resp | undefined;
}) {
  if (spatial.kind === "heat-map") {
    const points =
      view === "respondent" ? current?.points ?? [] : filtered.flatMap((r) => r.points ?? []);
    if (view === "aggregate" && mode === "density") {
      return <DensityGrid points={points} />;
    }
    const shown = points.slice(0, DOT_CAP);
    return (
      <>
        {shown.map((p, i) => (
          <span
            key={i}
            aria-hidden
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, opacity }}
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary)] mix-blend-multiply"
          />
        ))}
      </>
    );
  }

  if (spatial.kind === "hot-spot") {
    const regions = spatial.regions ?? [];
    if (view === "respondent") {
      const picked = new Set(current?.regionKeys ?? []);
      return (
        <>
          {regions.map((r) => (
            <span
              key={r.key}
              aria-hidden
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              className={cn(
                "absolute flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-primary)]",
                picked.has(r.key) ? "bg-[var(--color-primary)] opacity-60" : "opacity-30",
              )}
            >
              <span className="rounded bg-black/40 px-1 text-[length:var(--text-small)] font-medium text-white">{r.label}</span>
            </span>
          ))}
        </>
      );
    }
    // aggregate: shade by hit share over the filtered set
    const counts = regionCounts(filtered, regions);
    const max = Math.max(0, ...regions.map((r) => counts.get(r.key) ?? 0));
    return (
      <>
        {regions.map((r) => {
          const c = counts.get(r.key) ?? 0;
          return (
            <span
              key={r.key}
              aria-hidden
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                opacity: max > 0 ? 0.15 + 0.5 * (c / max) : 0.15,
              }}
              className="absolute flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-[var(--color-primary)]"
            >
              <span className="rounded bg-black/40 px-1 text-[length:var(--text-small)] font-medium text-white" style={{ opacity: 1 }}>
                {r.label}: {c}
              </span>
            </span>
          );
        })}
      </>
    );
  }

  // graphic-slider: markers along the track (y fixed mid-height)
  const values =
    view === "respondent"
      ? current?.value != null
        ? [current.value]
        : []
      : filtered.map((r) => r.value).filter((v): v is number => typeof v === "number");
  return (
    <>
      {values.map((v, i) => (
        <span
          key={i}
          aria-hidden
          style={{ left: `${v * 100}%`, top: "50%", opacity: view === "respondent" ? 1 : opacityForMarkers(values.length) }}
          className="absolute h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
        />
      ))}
    </>
  );
}

function DensityGrid({ points }: { points: { x: number; y: number }[] }) {
  const cells = new Array(GRID * GRID).fill(0);
  for (const p of points) {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor(p.x * GRID)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor(p.y * GRID)));
    cells[cy * GRID + cx] += 1;
  }
  const max = Math.max(0, ...cells);
  return (
    <div
      aria-hidden
      className="absolute inset-0 grid"
      style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)`, gridTemplateRows: `repeat(${GRID}, 1fr)` }}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className="bg-[var(--color-primary)]"
          style={{ opacity: max > 0 && c > 0 ? 0.1 + 0.7 * (c / max) : 0 }}
        />
      ))}
    </div>
  );
}

/* ---------- readout (authoritative) ---------- */

function Readout({
  spatial,
  view,
  filtered,
  current,
}: {
  spatial: Spatial;
  view: "aggregate" | "respondent";
  filtered: Resp[];
  current: Resp | undefined;
}) {
  if (spatial.kind === "hot-spot") {
    const regions = spatial.regions ?? [];
    const counts = regionCounts(filtered, regions);
    const total = filtered.length;
    return (
      <table className="w-full border-collapse text-[length:var(--text-small)]">
        <thead>
          <tr className="text-left text-[var(--color-text-muted)]">
            <th className="py-1 pr-2 font-medium">Region</th>
            <th className="py-1 pr-2 font-medium">Picks</th>
            <th className="py-1 font-medium">% of respondents</th>
          </tr>
        </thead>
        <tbody>
          {[...regions]
            .sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0))
            .map((r) => {
              const c = counts.get(r.key) ?? 0;
              const picked = view === "respondent" && (current?.regionKeys ?? []).includes(r.key);
              return (
                <tr
                  key={r.key}
                  className={cn("border-t border-[var(--color-border-subtle)]", picked && "font-medium text-[var(--color-primary)]")}
                >
                  <td className="py-1 pr-2 text-[var(--color-text-primary)]">{r.label}</td>
                  <td className="py-1 pr-2 text-[var(--color-text-secondary)]">{c}</td>
                  <td className="py-1 text-[var(--color-text-secondary)]">{total > 0 ? `${Math.round((c / total) * 100)}%` : "—"}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    );
  }

  if (spatial.kind === "graphic-slider") {
    const values = filtered.map((r) => r.value).filter((v): v is number => typeof v === "number");
    const n = values.length;
    const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : null;
    const median = n > 0 ? [...values].sort((a, b) => a - b)[Math.floor((n - 1) / 2)] : null;
    const bins = new Array(HIST_BINS).fill(0);
    for (const v of values) bins[Math.min(HIST_BINS - 1, Math.max(0, Math.floor(v * HIST_BINS)))] += 1;
    const max = Math.max(0, ...bins);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {n > 0 ? <>mean {mean!.toFixed(2)} · median {median!.toFixed(2)} · n={n}</> : "No values yet"}
          {view === "respondent" && current?.value != null ? (
            <span className="text-[var(--color-primary)]"> · this respondent: {current.value.toFixed(2)}</span>
          ) : null}
        </p>
        <ul className="flex flex-col gap-0.5">
          {bins.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[length:var(--text-small)]">
              <span className="w-16 shrink-0 text-right font-mono text-[var(--color-text-muted)]">
                {(i / HIST_BINS).toFixed(2)}–{((i + 1) / HIST_BINS).toFixed(2)}
              </span>
              <span className="h-3 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]">
                <span className="block h-full bg-[var(--color-primary)]" style={{ width: max > 0 ? `${(c / max) * 100}%` : "0%" }} />
              </span>
              <span className="w-6 shrink-0 text-right text-[var(--color-text-secondary)]">{c}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // heat-map readout: point totals
  const totalPoints = filtered.reduce((s, r) => s + (r.points?.length ?? 0), 0);
  const withMarks = filtered.filter((r) => (r.points?.length ?? 0) > 0).length;
  return (
    <div className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
      <span>{totalPoints} click{totalPoints === 1 ? "" : "s"} from {withMarks} respondent{withMarks === 1 ? "" : "s"}.</span>
      {view === "respondent" ? (
        <span className="text-[var(--color-text-primary)]">
          This respondent: {current?.points?.length ?? 0} click{(current?.points?.length ?? 0) === 1 ? "" : "s"}.
        </span>
      ) : totalPoints > DOT_CAP ? (
        <span className="text-[var(--color-text-muted)]">
          {totalPoints.toLocaleString()} clicks — Dots shows the first {DOT_CAP.toLocaleString()}; switch to Density to see all.
        </span>
      ) : null}
    </div>
  );
}

/* ---------- helpers + primitives ---------- */

function regionCounts(rows: Resp[], regions: { key: string }[]): Map<string, number> {
  const counts = new Map<string, number>(regions.map((r) => [r.key, 0]));
  for (const r of rows) for (const k of r.regionKeys ?? []) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}

function effectiveHeatMode(mode: "dots" | "density" | null, filtered: Resp[]): "dots" | "density" {
  if (mode) return mode;
  const total = filtered.reduce((s, r) => s + (r.points?.length ?? 0), 0);
  return total > DOT_CAP ? "density" : "dots";
}

function opacityForMarkers(n: number): number {
  // Thinner markers fade as they pile up so the track stays readable.
  return n > 200 ? 0.25 : n > 50 ? 0.45 : 0.7;
}

const stepBtnCls =
  "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[length:var(--text-small)] font-medium",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
      )}
    >
      {children}
    </button>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
      <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-3 py-1.5 text-[length:var(--text-small)] font-medium",
              value === o.value
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-4 py-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
      {children}
    </div>
  );
}
