"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * A single-select dropdown styled with our tokens — NOT a native `<select>`,
 * whose flyout the OS draws unstyled (and whose caret browsers misalign). Mirrors
 * the menu pattern in `study-actions-menu` / `user-menu`: a trigger button with a
 * right-aligned caret, a `role="menu"` popover of `menuitemradio` rows (Check on
 * the active one), and ESC / outside-click to close. Keyboard: Tab to the
 * trigger, Enter/Space to open, Tab through options, Enter to pick.
 */
export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  align = "left",
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] py-1.5 pl-2.5 pr-2 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
          className,
        )}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={cn(
            "absolute top-full z-30 mt-1 min-w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-1",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[length:var(--text-small)] hover:bg-[var(--color-surface-subtle)]",
                  active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
                )}
              >
                <Check
                  className={cn("size-3.5 shrink-0 text-[var(--color-primary)]", active ? "opacity-100" : "opacity-0")}
                  aria-hidden
                />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
