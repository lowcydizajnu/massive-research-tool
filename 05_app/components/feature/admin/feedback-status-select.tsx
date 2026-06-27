"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, type FeedbackStatus } from "@/lib/feedback";
import { api } from "@/lib/trpc/react";

/**
 * Triage control for the admin Feedback queue (PF2) — change a feedback item's
 * status inline. Admin-gated server-side via feedback.setStatus (adminProcedure);
 * refreshes the server component on success so the row + active filter re-render.
 */
export function FeedbackStatusSelect({ id, status }: { id: string; status: FeedbackStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<FeedbackStatus>(status);
  const setStatus = api.feedback.setStatus.useMutation({
    onSuccess: () => router.refresh(),
    onError: () => setValue(status), // revert optimistic change on failure
  });

  return (
    <label className="flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      <span className="sr-only">Status</span>
      <select
        value={value}
        disabled={setStatus.isPending}
        onChange={(e) => {
          const next = e.target.value as FeedbackStatus;
          setValue(next);
          setStatus.mutate({ id, status: next });
        }}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[var(--color-text-secondary)] disabled:opacity-60"
      >
        {FEEDBACK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {FEEDBACK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
