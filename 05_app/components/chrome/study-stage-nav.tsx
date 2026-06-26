"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Study stage nav (secondary nav) — a single centered bar attached directly
 * below the primary top bar, shared by every `/studies/[id]/*` stage (hoisted
 * out of the individual pages so the tabs never shift and the content width
 * below stays consistent). Active state is derived from the URL.
 */
const STAGES = ["Dashboard", "Overview", "Build", "Design", "Preview", "Comment", "Preregister", "Run", "Results", "Record"] as const;
type Stage = (typeof STAGES)[number];

function hrefFor(stage: Stage, studyId: string): Route {
  const base = `/studies/${studyId}`;
  switch (stage) {
    case "Preview":
      // Preview opens the full-screen participant preview by default (side-by-side
      // in the Builder is offered from there).
      return `${base}/preview` as Route;
    // "Comment" is the peer-review + comments surface — still served by /share.
    case "Comment":
      return `${base}/share` as Route;
    default:
      return `${base}/${stage.toLowerCase()}` as Route;
  }
}

/** Which tab is active for the current path (+ ?preview=1 for the Build/Preview split). */
function activeStage(pathname: string, studyId: string, isPreview: boolean): Stage | null {
  const rest = pathname.replace(`/studies/${studyId}`, "").replace(/^\//, "");
  const seg = rest.split("/")[0] || "dashboard";
  if (seg === "build") return isPreview ? "Preview" : "Build";
  if (seg === "preview") return "Preview";
  if (seg === "share") return "Comment";
  if (seg === "overview") return "Overview";
  if (seg === "design") return "Design";
  if (seg === "preregister") return "Preregister";
  if (seg === "run") return "Run";
  if (seg === "results") return "Results";
  if (seg === "record") return "Record";
  if (seg === "dashboard") return "Dashboard";
  return null;
}

export function StudyStageNav({ studyId }: { studyId: string }) {
  const pathname = usePathname() ?? "";
  const isPreview = (useSearchParams()?.get("preview") ?? "") === "1";
  const active = activeStage(pathname, studyId, isPreview);

  return (
    <div className="flex w-full justify-center border-b border-[var(--color-border-subtle)] px-3 pb-2 pt-2">
      <nav role="tablist" aria-label="Study stage" className="flex flex-wrap items-center justify-center gap-1">
        {STAGES.map((stage) => {
          const isActive = stage === active;
          return (
            <Link
              key={stage}
              href={hrefFor(stage, studyId)}
              role="tab"
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-body)]",
                isActive
                  ? "bg-[var(--color-primary-subtle)] font-serif font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {stage}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
