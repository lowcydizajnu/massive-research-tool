"use client";

import { Download } from "lucide-react";
import { useState } from "react";

/**
 * Renders a researcher-published dataset snapshot on the public record (ADR-0056
 * E2) — a capped preview table + a full CSV download. The snapshot is exactly
 * what the owner chose to publish from the Export Data view (PID excluded by
 * default); we just display it. No fetching, no PII logic here — that lived at
 * publish time.
 */
const PREVIEW_ROWS = 50;

function toCsv(headers: string[], rows: string[][]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [headers, ...rows].map((r) => r.map((c) => esc(c ?? "")).join(",")).join("\n");
}

export function PublicDataTable({ headers, rows, title }: { headers: string[]; rows: string[][]; title: string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, PREVIEW_ROWS);

  const download = () => {
    const blob = new Blob(["﻿" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {rows.length} response{rows.length === 1 ? "" : "s"} · {headers.length} columns
        </span>
        <button
          type="button"
          onClick={download}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          <Download className="size-3.5" aria-hidden /> Download CSV
        </button>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
        <table className="w-full border-collapse text-[length:var(--text-small)] [font-variant-numeric:tabular-nums]">
          <thead className="sticky top-0 bg-[var(--color-surface-subtle)]">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border-b border-[var(--color-border-subtle)] px-2 py-1.5 text-left font-medium text-[var(--color-text-secondary)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => (
              <tr key={ri} className="even:bg-[var(--color-surface-subtle)]/40">
                {headers.map((_, ci) => (
                  <td key={ci} className="max-w-[260px] truncate border-b border-[var(--color-border-subtle)] px-2 py-1 text-[var(--color-text-primary)]" title={r[ci] ?? ""}>{r[ci] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW_ROWS ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90">
          {showAll ? "Show fewer" : `Show all ${rows.length} rows`}
        </button>
      ) : null}
    </div>
  );
}
