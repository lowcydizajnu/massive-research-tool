"use client";

import { useMemo, useState } from "react";

import type { ChangelogEntry } from "@/server/trpc/routers/studies";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Study changelog with a reader-chosen detail level (feedback 01KW4R8M). The
 * server already derives per-version block-level changes (added / removed /
 * config diffs / reorders / groups / overview / theme / consent); this lets the
 * researcher pick how much to see:
 *  - Summary  → headlines only (version saves + lifecycle events)
 *  - Detailed → every change line, uncapped
 */
type Level = "summary" | "detailed";

const LEVELS: { key: Level; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "detailed", label: "Detailed" },
];

export function StudyChangelog({ studyId, entries }: { studyId: string; entries: ChangelogEntry[] }) {
  const [level, setLevel] = useState<Level>("summary");
  // The granular edit trail (ADR-0086) is fetched only when the reader opens
  // Detailed, then interleaved with the version/lifecycle entries by timestamp.
  const timeline = api.studies.editTimeline.useQuery({ studyId }, { enabled: level === "detailed" });
  const shown = useMemo(() => {
    if (level !== "detailed" || !timeline.data?.length) return entries;
    return [...entries, ...timeline.data].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }, [level, entries, timeline.data]);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Changelog
        </h2>
        <div className="flex items-center gap-1" role="group" aria-label="Changelog detail level">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              aria-pressed={level === l.key}
              onClick={() => setLevel(l.key)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium",
                level === l.key
                  ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col">
        {shown.map((e, i) => {
          const lines = level === "detailed" ? e.detail : [];
          return (
            <li
              key={e.id}
              className={cn(
                "flex flex-col gap-1 py-2.5",
                i < shown.length - 1 && "border-b border-[var(--color-border-subtle)]",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  <span
                    aria-hidden
                    className={cn(
                      "inline-block size-1.5 shrink-0 rounded-full",
                      e.kind === "version" ? "bg-[var(--color-primary)]" : "bg-[var(--color-text-muted)]",
                    )}
                  />
                  {e.title}
                  {level === "summary" && e.detail.length > 0 ? (
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      · {e.detail.length} change{e.detail.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {new Date(e.at).toLocaleDateString()}
                  {e.actor ? ` · ${e.actor}` : ""}
                </span>
              </div>
              {lines.length > 0 ? (
                <ul className="ml-3.5 flex flex-col gap-0.5">
                  {lines.map((line, j) => (
                    <li key={j} className="text-[length:var(--text-small)] leading-snug text-[var(--color-text-secondary)]">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
