"use client";

import { useRouter } from "next/navigation";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Replicate a public study into the caller's workspace (ADR-0018) and land in
 * the new fork's Builder. V1 has one workspace per user, so there's no
 * destination picker yet (deferred until a multi-workspace list exists).
 */
export function ReplicateButton({ studyId, className }: { studyId: string; className?: string }) {
  const router = useRouter();
  const fork = api.studies.fork.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <PendingButton
        pending={fork.isPending}
        idleLabel="Replicate"
        pendingLabel="Replicating…"
        onClick={() => fork.mutate({ studyId })}
        className={className}
      />
      {fork.isError ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t replicate — this study may no longer be public.
        </p>
      ) : null}
    </div>
  );
}
