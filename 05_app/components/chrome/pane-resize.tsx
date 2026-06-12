"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Generic pane-width resize (IA v0.4, ADR-0032 — same no-dependency choice as
 * the rail handle): a hook owning a clamped, localStorage-persisted width and
 * a separator handle. `dir` is which way the pane grows: +1 = dragging right
 * widens (pane left of the handle), -1 = dragging left widens (pane right of
 * the handle).
 */
export type PaneWidth = {
  width: number;
  set: (w: number, persist?: boolean) => void;
  min: number;
  max: number;
  def: number;
};

export function usePaneWidth(key: string, def: number, min: number, max: number): PaneWidth {
  const [width, setWidth] = useState(def);
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, w)), [min, max]);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (saved) setWidth(clamp(saved));
    } catch {
      // private mode — default is fine
    }
  }, [key, clamp]);

  const set = useCallback(
    (w: number, persist = false) => {
      const next = clamp(w);
      setWidth(next);
      if (persist) {
        try {
          localStorage.setItem(key, String(next));
        } catch {
          // ignore
        }
      }
    },
    [key, clamp],
  );

  return { width, set, min, max, def };
}

export function PaneHandle({
  pane,
  dir,
  label,
}: {
  pane: PaneWidth;
  dir: 1 | -1;
  label: string;
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pane.width;
    const onMove = (ev: PointerEvent) => pane.set(startW + dir * (ev.clientX - startX));
    const onUp = (ev: PointerEvent) => {
      pane.set(startW + dir * (ev.clientX - startX), true);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={pane.width}
      aria-valuemin={pane.min}
      aria-valuemax={pane.max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => pane.set(pane.def, true)}
      onKeyDown={(e) => {
        const delta = e.key === "ArrowRight" ? 16 * dir : e.key === "ArrowLeft" ? -16 * dir : 0;
        if (!delta) return;
        e.preventDefault();
        pane.set(pane.width + delta, true);
      }}
      className="-mx-2 hidden w-[6px] shrink-0 cursor-col-resize self-stretch rounded-full hover:bg-[var(--color-border-subtle)] focus-visible:bg-[var(--color-primary-subtle)] focus-visible:outline-none lg:block"
    />
  );
}
