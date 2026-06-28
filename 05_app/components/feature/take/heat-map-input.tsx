"use client";

import { useRef, useState } from "react";

import { normalizedPoint } from "@/lib/take/image-coords";
import { BLOCK_COPY_DEFAULTS, type BlockCopyKey } from "@/lib/take/ui-copy";

type BlockCopy = Partial<Record<BlockCopyKey, string>>;

/** Heat-map (ADR-0041): click the image to drop points (normalized 0..1).
 *  Keyboard: Add-point drops at center, arrows nudge, Remove deletes.
 *  Participant-facing labels are researcher-overridable (ADR-0070; blank = default). */
export function HeatMapInput({ config, np, blockCopy }: { config: Record<string, unknown>; np: string; blockCopy?: BlockCopy }) {
  const addLabel = blockCopy?.heatmapAddPoint || BLOCK_COPY_DEFAULTS.heatmapAddPoint;
  const removeLabel = blockCopy?.heatmapRemove || BLOCK_COPY_DEFAULTS.heatmapRemove;
  const imageUrl = typeof config.imageUrl === "string" ? config.imageUrl.trim() : "";
  const maxPoints = typeof config.maxPoints === "number" ? config.maxPoints : 10;
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const imgRef = useRef<HTMLDivElement>(null);

  const add = (x: number, y: number) => setPoints((p) => (p.length >= maxPoints ? p : [...p, { x, y }]));
  const nudge = (i: number, dx: number, dy: number) =>
    setPoints((p) => p.map((pt, j) => (j === i ? { x: Math.min(1, Math.max(0, pt.x + dx)), y: Math.min(1, Math.max(0, pt.y + dy)) } : pt)));

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      {prompt ? <p className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{prompt}</p> : null}
      <input type="hidden" name={`${np}points`} value={JSON.stringify(points)} />
      <div
        ref={imgRef}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const { x, y } = normalizedPoint(e.clientX, e.clientY, r);
          add(x, y);
        }}
        className="relative w-full cursor-crosshair overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus
          <img src={imageUrl} alt="" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="flex h-48 items-center justify-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">No image configured</div>
        )}
        {points.map((pt, i) => (
          <span key={i} aria-hidden style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary)] px-1.5 text-[length:var(--text-small)] font-medium text-white">{i + 1}</span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => add(0.5, 0.5)} className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">{addLabel}</button>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{points.length}/{maxPoints}</span>
      </div>
      <ul aria-live="polite" className="flex flex-col gap-1">
        {points.map((pt, i) => (
          <li key={i} className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            <span>Point {i + 1} ({Math.round(pt.x * 100)}%, {Math.round(pt.y * 100)}%)</span>
            <span className="flex gap-0.5">
              <button type="button" aria-label={`Nudge point ${i + 1} left`} onClick={() => nudge(i, -0.02, 0)} className="px-1 hover:bg-[var(--color-surface-subtle)]">←</button>
              <button type="button" aria-label={`Nudge point ${i + 1} right`} onClick={() => nudge(i, 0.02, 0)} className="px-1 hover:bg-[var(--color-surface-subtle)]">→</button>
              <button type="button" aria-label={`Nudge point ${i + 1} up`} onClick={() => nudge(i, 0, -0.02)} className="px-1 hover:bg-[var(--color-surface-subtle)]">↑</button>
              <button type="button" aria-label={`Nudge point ${i + 1} down`} onClick={() => nudge(i, 0, 0.02)} className="px-1 hover:bg-[var(--color-surface-subtle)]">↓</button>
            </span>
            <button type="button" onClick={() => setPoints((p) => p.filter((_, j) => j !== i))} className="text-[var(--color-danger-text-on-subtle)] hover:underline">{removeLabel}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
