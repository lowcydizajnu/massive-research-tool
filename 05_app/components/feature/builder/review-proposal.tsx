"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Review a proposal (ADR-0036): merge preview · block rows · protocol-text
 * diff (vs the CURRENT working draft) · accept/decline. Decided proposals
 * render read-only as evidence.
 */
const ROW_STYLE: Record<string, string> = {
  added: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
  changed: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  removed: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
  unchanged: "text-[var(--color-text-secondary)]",
};
const ROW_PREFIX: Record<string, string> = { added: "＋", changed: "～", removed: "－", unchanged: "·" };

export function ReviewProposal({ studyId, proposalId }: { studyId: string; proposalId: string }) {
  const utils = api.useUtils();
  const { data, isLoading, isError } = api.proposals.review.useQuery({ proposalId });
  const [view, setView] = useState<"blocks" | "text">("blocks");
  const [comment, setComment] = useState("");
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [declining, setDeclining] = useState(false);
  // Proposal-removed blocks the owner ALSO wants removed (opt-in checkboxes).
  const [applyDeletions, setApplyDeletions] = useState<Set<string>>(new Set());
  const onDecided = () => {
    void utils.proposals.review.invalidate({ proposalId });
    void utils.proposals.listIncoming.invalidate({ studyId });
    void utils.studies.get.invalidate({ id: studyId });
  };
  const accept = api.proposals.accept.useMutation({ onSuccess: onDecided });
  const decline = api.proposals.decline.useMutation({ onSuccess: onDecided });

  if (isLoading) return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading proposal…</p>;
  if (isError || !data) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn’t load this proposal.
      </p>
    );
  }

  const open = data.status === "open";
  const pv = data.mergePreview;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href={`/studies/${studyId}/build` as Route}
          className="self-start text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
        >
          ← Back to Build
        </Link>
        <h1 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
          Proposal: {data.title}
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          from {data.proposerName} · {new Date(data.createdAt).toLocaleDateString()} · {data.status}
          {data.decidedAt ? ` ${new Date(data.decidedAt).toLocaleDateString()}` : ""}
        </p>
        {data.message ? (
          <p className="max-w-prose whitespace-pre-line text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            “{data.message}”
          </p>
        ) : null}
        {data.decisionComment ? (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Decision note: “{data.decisionComment}”
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
        <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          What accepting does
        </h2>
        <ul className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <li>＋ {pv.added} block{pv.added === 1 ? "" : "s"} added to your draft</li>
          <li>～ {pv.updated} block{pv.updated === 1 ? "" : "s"} updated (the proposal’s version wins)</li>
          {pv.deletions.length > 0 ? (
            <li>
              － {pv.deletions.length} block{pv.deletions.length === 1 ? "" : "s"} the proposal removed — tick the ones
              you want removed too ({applyDeletions.size} selected); unticked blocks stay in your draft.
            </li>
          ) : null}
          {pv.added === 0 && pv.updated === 0 && applyDeletions.size === 0 ? (
            <li>Nothing selected to apply — your draft already matches.</li>
          ) : null}
        </ul>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Changes land in your editable draft only — you still review, save, and preregister on your own terms.
        </p>
      </section>

      <div className="flex items-center gap-1" role="tablist" aria-label="Diff view">
        {(["blocks", "text"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-small)] font-medium",
              view === v
                ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            {v === "blocks" ? "Blocks" : "Protocol text"}
          </button>
        ))}
        <span className="pl-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          vs your current draft
        </span>
      </div>

      {view === "blocks" ? (
        <ul className="flex max-w-[560px] flex-col gap-1">
          {data.blockRows.map((r) => (
            <li
              key={`${r.instanceId}-${r.status}`}
              className={cn("rounded-[var(--radius-md)] px-2.5 py-1.5 text-[length:var(--text-body)]", ROW_STYLE[r.status])}
            >
              {r.status === "removed" && open ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applyDeletions.has(r.instanceId)}
                    onChange={() =>
                      setApplyDeletions((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.instanceId)) next.delete(r.instanceId);
                        else next.add(r.instanceId);
                        return next;
                      })
                    }
                    className="size-4 accent-[var(--color-danger)]"
                  />
                  <span aria-hidden className={cn(!applyDeletions.has(r.instanceId) && "line-through-none")}>
                    － <span className={applyDeletions.has(r.instanceId) ? "line-through" : "no-underline"}>{r.name}</span>
                  </span>
                  <span className="text-[length:var(--text-small)]">
                    {applyDeletions.has(r.instanceId) ? "will be removed" : "stays in your draft"}
                  </span>
                </label>
              ) : (
                <>
                  <span aria-hidden className="pr-1.5">{ROW_PREFIX[r.status]}</span>
                  <span className="sr-only">{r.status}: </span>
                  {r.name}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <pre className="max-h-[480px] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-3 font-mono text-[length:var(--text-mono)] leading-relaxed">
          {data.textDiff.map((l, i) => (
            <div
              key={i}
              className={cn(
                l.type === "added" && "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
                l.type === "removed" && "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
                l.type === "same" && "text-[var(--color-text-secondary)]",
              )}
            >
              {l.type === "added" ? "+ " : l.type === "removed" ? "− " : "  "}
              {l.text}
            </div>
          ))}
        </pre>
      )}

      {open ? (
        <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4">
          <label className="flex max-w-[560px] flex-col gap-1">
            <span className="text-[length:var(--text-small)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Comment to the proposer {declining ? "(required to decline)" : "(optional)"}
            </span>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)]"
            />
          </label>
          {(accept.isError || decline.isError) ? (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
              {accept.error?.message ?? decline.error?.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <PendingButton
              onClick={() => setConfirmAccept(true)}
              pending={accept.isPending}
              idleLabel="Accept into my draft"
              pendingLabel="Merging…"
            />
            <PendingButton
              variant="secondary"
              onClick={() => {
                setDeclining(true);
                if (comment.trim()) decline.mutate({ proposalId, comment: comment.trim() });
              }}
              pending={decline.isPending}
              idleLabel="Decline"
              pendingLabel="Declining…"
            />
          </div>
          {declining && !comment.trim() ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
              Add a short comment first — the proposer deserves a why.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-[var(--color-border-subtle)] pt-4 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          This proposal was {data.status}
          {data.decidedAt ? ` on ${new Date(data.decidedAt).toLocaleDateString()}` : ""} — shown read-only as a record.
        </p>
      )}

      <ConfirmDialog
        open={confirmAccept}
        title="Accept into your draft?"
        body={`${pv.added} added · ${pv.updated} updated · ${applyDeletions.size} of ${pv.deletions.length} deletion(s) applied. Your draft stays editable — nothing is frozen or published by accepting.`}
        confirmLabel="Accept & merge"
        onConfirm={() => {
          setConfirmAccept(false);
          accept.mutate({ proposalId, comment: comment.trim(), applyDeletions: [...applyDeletions] });
        }}
        onCancel={() => setConfirmAccept(false)}
      />
    </div>
  );
}
