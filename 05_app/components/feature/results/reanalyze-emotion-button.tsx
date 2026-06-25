"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";

/**
 * "Re-run emotion analysis" (ADR-0066 H3a amendment). Re-queues a study's
 * not-yet-analyzed emotion items (stuck `pending`/`failed`) so a transient vendor
 * error or a pre-fix timeout can be cleared without resubmitting responses.
 * Write-member gated; analysis runs in the background, so we refresh the RSC after
 * a moment rather than blocking on it.
 */
export function ReanalyzeEmotionButton({ studyId, stuck }: { studyId: string; stuck: number }) {
  const { canWrite } = useWorkspaceRole();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const reanalyze = api.studies.reanalyzeEmotion.useMutation({
    onSuccess: (r) => {
      setMsg(
        r.requeued > 0
          ? `Re-queued ${r.requeued} response${r.requeued === 1 ? "" : "s"} — analysis runs in the background; refresh in a moment.`
          : "Nothing to re-run.",
      );
      router.refresh();
    },
    onError: (e) => setMsg(e.message),
  });
  if (!canWrite || stuck === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PendingButton
        variant="secondary"
        pending={reanalyze.isPending}
        idleLabel={`Re-run emotion analysis (${stuck})`}
        pendingLabel="Re-queuing…"
        onClick={() => reanalyze.mutate({ studyId })}
        className="px-3 py-1.5 text-[length:var(--text-small)]"
      />
      {msg ? <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{msg}</span> : null}
    </div>
  );
}
