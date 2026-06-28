"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { BlockView } from "@/components/feature/take/block-view";
import { api } from "@/lib/trpc/react";

/**
 * Read-only participant-style preview of a public study's screens (feedback
 * 01KW4PSR). Collapsed by default; lazy-loads the blocks on first open so the
 * record page stays light. Mirrors the template-detail preview (BlockView,
 * pointer-events-none) — it shows what a participant would see, not a live run.
 */
export function StudyScreenPreview({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);
  const q = api.studies.publicStudyBlocks.useQuery({ studyId }, { enabled: open });
  const blocks = q.data?.blocks ?? [];

  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-4 text-[var(--color-text-muted)]" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-[var(--color-text-muted)]" aria-hidden />
        )}
        <span className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">
          Preview the screens
        </span>
      </button>

      {open ? (
        q.isLoading ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading preview…</p>
        ) : q.isError ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Preview isn&rsquo;t available for this study.</p>
        ) : blocks.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">This study has no screens to preview.</p>
        ) : (
          <>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              What a participant sees ({blocks.length} screen{blocks.length === 1 ? "" : "s"}), read-only.
            </p>
            <div aria-hidden className="pointer-events-none flex select-none flex-col gap-3">
              {blocks.map((b) => (
                <div
                  key={b.instanceId}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-page)] p-3"
                >
                  <BlockView block={b as never} namePrefix={`spv_${b.instanceId}__`} seed={`browse-${studyId}`} />
                </div>
              ))}
            </div>
          </>
        )
      ) : null}
    </section>
  );
}
