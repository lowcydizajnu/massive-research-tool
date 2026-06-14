"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { ReplicateButton as BrowseReplicateButton } from "@/components/feature/browse/replicate-button";
import { api } from "@/lib/trpc/react";
import { IncomingProposalsSection, ProposeChangesSection } from "./proposals-section";
import { cn } from "@/lib/utils";
import type { BlockDiff } from "@/server/modules/blocks";

/**
 * Replications tab body (replications-tab.md, ADR-0018) — a study's parent (if
 * it's a fork) + its children, each with a block-divergence summary. A child's
 * diff is null (withheld) when the caller can't see its protocol.
 */
export function ReplicationsPanel({ studyId }: { studyId: string }) {
  const { data, isLoading, isError } = api.studies.getReplications.useQuery({ studyId });

  if (isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn’t load replications.
      </p>
    );
  }
  const { parent, children } = data;
  if (!parent && children.length === 0) {
    return (
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        No replications yet. When someone replicates this study, it shows up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={`/studies/${studyId}/replications` as Route}
        className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] underline-offset-2 hover:underline"
      >
        View full lineage →
      </Link>
      <IncomingProposalsSection studyId={studyId} />
      {parent ? (
        <section className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
          <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
            Replicating
          </span>
          <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
            {parent.title}
            {parent.authorName ? ` · ${parent.authorName}` : ""}
          </span>
          <Divergence diff={parent.diff} />
          {parent.diff ? (
            <Link
              href={`/studies/${studyId}/build/whiteboard/compare?vs=origin` as Route}
              className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
            >
              Compare side by side →
            </Link>
          ) : null}
          <ProposeChangesSection studyId={studyId} upstreamTitle={parent.title} />
        </section>
      ) : null}

      <h3 className="font-serif text-[15px] font-medium text-[var(--color-text-primary)]">
        Replications · {children.length}
      </h3>
      <ul className="flex flex-col gap-2">
        {children.map((c) => (
          <li
            key={c.studyId}
            className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
          >
            <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
              {c.title}
              {c.authorName ? ` · ${c.authorName}` : ""}
            </span>
            <Divergence diff={c.diff} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Divergence({ diff }: { diff: BlockDiff | null }) {
  if (!diff) {
    return (
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Private replication — divergence hidden
      </span>
    );
  }
  const parts: string[] = [];
  if (diff.added.length) parts.push(`+${diff.added.length} added`);
  if (diff.removed.length) parts.push(`−${diff.removed.length} removed`);
  if (diff.changed.length) parts.push(`~${diff.changed.length} changed`);
  parts.push(`=${diff.unchangedCount} unchanged`);
  return (
    <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
      {parts.join(" · ")}
    </span>
  );
}

/** Replicate this study → fork into the caller's workspace, route to the fork. */
/** Delegates to the dialog-equipped browse button (ADR-0039 intent dialog). */
export function ReplicateButton({ studyId }: { studyId: string }) {
  return (
    <BrowseReplicateButton studyId={studyId} className="px-3 py-1.5 text-[length:var(--text-small)]" />
  );
}

/**
 * Private ↔ Public-replicable, as a real labelled on/off switch (owner-workspace;
 * ADR-0002/0018). The switch *looks* like a toggle (track + sliding knob) and the
 * adjacent text states the current value — so flipping is expected, not a
 * surprise (the old single-pill control read like a status you happened to
 * click). On = public-replicable.
 */
export function ForkableControl({
  studyId,
  value,
  frozen = true,
}: {
  studyId: string;
  value: "public" | "link-only" | "private";
  /** Has a frozen (preregistered/published) version? Replication needs one
   *  (ADR-0018 am.) — can't turn a draft public. */
  frozen?: boolean;
}) {
  const utils = api.useUtils();
  const set = api.studies.setForkable.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });
  const isPublic = value === "public";
  // Can't turn replication ON until frozen; turning OFF is always allowed.
  const lockedOff = !frozen && !isPublic;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label="Public-replicable"
        disabled={set.isPending || lockedOff}
        title={lockedOff ? "Preregister or publish this study before opening it for replication." : undefined}
        onClick={() => set.mutate({ studyId, forkableBy: isPublic ? "private" : "public" })}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          isPublic ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-medium)]",
          (set.isPending || lockedOff) && "opacity-60",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 transform rounded-full bg-white shadow-sm transition-transform",
            isPublic ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        {isPublic ? "Public-replicable" : lockedOff ? "Private — freeze a version to share" : "Private"}
      </span>
    </div>
  );
}
