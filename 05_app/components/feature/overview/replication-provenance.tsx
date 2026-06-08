import Link from "next/link";
import type { Route } from "next";

import type { BlockDiff } from "@/server/modules/blocks";

export type Provenance = {
  studyId: string;
  title: string;
  authorName: string;
  canSeeDetail: boolean;
  diff: BlockDiff | null;
};

/**
 * Replication provenance + auto-generated change summary (V1.12, on the Overview
 * stage). For a forked study: links back to the original + lists what changed
 * vs. the parent (added / removed / modified blocks), from `diffBlocks`. The
 * researcher's own notes live in the editable "Notes on changes" field.
 */
export function ReplicationProvenance({ parent, studyId }: { parent: Provenance; studyId: string }) {
  const d = parent.diff;
  const changed = d ? d.added.length + d.removed.length + d.changed.length : 0;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Replication of
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2">
          {parent.canSeeDetail ? (
            <Link
              href={`/studies/${parent.studyId}/overview` as Route}
              className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)] underline-offset-2 hover:underline"
            >
              {parent.title}
            </Link>
          ) : (
            <span className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
              {parent.title}
            </span>
          )}
          {parent.authorName ? (
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              by {parent.authorName}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          What changed (auto-generated)
        </span>
        {!parent.canSeeDetail || !d ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            The original is private — the block-level diff isn’t available.
          </p>
        ) : changed === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            No block changes yet — identical to the original ({d.unchangedCount} block
            {d.unchangedCount === 1 ? "" : "s"}).
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {d.added.length > 0 ? (
              <li>
                <span className="font-medium text-[var(--color-success-text-on-subtle)]">Added {d.added.length}</span>
                {": "}
                {d.added.map((b) => b.name).join(", ")}
              </li>
            ) : null}
            {d.removed.length > 0 ? (
              <li>
                <span className="font-medium text-[var(--color-danger-text-on-subtle)]">Removed {d.removed.length}</span>
                {": "}
                {d.removed.map((b) => b.name).join(", ")}
              </li>
            ) : null}
            {d.changed.length > 0 ? (
              <li>
                <span className="font-medium text-[var(--color-text-primary)]">Modified {d.changed.length}</span>
                {": "}
                {d.changed.map((b) => b.name).join(", ")}
              </li>
            ) : null}
            <li className="text-[var(--color-text-muted)]">{d.unchangedCount} unchanged</li>
          </ul>
        )}
      </div>

      <Link
        href={`/studies/${studyId}/replications` as Route}
        className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] underline-offset-2 hover:underline"
      >
        View full lineage →
      </Link>
    </section>
  );
}
