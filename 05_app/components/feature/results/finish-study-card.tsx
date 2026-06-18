"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { READ_ONLY_TITLE, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";

/**
 * "Mark study as finished" CTA on the Results stage (ADR-0054). Finishing
 * requires recruitment closed + >=1 completed response; it gates Replicate and
 * (next) creates the Study Record. Reversible (reopen). Write-member gated.
 */
export function FinishStudyCard({ studyId }: { studyId: string }) {
  const { canWrite } = useWorkspaceRole();
  const utils = api.useUtils();
  const [err, setErr] = useState<string | null>(null);
  const state = api.studies.finishedState.useQuery({ studyId });
  const setFinished = api.studies.setFinished.useMutation({
    onSuccess: () => {
      setErr(null);
      void utils.studies.finishedState.invalidate({ studyId });
    },
    onError: (e) => setErr(e.message),
  });

  if (!state.data) return null;
  const { finishedAt, completedResponses, hasOpenRecruitment } = state.data;
  const blockedReason = hasOpenRecruitment
    ? "Stop recruitment first."
    : completedResponses === 0
      ? "Collect at least one completed response first."
      : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          {finishedAt ? "Finished" : "Mark this study as finished"}
        </p>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {finishedAt
            ? `Marked finished on ${new Date(finishedAt).toLocaleDateString()}. Its Study Record is shareable and others can replicate it.`
            : "When data collection is done, finishing publishes a citable record and lets others replicate the finding."}
        </p>
        {err ? <p role="alert" className="mt-1 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{err}</p> : null}
      </div>
      {finishedAt ? (
        <div className="flex items-center gap-2">
          <Link
            href={`/studies/${studyId}/record` as Route}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[length:var(--text-small)] font-medium text-white hover:opacity-90"
          >
            Compose record →
          </Link>
          <PendingButton
            variant="secondary"
            onClick={() => setFinished.mutate({ studyId, finished: false })}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
            pending={setFinished.isPending}
            idleLabel="Reopen"
            pendingLabel="Reopening…"
            className="px-4 py-1.5 text-[length:var(--text-small)]"
          />
        </div>
      ) : (
        <PendingButton
          onClick={() => setFinished.mutate({ studyId, finished: true })}
          disabled={!canWrite || !!blockedReason}
          title={!canWrite ? READ_ONLY_TITLE : (blockedReason ?? undefined)}
          pending={setFinished.isPending}
          idleLabel="Mark as finished"
          pendingLabel="Finishing…"
          className="px-4 py-1.5 text-[length:var(--text-small)]"
        />
      )}
    </div>
  );
}
