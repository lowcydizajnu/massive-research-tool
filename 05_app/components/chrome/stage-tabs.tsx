import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/**
 * Stage-tabs pill (build-stage-builder-mode.md v0.5.3) — a floating card that
 * spans only the center column, above the work surface. Six stages; the ones
 * with a route are live (Build, Preregister), the rest are shown but inert.
 */
const STAGES = ["Build", "Preview", "Share", "Preregister", "Run", "Results"] as const;
type Stage = (typeof STAGES)[number];

/** Live stages map to a route; absent = inert ("coming soon"). */
function hrefFor(stage: Stage, studyId: string): Route | null {
  if (stage === "Build") return `/studies/${studyId}/build` as Route;
  if (stage === "Preregister") return `/studies/${studyId}/preregister` as Route;
  return null;
}

export function StageTabs({
  studyId,
  active = "Build",
}: {
  studyId: string;
  active?: Stage;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Study stage"
      className="flex w-fit items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-1"
    >
      {STAGES.map((stage) => {
        const base = "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-body)]";
        const href = hrefFor(stage, studyId);
        if (href) {
          const isActive = stage === active;
          return (
            <Link
              key={stage}
              href={href}
              role="tab"
              aria-current={isActive ? "page" : undefined}
              className={cn(
                base,
                isActive
                  ? "border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] font-serif font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
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
