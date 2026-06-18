"use client";

import { usePathname } from "next/navigation";

import { api } from "@/lib/trpc/react";

/**
 * Route-aware breadcrumb segment for the top bar (build-stage-builder-mode.md +
 * studies-destination.md). Shows the current destination, and on a study route
 * appends the study title in Plex Serif. The title comes from the shared
 * studies.get React Query cache — on the Builder it's already populated, so this
 * is a cache read, not a new request.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Top-level destination label (only Studies is live in V1).
  const section =
    segments[0] === "studies"
      ? "Studies"
      : segments[0]
        ? segments[0][0].toUpperCase() + segments[0].slice(1)
        : "";

  // /studies/<uuid>/... → fetch (cache-hit) the study title.
  const studyId =
    segments[0] === "studies" && segments[1] && UUID_RE.test(segments[1])
      ? segments[1]
      : undefined;
  const study = api.studies.get.useQuery(
    { id: studyId ?? "" },
    { enabled: !!studyId },
  );

  // Don't repeat a top-level destination here — the left rail already shows
  // (and highlights) it. Only surface the section label for routes the rail
  // doesn't cover. (Study routes use the focused top bar, not this breadcrumb.)
  const RAIL = new Set(["dashboard", "studies", "library", "frameworks", "participants", "activity", "team", "settings"]);
  const showSection = !!section && !RAIL.has(segments[0] ?? "");

  return (
    <span className="flex items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      {showSection ? <span>· {section}</span> : null}
      {studyId ? (
        <>
          <span aria-hidden>·</span>
          <span className="max-w-[220px] truncate font-serif text-[var(--color-primary)]">
            {study.data?.title ?? "Study"}
          </span>
        </>
      ) : null}
    </span>
  );
}
