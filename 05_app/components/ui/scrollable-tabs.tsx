"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A horizontally-scrollable tab strip with arrow controls instead of a raw
 * scrollbar (owner request: a scrollbar in the context panel reads as broken to
 * a non-developer). The native scrollbar is hidden; chevron buttons appear only
 * on the side(s) with more tabs to reveal, and scroll the strip by ~60% of its
 * width. The inner container keeps `role="tablist"` so the tab semantics are
 * unchanged — this is purely a scroll affordance.
 */
export function ScrollableTabs({
  "aria-label": ariaLabel,
  className,
  children,
}: {
  "aria-label": string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const by = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: "smooth" });
  };

  const arrowCls =
    "flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] p-0.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";

  return (
    <div className="flex items-center gap-0.5">
      {!atStart ? (
        <button type="button" aria-label="Scroll tabs left" onClick={() => by(-1)} className={arrowCls}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
      <div
        ref={ref}
        role="tablist"
        aria-label={ariaLabel}
        onScroll={update}
        className={cn(
          "flex flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:whitespace-nowrap",
          className,
        )}
      >
        {children}
      </div>
      {!atEnd ? (
        <button type="button" aria-label="Scroll tabs right" onClick={() => by(1)} className={arrowCls}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
