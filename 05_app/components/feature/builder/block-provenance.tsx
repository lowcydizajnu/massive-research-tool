"use client";

import { api } from "@/lib/trpc/react";

/**
 * Per-block provenance line (ADR-0038 — the blame analogue): which conscious
 * save introduced/last touched this block, and whether it changed since the
 * latest preregistration. Reviewer-audit value, derived on read.
 */
export function BlockProvenance({ studyId, instanceId }: { studyId: string; instanceId: string }) {
  const { data } = api.studies.blockProvenance.useQuery({ studyId, instanceId });
  if (!data) return null;
  const bits: string[] = [];
  if (data.createdIn) bits.push(`introduced in ${data.createdIn}`);
  if (data.lastChangedIn && data.lastChangedIn !== data.createdIn) bits.push(`last changed in ${data.lastChangedIn}`);
  if (!data.createdIn) bits.push("not in any saved version yet");
  if (data.editedSinceLastSave) bits.push("edited since the last save");
  if (bits.length === 0 && !data.sincePreregistration) return null;
  return (
    <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      {bits.join(" · ")}
      {data.sincePreregistration ? (
        <span
          className={
            data.sincePreregistration === "unchanged"
              ? " text-[var(--color-success-text-on-subtle)]"
              : " text-[var(--color-warning-text-on-subtle)]"
          }
        >
          {bits.length ? " · " : ""}
          {data.sincePreregistration === "unchanged"
            ? "unchanged since preregistration"
            : "differs from the preregistered version"}
        </span>
      ) : null}
    </p>
  );
}
