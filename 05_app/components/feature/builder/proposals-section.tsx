"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Propose-changes surfaces in the Replications tab (ADR-0036, PR-lite).
 * Fork side: "Propose changes to the original" + outgoing status list.
 * Target side: "Incoming proposals" list linking to the review page.
 */
const STATUS_CHIP: Record<string, string> = {
  open: "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]",
  accepted: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
  declined: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
  withdrawn: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--text-small)] font-medium ${STATUS_CHIP[status] ?? STATUS_CHIP.withdrawn}`}>
      {status}
    </span>
  );
}

/** Fork side — under the "Replicating" upstream entry. */
export function ProposeChangesSection({ studyId, upstreamTitle }: { studyId: string; upstreamTitle: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const utils = api.useUtils();
  const outgoing = api.proposals.listOutgoing.useQuery({ studyId });
  const propose = api.proposals.propose.useMutation({
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setMessage("");
      void utils.proposals.listOutgoing.invalidate({ studyId });
    },
  });
  const withdraw = api.proposals.withdraw.useMutation({
    onSuccess: () => void utils.proposals.listOutgoing.invalidate({ studyId }),
  });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        ↗ Propose changes to the original
      </button>

      {(outgoing.data ?? []).map((p) => (
        <div key={p.id} className="flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2.5 py-2">
          <span className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-primary)]">
            <span className="truncate font-medium">{p.title}</span>
            <StatusChip status={p.status} />
          </span>
          {p.decisionComment ? (
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Owner: “{p.decisionComment}”
            </span>
          ) : null}
          {p.status === "open" ? (
            <button
              type="button"
              onClick={() => setWithdrawId(p.id)}
              className="self-start text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
            >
              Withdraw
            </button>
          ) : null}
        </div>
      ))}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Propose changes to ${upstreamTitle}`}
            className="flex w-full max-w-[480px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              Propose changes to “{upstreamTitle}”
            </h3>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Your protocol as it is right now is frozen into the proposal — later edits stay yours.
              The author reviews the exact diff and can adopt it into their draft.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Title</span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Message (what + why)</span>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
              />
            </label>
            {propose.isError ? (
              <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
                {propose.error.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Cancel
              </button>
              <PendingButton
                onClick={() => propose.mutate({ studyId, title: title.trim(), message: message.trim() })}
                pending={propose.isPending}
                disabled={!title.trim()}
                idleLabel="Send proposal"
                pendingLabel="Sending…"
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={withdrawId !== null}
        title="Withdraw this proposal?"
        body="It closes quietly — the author won't be asked to review it."
        confirmLabel="Withdraw"
        onConfirm={() => {
          if (withdrawId) withdraw.mutate({ proposalId: withdrawId });
          setWithdrawId(null);
        }}
        onCancel={() => setWithdrawId(null)}
      />
    </div>
  );
}

/** Target side — incoming proposals on the original study. */
export function IncomingProposalsSection({ studyId }: { studyId: string }) {
  const incoming = api.proposals.listIncoming.useQuery({ studyId });
  const items = incoming.data ?? [];
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
      <span className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        Incoming proposals
      </span>
      {items.map((p) => (
        <Link
          key={p.id}
          href={`/studies/${studyId}/proposals/${p.id}` as Route}
          className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] px-1.5 py-1 hover:bg-[var(--color-surface-subtle)]"
        >
          <span className="min-w-0 truncate text-[length:var(--text-small)] text-[var(--color-text-primary)]">
            {p.title} <span className="text-[var(--color-text-muted)]">· {p.proposerName}</span>
          </span>
          <StatusChip status={p.status} />
        </Link>
      ))}
    </section>
  );
}
