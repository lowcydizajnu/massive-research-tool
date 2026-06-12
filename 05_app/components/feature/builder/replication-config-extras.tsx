"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Configure-panel extras for a DIVERGED block in a replication (ADR-0039):
 * Show-original (the pinned source's config, read-only) + the per-block
 * "why does this differ?" rationale, saved on blur.
 */
export function ReplicationConfigExtras({
  studyId,
  instanceId,
  status,
  note,
}: {
  studyId: string;
  instanceId: string;
  status: "modified" | "added";
  note: string | null;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const utils = api.useUtils();
  const original = api.studies.upstreamBlock.useQuery(
    { studyId, instanceId },
    { enabled: showOriginal && status === "modified" },
  );
  const save = api.studies.setBlockDivergenceNote.useMutation({
    onSuccess: () => {
      void utils.studies.get.invalidate({ id: studyId });
      void utils.studies.preflight.invalidate();
      void utils.studies.replicationStatus.invalidate({ studyId });
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning-subtle)] bg-[var(--color-warning-subtle)]/30 p-3">
      <span className="text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]">
        {status === "added" ? "＋ Not in the original study" : "～ Differs from the original"}
      </span>

      {status === "modified" ? (
        <>
          <button
            type="button"
            aria-expanded={showOriginal}
            onClick={() => setShowOriginal((v) => !v)}
            className="self-start text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:underline"
          >
            {showOriginal ? "Hide original ▴" : "Show original ▾"}
          </button>
          {showOriginal ? (
            <div className="flex flex-col gap-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-canvas)] p-2.5">
              {original.isLoading ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</span>
              ) : !original.data ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Original unavailable (the source study may have been deleted).
                </span>
              ) : (
                Object.entries(original.data.config)
                  .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
                  .map(([k, v]) => (
                    <span key={k} className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                      <span className="font-medium text-[var(--color-text-muted)]">{k}: </span>
                      {String(v)}
                    </span>
                  ))
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Why does this differ from the original?
        </span>
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save.mutate({ studyId, instanceId, note: draft })}
          maxLength={1000}
          placeholder="One sentence is enough — reviewers judge unjustified differences, not differences."
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]" aria-live="polite">
          {save.isPending ? "Saving…" : "Saves automatically · compiled into your Overview's differences section."}
        </span>
      </label>
    </div>
  );
}
