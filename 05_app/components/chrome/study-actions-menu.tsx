"use client";

import { MoreHorizontal, Archive, ArchiveRestore, FileDown, Table, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * ⋯ per-study actions in the focused top bar (focused-study-mode.md): exports,
 * Archive ↔ Unarchive (reversible), and hard Delete (ADR-0037 + ADR-0083
 * data-lifecycle). Delete is typed-title-confirmed, warns about external
 * replications, opts in to deleting derived templates, and erases participant
 * files from R2 — all via `studies.deleteStudy`. Mirrors the UserMenu popover.
 */
export function StudyActionsMenu({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false); // archive dialog
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [alsoTemplates, setAlsoTemplates] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const utils = api.useUtils();
  const study = api.studies.get.useQuery({ id: studyId });
  const archived = !!study.data?.archivedAt;
  const title = study.data?.title ?? "";

  // Counts for the confirm dialog (only while it's open).
  const preflight = api.studies.deleteStudyPreflight.useQuery({ studyId }, { enabled: confirmingDelete });

  const archive = api.studies.archive.useMutation({ onSuccess: () => router.push("/studies") });
  const unarchive = api.studies.unarchive.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });
  const del = api.studies.deleteStudy.useMutation({
    onSuccess: () => router.push("/studies"),
    onError: (e) => setDelErr(e.message),
  });

  useEffect(() => {
    if (!open && !confirmingDelete) return;
    const onDown = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmingDelete) setConfirmingDelete(false);
      else setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, confirmingDelete]);

  const itemCls =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]";

  const templates = preflight.data?.templates ?? 0;
  const replications = preflight.data?.externalReplications ?? 0;
  const responses = preflight.data?.responses ?? 0;
  const titleMatches = typed.trim() === title.trim() && title.length > 0;
  const canDelete = titleMatches && (templates === 0 || alsoTemplates);

  function openDelete() {
    setOpen(false);
    setTyped("");
    setAlsoTemplates(false);
    setDelErr(null);
    setConfirmingDelete(true);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Study actions"
        className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Study actions"
          className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-1"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <Link href={`/studies/${studyId}/export-pdf` as Route} role="menuitem" target="_blank" className={itemCls} onClick={() => setOpen(false)}>
            <FileDown className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            Export summary (PDF)
          </Link>
          <Link href={`/studies/${studyId}/results/export` as Route} role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
            <Table className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            Export data
          </Link>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" aria-hidden />
          {archived ? (
            <button type="button" role="menuitem" className={itemCls} onClick={() => { setOpen(false); unarchive.mutate({ studyId }); }}>
              <ArchiveRestore className="size-4 text-[var(--color-text-muted)]" aria-hidden />
              Unarchive study
            </button>
          ) : (
            <button type="button" role="menuitem" className={itemCls} onClick={() => { setOpen(false); setConfirming(true); }}>
              <Archive className="size-4 text-[var(--color-text-muted)]" aria-hidden />
              Archive study
            </button>
          )}
          <button type="button" role="menuitem" className={`${itemCls} text-[var(--color-danger-text-on-subtle)]`} onClick={openDelete}>
            <Trash2 className="size-4" aria-hidden />
            Delete study…
          </button>
        </div>
      ) : null}

      {confirmingDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmingDelete(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete study"
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-6"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <h2 className="font-serif text-[length:var(--text-heading-1)] font-medium text-[var(--color-text-primary)]">
              Permanently delete this study?
            </h2>
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              Everything goes with it: all versions, preregistration records,
              {responses > 0 ? ` ${responses} collected response${responses === 1 ? "" : "s"} (and participant files),` : " collected responses,"}{" "}
              and comments. This cannot be undone — if you might need it later,{" "}
              <span className="font-medium text-[var(--color-text-primary)]">Archive</span> instead.
            </p>

            {replications > 0 ? (
              <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                {replications} replication{replications === 1 ? "" : "s"} in other workspaces will keep their own data; they’ll just lose the “replicated from this study” link.
              </p>
            ) : null}

            {templates > 0 ? (
              <label className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                <input type="checkbox" checked={alsoTemplates} onChange={(e) => setAlsoTemplates(e.target.checked)} className="mt-0.5" />
                Also delete {templates} saved template{templates === 1 ? "" : "s"} derived from this study (required to continue).
              </label>
            ) : null}

            <label className="flex flex-col gap-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Type the study title to confirm:
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={title}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              />
            </label>

            {delErr ? (
              <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{delErr}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-[var(--radius-md)] px-4 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Cancel
              </button>
              <PendingButton
                onClick={() => {
                  setDelErr(null);
                  del.mutate({ studyId, confirmTitle: typed, deleteTemplates: alsoTemplates });
                }}
                disabled={!canDelete}
                pending={del.isPending}
                idleLabel="Delete forever"
                pendingLabel="Deleting…"
                className="px-4 py-1.5 text-[length:var(--text-small)]"
                style={{ backgroundColor: "var(--color-danger)", color: "white" }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Archive this study?"
        body="It moves to the Archived filter on Studies — nothing is deleted, and you can still open it from there."
        confirmLabel={archive.isPending ? "Archiving…" : "Archive"}
        onConfirm={() => {
          if (!archive.isPending) archive.mutate({ studyId });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
