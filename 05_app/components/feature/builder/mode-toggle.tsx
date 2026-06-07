"use client";

import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/**
 * Builder ⇆ Whiteboard mode toggle (build-stage-builder-mode.md, ADR-0020).
 * Two views of the same study — a real Link between /build and
 * /build/whiteboard (was inert until V1.8).
 */
export function ModeToggle({
  studyId,
  mode,
}: {
  studyId: string;
  mode: "builder" | "whiteboard";
}) {
  const tab = "rounded-[var(--radius-sm)] px-2 py-1 font-medium";
  const active = "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]";
  const inactive = "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";
  return (
    <div
      role="group"
      aria-label="Editor mode"
      className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-0.5 text-[length:var(--text-small)]"
    >
      <Link
        href={`/studies/${studyId}/build` as Route}
        aria-current={mode === "builder" ? "page" : undefined}
        className={cn(tab, mode === "builder" ? active : inactive)}
      >
        Builder
      </Link>
      <Link
        href={`/studies/${studyId}/build/whiteboard` as Route}
        aria-current={mode === "whiteboard" ? "page" : undefined}
        className={cn(tab, mode === "whiteboard" ? active : inactive)}
      >
        Whiteboard
      </Link>
    </div>
  );
}
