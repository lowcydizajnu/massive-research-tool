import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Stage-tabs pill (build-stage-builder-mode.md v0.5.3) — a floating card that
 * spans only the center column, above the work surface. Six stages; only Build
 * is built, so the rest are shown but inert (deferred surfaces).
 */
const STAGES = [
  "Build",
  "Preview",
  "Share",
  "Preregister",
  "Run",
  "Results",
] as const;

export function StageTabs({ studyId }: { studyId: string }) {
  return (
    <nav
      role="tablist"
      aria-label="Study stage"
      className="flex w-fit items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-1"
    >
      {STAGES.map((stage) => {
        const active = stage === "Build";
        const base =
          "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-body)]";
        if (active) {
          return (
            <Link
              key={stage}
              href={`/studies/${studyId}/build`}
              role="tab"
              aria-current="page"
              className={cn(
                base,
                "border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] font-serif font-medium text-[var(--color-primary)]",
              )}
            >
              {stage}
            </Link>
          );
        }
        return (
          <span
            key={stage}
            role="tab"
            aria-disabled="true"
            title="Coming soon"
            className={cn(base, "cursor-default text-[var(--color-text-muted)] opacity-60")}
          >
            {stage}
          </span>
        );
      })}
    </nav>
  );
}
