"use client";

import { api } from "@/lib/trpc/react";

/**
 * Compiled per-block divergence rationale (ADR-0039) — the read-only card the
 * Configure hint promises: every diverged block with the researcher's "why",
 * derived live from the draft. Renders nothing for non-replications.
 */
export function DivergenceSummary({ studyId }: { studyId: string }) {
  const status = api.studies.replicationStatus.useQuery({ studyId });
  const study = api.studies.get.useQuery({ id: studyId });
  if (!status.data || !study.data) return null;
  const badges = status.data.badges;
  const diverged = study.data.blocks.filter((b) => badges[b.instanceId]);
  if (diverged.length === 0 && status.data.removedCount === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
      <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        Differences from the original — per block
      </h3>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Compiled from the rationale on each diverged block (Build → select the block). Included in
        the protocol text that preregistration records.
      </p>
      <ul className="flex flex-col gap-1.5">
        {diverged.map((b) => (
          <li key={b.instanceId} className="flex flex-col">
            <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
              {badges[b.instanceId] === "added" ? "＋" : "～"} {b.title?.trim() || b.name}
            </span>
            <span
              className={
                b.divergenceNote
                  ? "text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
                  : "text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]"
              }
            >
              {b.divergenceNote ?? "No rationale yet — add one in Build."}
            </span>
          </li>
        ))}
        {status.data.removedCount > 0 ? (
          <li className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            － {status.data.removedCount} block{status.data.removedCount === 1 ? "" : "s"} from the
            original removed (describe why in the notes above).
          </li>
        ) : null}
      </ul>
    </section>
  );
}
