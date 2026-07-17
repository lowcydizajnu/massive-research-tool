"use client";

import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A "?" affordance that opens a centered modal explaining a concept — the same
 * dialog the Builder's Variants section uses, extracted so every help icon looks
 * and behaves identically (owner 2026-07-17: "use the same logic for the ? icon
 * from variants", and "the question mark doesn't display a modal"). A native
 * `title=""` tooltip is invisible on click and flaky on touch; this is the
 * design-system answer for a multi-sentence explanation. For a one-line inline
 * hint prefer <InfoTooltip>; for a link into the docs site use <HelpLink>.
 *
 * Owns its own open state and trigger, so a caller just drops it beside a
 * heading: <HelpModal title="Your research plan" label="…">{body}</HelpModal>.
 */
export function HelpModal({
  title,
  label,
  children,
  iconClassName,
}: {
  title: string;
  /** Accessible name for the trigger button. */
  label: string;
  children: ReactNode;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes; focus moves into the dialog on open and back to the trigger
  // on close — a dialog the keyboard can't escape or reach is not accessible.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current; // stable, but copy it for the cleanup closure
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="rounded-full p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-secondary)]"
      >
        <HelpCircle className={cn("size-4", iconClassName)} aria-hidden />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex max-h-[80vh] w-full max-w-[560px] flex-col gap-3 overflow-auto rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 text-left"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                {title}
              </h3>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              {children}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-on-primary)] hover:opacity-90"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
