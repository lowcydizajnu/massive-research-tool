"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ResultsSummary } from "@/server/trpc/routers/studies";

/**
 * Results actions (results-stage.md): the preview-included toggle (URL-driven,
 * so the server re-queries) + Export CSV (built client-side from the rows the
 * query already returned — fine at V1 study sizes; a streaming route is a later
 * optimization). One row per response; one column per question block.
 */
function toCsv(results: ResultsSummary): string {
  const qCols = results.questions.map((q) => q.instanceId);
  const header = ["response_id", "condition", "external_pid", "started_at", "completed_at", ...qCols.map((id) => csvCell(promptFor(results, id)))];
  const lines = [header.join(",")];
  for (const r of results.rows) {
    const cells = [
      r.responseId,
      r.conditionSlug,
      r.externalPid ?? "",
      r.startedAt,
      r.completedAt ?? "",
      ...qCols.map((id) => (r.answers[id] ?? "").toString()),
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\n");
}

function promptFor(results: ResultsSummary, instanceId: string): string {
  return results.questions.find((q) => q.instanceId === instanceId)?.prompt ?? instanceId;
}

function csvCell(value: string): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ResultsActions({
  studyId,
  results,
  includePreview,
}: {
  studyId: string;
  results: ResultsSummary;
  includePreview: boolean;
}) {
  function download() {
    const blob = new Blob([toCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-v${results.versionNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href={includePreview ? `/studies/${studyId}/results` : `/studies/${studyId}/results?preview=1`}
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium",
          includePreview
            ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
        )}
      >
        {includePreview ? "Including preview responses" : "Include preview responses"}
      </Link>
      <button
        type="button"
        onClick={download}
        className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
      >
        Export CSV
      </button>
    </div>
  );
}
