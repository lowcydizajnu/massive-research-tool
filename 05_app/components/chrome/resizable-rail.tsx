"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Resizable left rail (workspace-mode-topbar.md, ADR-0032): wraps the LeftRail
 * and exposes a drag handle between it and the work surface. Pointer drag +
 * keyboard arrows (role="separator"); double-click resets. Width persists per
 * device in localStorage — deliberately NOT Clerk metadata (ADR-0032 why-not).
 */
const MIN = 120;
const MAX = 360;
const DEFAULT = 155;
const STEP = 16;
const KEY = "mrt-rail-width";

function clamp(w: number): number {
  return Math.min(MAX, Math.max(MIN, w));
}

export function ResizableRail({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT);
  const dragging = useRef(false);

  // Read the persisted width before first paint (no visible jump).
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (saved) setWidth(clamp(saved));
    } catch {
      // private mode etc. — default width is fine
    }
  }, []);

  const persist = useCallback((w: number) => {
    try {
      localStorage.setItem(KEY, String(w));
    } catch {
      // ignore
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;
      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        setWidth(clamp(startW + (ev.clientX - startX)));
      };
      const onUp = (ev: PointerEvent) => {
        dragging.current = false;
        const final = clamp(startW + (ev.clientX - startX));
        setWidth(final);
        persist(final);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [width, persist],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const delta = e.key === "ArrowRight" ? STEP : e.key === "ArrowLeft" ? -STEP : 0;
      if (!delta) return;
      e.preventDefault();
      const next = clamp(width + delta);
      setWidth(next);
      persist(next);
    },
    [width, persist],
  );

  return (
    <>
      <div style={{ width }} className="shrink-0">
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation"
        aria-valuenow={width}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          setWidth(DEFAULT);
          persist(DEFAULT);
        }}
        className="-mx-2 hidden w-[6px] shrink-0 cursor-col-resize self-stretch rounded-full hover:bg-[var(--color-border-subtle)] focus-visible:bg-[var(--color-primary-subtle)] focus-visible:outline-none lg:block"
      />
    </>
  );
}
