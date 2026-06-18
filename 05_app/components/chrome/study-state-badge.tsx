"use client";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Global study-state pill in the focused top bar (audit step 2). Surfaces, on
 * every stage, which FROZEN version participants get + recruitment status + N —
 * so a researcher editing the draft can't miss that a different version is live.
 * "draft ahead" warns when Build edits diverge from the live version (they won't
 * reach participants until publish/amend). Renders nothing until a version is frozen.
 */
export function StudyStateBadge({ studyId }: { studyId: string }) {
  const { data } = api.studies.getRunInfo.useQuery({ studyId });
  if (!data?.runnable) return null;

  const r = data.recruitment;
  // "Finished" is the study-lifecycle state (ADR-0054) and outranks the
  // recruitment status in the label — so we never say "Closed" here while the
  // rest of the app calls the same study "Finished" (ADR-0056 vocabulary fix).
  const finished = !!data.finishedAt;
  const statusLabel = finished
    ? "Finished"
    : !r
      ? "Frozen"
      : r.status === "open"
        ? "Recruiting"
        : r.status === "paused"
          ? "Paused"
          : "Closed";
  const dot = finished || !r || r.status === "closed"
    ? "bg-[var(--color-text-muted)]"
    : r.status === "open"
      ? "bg-[var(--color-success)]"
      : "bg-[var(--color-warning)]";
  const kind = data.versionKind === "preregistered" ? "Preregistered" : "Published";

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] md:inline-flex"
      title={`${statusLabel} — participants get the frozen ${kind.toLowerCase()} version ${data.liveVersionNumber}${r ? `, ${r.currentN} response${r.currentN === 1 ? "" : "s"}` : ""}${data.divergedFromLive ? ". Your Build edits are a newer draft and won't reach participants until you publish or amend." : ""}`}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {statusLabel} · {kind} v{data.liveVersionNumber}
      {r ? ` · ${r.currentN}` : ""}
      {data.divergedFromLive ? (
        <span className="text-[var(--color-warning-text-on-subtle)]">· draft ahead</span>
      ) : null}
    </span>
  );
}
