"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";

/**
 * "Re-run emotion analysis" (ADR-0066 H3a amendment). Re-queues a study's
 * not-yet-analyzed emotion items (stuck `pending`/`failed`). Analysis is an async
 * Hume batch job (usually under ~2 min), so after re-queuing we **auto-refresh**
 * the page on an interval for a couple of minutes — the researcher doesn't have to
 * guess when to reload, and can navigate away (it runs server-side). Write-gated.
 */
export function ReanalyzeEmotionButton({ studyId, stuck }: { studyId: string; stuck: number }) {
  const { canWrite } = useWorkspaceRole();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const ticksRef = useRef(0);

  // While polling, refresh the RSC every 8s for ~2 min (15 ticks), then stop.
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => {
      ticksRef.current += 1;
      router.refresh();
      if (ticksRef.current >= 15) setPolling(false);
    }, 8000);
    return () => clearInterval(id);
  }, [polling, router]);

  const reanalyze = api.studies.reanalyzeEmotion.useMutation({
    onSuccess: (r) => {
      if (r.requeued > 0) {
        setMsg(`Re-queued ${r.requeued} response${r.requeued === 1 ? "" : "s"}. Analysis runs in the background (usually under 2 min) — this page refreshes itself; you can leave and come back.`);
        ticksRef.current = 0;
        setPolling(true);
      } else {
        setMsg("Nothing to re-run.");
      }
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
