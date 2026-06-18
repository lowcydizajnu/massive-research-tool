"use client";

import { Check, Copy, Link2, Quote } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Cite + Share affordances for the public Study Record sidebar (ADR-0056). Both
 * are pure client-side copy actions — no server round-trip. The citation is
 * built from the record's own metadata (author · year · title · canonical URL),
 * APA-ish; a published article DOI, when present, is appended. Share copies the
 * canonical record URL. "Save" (bookmark) lands with Phase C (`saved_record`).
 */
export function CiteShare({
  title,
  authorName,
  year,
  articleDoi,
}: {
  title: string;
  authorName: string;
  year: number;
  articleDoi: string | null;
}) {
  const [copied, setCopied] = useState<"cite" | "share" | null>(null);
  const url = typeof window !== "undefined" ? window.location.href : "";

  const citation =
    `${authorName || "Unknown author"} (${year}). ${title}. Massive Research Lab.` +
    (articleDoi ? ` https://doi.org/${articleDoi}` : url ? ` ${url}` : "");

  const copy = async (kind: "cite" | "share", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied((k) => (k === kind ? null : k)), 1800);
    } catch {
      // Clipboard blocked — leave state unchanged; the text is still selectable.
    }
  };

  const btn =
    "flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-left text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => copy("cite", citation)} className={btn} aria-label="Copy citation">
        {copied === "cite" ? <Check className="size-4 text-[var(--color-primary)]" aria-hidden /> : <Quote className="size-4 text-[var(--color-text-muted)]" aria-hidden />}
        {copied === "cite" ? "Citation copied" : "Cite"}
      </button>
      <button type="button" onClick={() => copy("share", url)} className={btn} aria-label="Copy link to this record">
        {copied === "share" ? <Check className="size-4 text-[var(--color-primary)]" aria-hidden /> : <Link2 className="size-4 text-[var(--color-text-muted)]" aria-hidden />}
        {copied === "share" ? "Link copied" : "Share"}
      </button>
      <p className={cn("rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]")}>
        <Copy className="mr-1 inline size-3 align-[-1px]" aria-hidden />
        {citation}
      </p>
    </div>
  );
}
