"use client";

import { useRef, useState } from "react";

import { normalizedPoint } from "@/lib/take/image-coords";

/** Graphic slider (ADR-0041): a 0..1 handle over an image track. role=slider. */
export function GraphicSliderInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const imageUrl = typeof config.imageUrl === "string" ? config.imageUrl.trim() : "";
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const [value, setValue] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    setValue(normalizedPoint(clientX, r.top, r).x);
  };
  const step = (d: number) => setValue((v) => Math.min(1, Math.max(0, (v ?? 0.5) + d)));

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      {prompt ? <p className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{prompt}</p> : null}
      {value != null ? <input type="hidden" name={`${np}value`} value={String(value)} /> : null}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value != null ? Math.round(value * 100) : undefined}
        aria-label={prompt || "Graphic slider"}
        onClick={(e) => setFromX(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); step(0.02); }
          if (e.key === "ArrowLeft") { e.preventDefault(); step(-0.02); }
        }}
        className="relative w-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus
          <img src={imageUrl} alt="" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="flex h-32 items-center justify-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">No image configured</div>
        )}
        {value != null ? (
          <span aria-hidden style={{ left: `${value * 100}%` }} className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-[var(--color-primary)]">
            <span className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-[var(--color-primary)]" />
          </span>
        ) : null}
      </div>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{value != null ? `Position: ${Math.round(value * 100)}%` : "Click or use arrow keys to place the marker."}</span>
    </div>
  );
}
