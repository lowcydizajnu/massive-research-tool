"use client";

import { CircleHelp } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Design-system info tooltip — a "?" icon that reveals a styled explanation on
 * hover/focus (and tap, for touch), positioned next to the icon. Replaces native
 * `title=""` browser tooltips so help text matches our look (parchment card,
 * tokens) and is keyboard- + screen-reader-accessible (button + aria-describedby).
 *
 * Use this anywhere a small inline explanation is needed. For links into the docs
 * site use <HelpLink> instead (that opens Mintlify; this just explains in place).
 */
export function InfoTooltip({
  text,
  label = "More information",
  side = "top",
  className,
}: {
  text: string;
  /** Accessible name for the trigger (defaults to "More information"). */
  label?: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-help items-center text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-left text-[length:var(--text-small)] font-normal normal-case leading-snug tracking-normal text-[var(--color-text-secondary)] shadow-[var(--shadow-md)]",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
