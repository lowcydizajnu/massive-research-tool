"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PendingButton } from "@/components/ui/pending-button";
import { useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";

/**
 * "Manage data" control on the Results stage (ADR-0082 data-lifecycle). Lets a
 * workspace owner/admin hard-delete this study's collected participant responses
 * — the researcher-controlled erasure that backs the public Security & data page.
 * Irreversible, so it's behind a typed-title confirmation modal. The design
 * (versions, blocks, conditions) is kept; only response rows are removed.
 *
 * Visible to owner/admin only; the server independently re-checks (study author
 * or owner/admin) and blocks the mutation during operator support access.
 */
export function ManageData({
  studyId,
  studyTitle,
  totalCompleted,
}: {
  studyId: string;
  studyTitle: string;
  totalCompleted: number;
}) {
  const { role } = useWorkspaceRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const del = api.studies.deleteResponses.useMutation({
    onSuccess: (res) => {
      setOpen(false);
      setTyped("");
      setErr(null);
      // Results is a server component — refetch it to show the emptied state.
      router.refresh();
      // Surface the outcome without a toast lib: a transient inline note.
      setLastDeleted(res.responses);
    },
    onError: (e) => setErr(e.message),
  });
  const [lastDeleted, setLastDeleted] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Owner/admin only — editors who authored the study can still erase via API,
  // but we keep the visible control to the unambiguous case.
  if (role !== "owner" && role !== "admin") return null;

  const matches = typed.trim() === studyTitle.trim();

  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-danger-subtle)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
            Delete collected responses
          </p>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Permanently remove every response (completed, in-progress, and preview) for this study.
            The study design is kept. This cannot be undone — export first if you need the data.
          </p>
          {lastDeleted !== null ? (
            <p role="status" className="mt-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Deleted {lastDeleted} response{lastDeleted === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setLastDeleted(null);
            setOpen(true);
          }}
          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-danger)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-danger-text-on-subtle)] hover:bg-[var(--color-danger)] hover:text-white"
        >
          Delete responses…
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete collected responses"
            className="flex w-full max-w-[460px] flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-6"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
                Delete all responses?
              </h2>
              <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
                This permanently deletes {totalCompleted > 0 ? `${totalCompleted} completed response${totalCompleted === 1 ? "" : "s"} (plus any in-progress and preview)` : "every collected response"} for{" "}
                <span className="font-medium text-[var(--color-text-primary)]">{studyTitle}</span>. The study
                design stays. This cannot be undone.
              </p>
            </div>

            <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Type the study title to confirm:
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={studyTitle}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              />
            </label>

            {err ? (
              <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
                {err}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] px-4 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Cancel
              </button>
              <PendingButton
                onClick={() => del.mutate({ studyId, confirmTitle: typed, mode: "all" })}
                disabled={!matches}
                pending={del.isPending}
                idleLabel="Delete responses"
                pendingLabel="Deleting…"
                className="px-4 py-1.5 text-[length:var(--text-small)]"
                style={{ backgroundColor: "var(--color-danger)", color: "white" }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
