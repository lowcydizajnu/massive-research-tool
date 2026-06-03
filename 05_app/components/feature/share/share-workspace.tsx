"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { StudyDetail } from "@/server/trpc/routers/studies";

import { CommentsPanel } from "./comments-panel";

/**
 * Share stage (share-stage.md) — read-only study + a right-panel Comments tab.
 * Selecting a block scopes the thread to that block (target_type block_instance);
 * no selection = the whole study. Per-block comment markers come from one
 * study-wide comments query.
 */
export function ShareWorkspace({
  study,
  currentUserId,
}: {
  study: StudyDetail;
  currentUserId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: allComments } = api.comments.list.useQuery({ experimentId: study.id });

  const countFor = (targetId: string) =>
    (allComments ?? []).filter((c) => c.targetId === targetId && c.status !== "resolved").length;

  const selected = study.blocks.find((b) => b.instanceId === selectedId) ?? null;

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            {study.title}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Peer review — comment on the study or a block. Select a block to scope the discussion.
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={cn(
              "flex items-center justify-between rounded-[var(--radius-md)] border px-4 py-2 text-left",
              selectedId === null
                ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            <span className="font-medium text-[var(--color-text-primary)]">Whole study</span>
            <Marker n={countFor(study.id)} />
          </button>

          {study.blocks.map((b) => (
            <button
              key={b.instanceId}
              type="button"
              onClick={() => setSelectedId(b.instanceId)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 py-2 text-left",
                selectedId === b.instanceId
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]"
                  : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                  {b.name}
                </span>
                <span className="block truncate font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]">
                  {b.ref}
                </span>
              </span>
              <Marker n={countFor(b.instanceId)} />
            </button>
          ))}
        </section>
      </main>

      <aside className="flex w-[300px] shrink-0 flex-col self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
        <CommentsPanel
          key={selected ? selected.instanceId : "study"}
          studyId={study.id}
          targetType={selected ? "block_instance" : "study"}
          targetId={selected ? selected.instanceId : study.id}
          targetLabel={selected ? `On “${selected.name}”` : "On this study"}
          currentUserId={currentUserId}
        />
      </aside>
    </>
  );
}

function Marker({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="shrink-0 rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
      {n} comment{n === 1 ? "" : "s"}
    </span>
  );
}
