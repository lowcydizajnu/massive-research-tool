"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import { FollowButton } from "@/components/feature/follow/follow-button";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { BrowseStudyCard } from "@/server/trpc/routers/studies";

/**
 * One card in the Browse-public-studies grid (browse-public-studies.md). Title
 * links to the read-only public Details; author byline carries +Follow; tag
 * chips add to the active filter; Replicate forks the public study into the
 * caller's workspace (ADR-0018) and lands them in the new fork's Builder.
 */
export function BrowseCard({
  card,
  onAddTag,
}: {
  card: BrowseStudyCard;
  onAddTag?: (tag: string) => void;
}) {
  const router = useRouter();
  const fork = api.studies.fork.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  // Replicate is for FINISHED studies (ADR-0054); otherwise offer Template
  // (borrow the design). Server enforces the same rule on fork.
  const template = api.studies.useAsTemplate.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  const finished = !!card.finishedAt;

  const marker =
    card.latestKind === "preregistered"
      ? `Preregistration v${card.latestVersionNumber}`
      : `Published v${card.latestVersionNumber}`;
  const reps =
    card.replicationCount > 0
      ? ` · ${card.replicationCount} replication${card.replicationCount === 1 ? "" : "s"}`
      : "";

  return (
    <article
      aria-label={card.title}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <Link
        href={`/browse/${card.studyId}` as Route}
        className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)] hover:opacity-90"
      >
        {card.title}
      </Link>

      <div className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <span className="truncate">by {card.authorName || "Unknown"}</span>
        <FollowButton targetType="author" targetId={card.authorId} name={card.authorName} />
      </div>

      {card.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {card.tags.slice(0, 4).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onAddTag?.(t)}
              className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-subtle)]"
              aria-label={`Filter by tag ${t}`}
            >
              #{t}
            </button>
          ))}
          {card.tags.length > 4 ? (
            <span className="px-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              +{card.tags.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {marker}
          {reps}
        </span>
        {finished ? (
          <PendingButton
            pending={fork.isPending}
            idleLabel="Replicate"
            pendingLabel="Replicating…"
            onClick={() => fork.mutate({ studyId: card.studyId })}
            className={cn("px-3 py-1.5 text-[length:var(--text-small)]")}
          />
        ) : (
          <PendingButton
            variant="secondary"
            pending={template.isPending}
            idleLabel="Use as template"
            pendingLabel="Copying…"
            onClick={() => template.mutate({ studyId: card.studyId })}
            title="Not finished yet — start from its design (no replication lineage)"
            className={cn("px-3 py-1.5 text-[length:var(--text-small)]")}
          />
        )}
      </div>

      {fork.isError || template.isError ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {(fork.error ?? template.error)?.message ?? "This study is no longer available."}
        </p>
      ) : null}
    </article>
  );
}
