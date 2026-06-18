"use client";

import { Bold, Heading, Italic, Link2, List } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * A textarea with a minimal Markdown toolbar (ADR-0056) — Bold / Italic /
 * heading / list / link wrap the current selection. Authored Record content is
 * Markdown; this is the single editing surface for abstract / hypotheses /
 * narrative / custom + bound-section overrides. Keyboard-operable buttons; the
 * raw textarea is always directly editable.
 */
export function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 4,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const surround = (before: string, after = before, linePrefix?: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = value.slice(start, end);
    let insert: string;
    if (linePrefix) {
      const lines = (sel || "item").split("\n");
      insert = lines.map((l) => `${linePrefix}${l}`).join("\n");
    } else {
      insert = `${before}${sel || ariaLabel.toLowerCase()}${after}`;
    }
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    // Restore focus + place caret after the inserted text.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insert.length, start + insert.length);
    });
  };

  const tbBtn = "rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-secondary)]";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        <button type="button" className={tbBtn} aria-label="Bold" onClick={() => surround("**")}><Bold className="size-3.5" aria-hidden /></button>
        <button type="button" className={tbBtn} aria-label="Italic" onClick={() => surround("_")}><Italic className="size-3.5" aria-hidden /></button>
        <button type="button" className={tbBtn} aria-label="Heading" onClick={() => surround("", "", "### ")}><Heading className="size-3.5" aria-hidden /></button>
        <button type="button" className={tbBtn} aria-label="Bulleted list" onClick={() => surround("", "", "- ")}><List className="size-3.5" aria-hidden /></button>
        <button type="button" className={tbBtn} aria-label="Link" onClick={() => surround("[", "](https://)")}><Link2 className="size-3.5" aria-hidden /></button>
        <span className="ml-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Markdown</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={20000}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
        )}
      />
    </div>
  );
}
