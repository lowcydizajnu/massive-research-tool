"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

/**
 * Design-system confirmation modal (parchment-on-overlay per new-study-modal.md;
 * tokens only, no browser `confirm`). Use for destructive or surprising actions —
 * e.g. a reorder that would drop conditions. ESC or backdrop click cancels.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  items,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  /** Optional bullet list (e.g. the conditions that will be removed). */
  items?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBg = tone === "danger" ? "var(--color-danger)" : "var(--color-primary)";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-[440px] flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-6"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-[length:var(--text-title)] text-[var(--color-text-primary)]">{title}</h2>
          {body ? (
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{body}</p>
          ) : null}
          {items && items.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-3">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
                >
                  • {it}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "rounded-[var(--radius-md)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80",
            )}
            style={{ backgroundColor: confirmBg }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
