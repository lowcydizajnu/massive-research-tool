"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "Push update to OSF" (ADR-0056 E4b) — pushes the Record summary to the study's
 * OSF *project node* (a non-plan update, NOT an amendment, E4a). Self-contained:
 * fetches the record to know whether an OSF project exists + to preview exactly
 * what will be pushed. Shown on both the composer and the Preregister tab. The
 * confirm modal makes "summary only, not your draft plan" explicit at the click.
 */
export function PushToOsfButton({ studyId, className }: { studyId: string; className?: string }) {
  const rec = api.studyRecord.getForEdit.useQuery({ studyId });
  const push = api.studyRecord.pushToOsf.useMutation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Only relevant once the study has an OSF project (i.e. a preregistration was pushed).
  if (!rec.data?.osfNodeId) return null;

  const d = rec.data;
  const recordUrl = typeof window !== "undefined" ? `${window.location.origin}/browse/${studyId}` : `/browse/${studyId}`;
  const lines: string[] = [];
  if (d.abstract?.trim()) lines.push(d.abstract.trim());
  if (d.articleDoi?.trim()) lines.push(`Article DOI: https://doi.org/${d.articleDoi.trim()}`);
  else if (d.articleUrl?.trim()) lines.push(`Article: ${d.articleUrl.trim()}`);
  lines.push(`Full study record: ${recordUrl}`);
  const summary = lines.join("\n\n");

  const confirmPush = async () => {
    setNote(null);
    try {
      await push.mutateAsync({ studyId });
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
        onClick={() => { setNote(null); setOpen(true); }}
        className={className ?? "w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"}
      >
        Push update to OSF
      </button>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Pushes the record summary only — not your draft plan changes. (To register plan changes, file an amendment.)
      </p>
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
            <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Push this to OSF?</h3>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              This updates your OSF <strong className="font-medium text-[var(--color-text-secondary)]">project</strong> description with the summary below. It does <strong className="font-medium text-[var(--color-text-secondary)]">not</strong> change your preregistration and does <strong className="font-medium text-[var(--color-text-secondary)]">not</strong> push any draft plan changes.
            </p>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-3 text-[length:var(--text-small)] text-[var(--color-text-primary)]">{summary}</pre>
            {note ? <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{note}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button type="button" disabled={push.isPending} onClick={() => setOpen(false)} className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">Cancel</button>
              <PendingButton pending={push.isPending} idleLabel="Push to OSF" pendingLabel="Pushing…" onClick={confirmPush} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
