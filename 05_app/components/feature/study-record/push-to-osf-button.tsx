"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "Push update to OSF" (ADR-0056 E4b) — pushes the Record summary to the study's
 * OSF *project node* (a non-plan update, NOT an amendment, E4a). Self-contained:
 * fetches the record to know whether an OSF project exists, to itemize EXACTLY
 * what will be pushed, and to tell "up to date" from "changes to push" (item 2).
 * Shown on both the composer and the Preregister tab.
 */
export function PushToOsfButton({ studyId, className }: { studyId: string; className?: string }) {
  const rec = api.studyRecord.getForEdit.useQuery({ studyId });
  const utils = api.useUtils();
  const push = api.studyRecord.pushToOsf.useMutation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Only relevant once the study has an OSF project (i.e. a preregistration was pushed).
  if (!rec.data?.osfNodeId) return null;

  const d = rec.data;
  const items = d.osfSummaryItems;
  const nothingToPush = items.length === 0;
  const upToDate = d.osfUpToDate;
  const recordPublic = d.visibility === "public";

  const label = nothingToPush
    ? "Nothing to push to OSF"
    : upToDate
      ? "OSF up to date"
      : "Push update to OSF";

  const baseBtn =
    className ??
    "w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]";

  const confirmPush = async () => {
    setNote(null);
    try {
      await push.mutateAsync({ studyId });
      await utils.studyRecord.getForEdit.invalidate({ studyId });
      setOpen(false);
      setNote("Pushed the record summary to your OSF project.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "OSF push failed.");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={nothingToPush}
        onClick={() => { setNote(null); setOpen(true); }}
        className={baseBtn + (nothingToPush ? " opacity-60" : "")}
      >
        {label}
      </button>
      {d.osfPushedAt ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {upToDate ? "Up to date — last pushed " : "Last pushed "}
          {relativeTime(d.osfPushedAt)}.
        </p>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Not pushed to OSF yet.</p>
      )}
      {note ? <p role="status" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{note}</p> : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !push.isPending) setOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Push update to OSF"
            className="flex w-full max-w-[520px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 text-left"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              {upToDate ? "Push again to OSF?" : "Push this to OSF?"}
            </h3>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              This updates your OSF <strong className="font-medium text-[var(--color-text-secondary)]">project</strong> description with the items below. It does <strong className="font-medium text-[var(--color-text-secondary)]">not</strong> change your preregistration and does <strong className="font-medium text-[var(--color-text-secondary)]">not</strong> push any draft plan changes.
            </p>

            <div className="flex flex-col gap-2">
              <p className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
                Will push {items.length} item{items.length === 1 ? "" : "s"}:
              </p>
              <ul className="flex max-h-60 flex-col gap-2 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-3">
                {items.map((i) => (
                  <li key={i.label} className="flex flex-col gap-0.5">
                    <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]">{i.label}</span>
                    <span className="whitespace-pre-wrap break-words text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{i.value}</span>
                  </li>
                ))}
              </ul>
              {!recordPublic ? (
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  Your record isn&rsquo;t public yet, so the public record link isn&rsquo;t included (it would 404). Publish the record to include a working link.
                </p>
              ) : null}
              {upToDate ? (
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  OSF already has this exact content — pushing again will re-send it unchanged.
                </p>
              ) : null}
            </div>

            {note ? <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{note}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button type="button" disabled={push.isPending} onClick={() => setOpen(false)} className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <PendingButton pending={push.isPending} idleLabel={upToDate ? "Push again" : "Push to OSF"} pendingLabel="Pushing…" onClick={confirmPush} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Coarse relative time for the "last pushed" caption (client-only). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
