"use client";

import { useState } from "react";

/** Hot-spot (ADR-0041): toggle predefined regions (focusable buttons). */
type Region = { key: string; label: string; x: number; y: number; w: number; h: number };
export function HotSpotInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const imageUrl = typeof config.imageUrl === "string" ? config.imageUrl.trim() : "";
  const regions = (Array.isArray(config.regions) ? config.regions : []) as Region[];
  const multiple = config.multiple === true;
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : multiple ? [...s, key] : [key]));

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      {prompt ? <p className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{prompt}</p> : null}
      <input type="hidden" name={`${np}selected`} value={JSON.stringify(selected)} />
      <div className="relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- researcher-supplied stimulus
          <img src={imageUrl} alt="" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="flex h-48 items-center justify-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">No image configured</div>
        )}
        {regions.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={selected.includes(r.key)}
            aria-label={r.label}
            onClick={() => toggle(r.key)}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            className={`absolute rounded-[var(--radius-sm)] border-2 ${selected.includes(r.key) ? "border-[var(--color-primary)] bg-[var(--color-primary)]/25" : "border-[var(--color-border-medium)] bg-white/10 hover:bg-[var(--color-primary)]/10"}`}
          />
        ))}
      </div>
    </div>
  );
}
