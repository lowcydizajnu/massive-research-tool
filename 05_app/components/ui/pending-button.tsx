"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A small inline spinner (currentColor, so it inherits the button's text colour). */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

type Variant = "primary" | "secondary";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:opacity-90",
  secondary:
    "border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
};

/**
 * Primary mutation button with a built-in in-flight state (V1.7.1 item 1).
 * Wire a tRPC `mutation.isPending` into `pending`: the button disables, shows a
 * spinner, and swaps to `pendingLabel` so a slow save/comment/etc. reads as
 * "working", not "broken". `aria-busy` announces it to AT. One primitive so the
 * treatment doesn't drift across the ~12 mutation surfaces.
 */
export function PendingButton({
  pending,
  idleLabel,
  pendingLabel,
  variant = "primary",
  className,
  disabled,
  type = "button",
  ...rest
}: {
  pending: boolean;
  idleLabel: ReactNode;
  pendingLabel?: ReactNode;
  variant?: Variant;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium transition-opacity disabled:opacity-60",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {pending ? <Spinner className="size-4" /> : null}
      {pending ? (pendingLabel ?? idleLabel) : idleLabel}
    </button>
  );
}
