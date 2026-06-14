"use client";

import { useRef, useState, type MouseEvent } from "react";

/** A region's click action (ADR-0043). Absent ⇒ just record the selection. */
type RegionAction =
  | { type: "record" }
  | { type: "link"; url: string }
  | { type: "advance" }
  | { type: "setValue"; key: string; value: string };

/** Hot-spot (ADR-0041): toggle predefined regions (focusable buttons). */
type Region = { key: string; label: string; x: number; y: number; w: number; h: number; visible?: boolean; action?: RegionAction };
export function HotSpotInput({ config, np }: { config: Record<string, unknown>; np: string }) {
  const imageUrl = typeof config.imageUrl === "string" ? config.imageUrl.trim() : "";
  const regions = (Array.isArray(config.regions) ? config.regions : []) as Region[];
  const multiple = config.multiple === true;
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const [selected, setSelected] = useState<string[]>([]);
  const [tags, setTags] = useState<Record<string, string>>({});
  const selectedRef = useRef<HTMLInputElement>(null);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : multiple ? [...s, key] : [key]));

  // Click dispatch (ADR-0043): record + run any side effect. `advance` submits
  // through the REAL Continue so sibling required-validation still runs.
  const onRegionClick = (r: Region, e: MouseEvent<HTMLButtonElement>) => {
    const action = r.action;
    if (action?.type === "advance") {
      setSelected([r.key]);
      const form = e.currentTarget.form;
      if (selectedRef.current) selectedRef.current.value = JSON.stringify([r.key]); // DOM value is what FormData submits
      const cont = form?.querySelector<HTMLButtonElement>("[data-take-continue]");
      if (form && cont) form.requestSubmit(cont);
      return;
    }
    toggle(r.key);
    if (action?.type === "link") {
      try {
        if (new URL(action.url).protocol === "https:") window.open(action.url, "_blank", "noopener");
      } catch {
        /* invalid url — recorded as a plain selection */
      }
    } else if (action?.type === "setValue") {
      setTags((t) => ({ ...t, [action.key]: action.value }));
    }
  };

  return (
    <div className="flex flex-col gap-[var(--take-field-gap,1rem)]">
      {prompt ? <p className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{prompt}</p> : null}
      <input ref={selectedRef} type="hidden" name={`${np}selected`} value={JSON.stringify(selected)} />
      <input type="hidden" name={`${np}tags`} value={JSON.stringify(tags)} />
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
            aria-label={r.action?.type === "link" ? `${r.label} (opens a link)` : r.label}
            onClick={(e) => onRegionClick(r, e)}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            className={`absolute rounded-[var(--radius-sm)] ${
              r.visible === false
                ? // invisible click zone: no resting outline/fill; still clickable
                  // + keyboard-focusable (focus ring) so it's never pointer-only.
                  "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                : `border-2 ${selected.includes(r.key) ? "border-[var(--color-primary)] bg-[var(--color-primary)]/25" : "border-[var(--color-border-medium)] bg-white/10 hover:bg-[var(--color-primary)]/10"}`
            }`}
          />
        ))}
      </div>
    </div>
  );
}
