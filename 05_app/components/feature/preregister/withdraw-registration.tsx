"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Withdraw (retract) the pushed OSF registration (ADR-0005 am. 3). Destructive +
 * irreversible, so it's tucked behind a collapsed "Withdraw registration" affordance
 * that expands to a warning + a REQUIRED justification before the request fires.
 * OSF keeps a public tombstone (title, contributors, justification) and finalizes
 * only after the registration's contributors approve — surfaced in the success copy.
 */
export function WithdrawRegistration({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const withdraw = api.studies.withdrawRegistration.useMutation({
    onSuccess: () => {
      setErr(null);
      setDone(true);
      setOpen(false);
    },
    onError: (e) => setErr(e.message),
  });

  if (done) {
    return (
      <div className="border-t border-[var(--color-border-subtle)] pt-3">
        <p
          role="status"
          className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]"
        >
          Withdrawal requested on OSF. Approve it on OSF (the contributors get an email) to finalize — the
          registration then shows a public withdrawal tombstone.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-fit text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] underline hover:text-[var(--color-danger-text-on-subtle)]"
        >
          Withdraw registration…
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-danger-subtle)] bg-[var(--color-danger-subtle)]/30 p-3">
          <p className="max-w-prose text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Withdrawing retracts this registration on OSF. It can&rsquo;t be undone — OSF keeps a public
            tombstone (title, contributors, and your justification), and finalizes once the registration&rsquo;s
            contributors approve.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
              Justification (shown on the public tombstone)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you withdrawing this registration?"
              className="w-full max-w-prose rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            />
          </label>
          <div className="flex items-center gap-3">
            <PendingButton
              onClick={() => withdraw.mutate({ studyId, reason })}
              disabled={!reason.trim()}
              pending={withdraw.isPending}
              idleLabel="Request withdrawal"
              pendingLabel="Requesting…"
              className="w-fit bg-[var(--color-danger)] px-4 py-1.5 hover:opacity-90"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
            >
              Cancel
            </button>
          </div>
          {err ? (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
              {err}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
