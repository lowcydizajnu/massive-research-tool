"use client";

import { useRouter } from "next/navigation";

import { api } from "@/lib/trpc/react";
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
export function ReplicateButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const fork = api.studies.fork.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={fork.isPending}
        onClick={() => fork.mutate({ studyId })}
        className="w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
      >
        {fork.isPending ? "Replicating…" : "Replicate this study"}
      </button>
      {fork.error ? (
        <span role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {fork.error.message}
        </span>
      ) : null}
    </div>
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
}: {
  studyId: string;
  value: "public" | "link-only" | "private";
}) {
  const utils = api.useUtils();
  const set = api.studies.setForkable.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });
  const isPublic = value === "public";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label="Public-replicable"
        disabled={set.isPending}
        onClick={() => set.mutate({ studyId, forkableBy: isPublic ? "private" : "public" })}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          isPublic ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-medium)]",
          set.isPending && "opacity-60",
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
        {isPublic ? "Public-replicable" : "Private"}
      </span>
    </div>
  );
}
