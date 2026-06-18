"use client";

import { useMemo } from "react";

import { renderRecordMarkdown } from "@/lib/study-record/record-markdown";
import { cn } from "@/lib/utils";

/**
 * Renders Study Record authored markdown (ADR-0056). Client island — the
 * sanitiser is client-only — so the content hydrates in place. `tabular-nums`
 * gives figures the "nice number treatment" the owner asked for; the prose
 * styles are token-driven (no raw hex).
 */
export function RecordMarkdown({ md, className }: { md: string; className?: string }) {
  const html = useMemo(() => renderRecordMarkdown(md), [md]);
  if (!md.trim()) return null;
  return (
    <div
      className={cn("record-prose text-[length:var(--text-body)] text-[var(--color-text-primary)] [font-variant-numeric:tabular-nums]", className)}
      // Sanitised by renderRecordMarkdown (DOMPurify, http(s)-only links).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
