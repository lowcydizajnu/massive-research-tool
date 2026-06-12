"use client";

import { MoreHorizontal, Archive, ArchiveRestore, FileDown, Table, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/trpc/react";

/**
 * ⋯ per-study actions in the focused top bar (focused-study-mode.md): exports,
 * Archive ↔ Unarchive (reversible), and hard Delete (ADR-0037, danger-confirmed).
 * Duplicate arrives with the Wave 6 bulk-operations slice. Mirrors the UserMenu
 * popover pattern (ESC / outside click closes).
 */
export function StudyActionsMenu({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const utils = api.useUtils();
  const study = api.studies.get.useQuery({ id: studyId });
  const archived = !!study.data?.archivedAt;
  const archive = api.studies.archive.useMutation({
    onSuccess: () => router.push("/studies"),
  });
  const unarchive = api.studies.unarchive.useMutation({
    onSuccess: () => void utils.studies.get.invalidate({ id: studyId }),
  });
  const del = api.studies.delete.useMutation({
    onSuccess: () => router.push("/studies"),
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]";

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
          <Link
            href={`/studies/${studyId}/export-pdf` as Route}
            role="menuitem"
            target="_blank"
            className={itemCls}
            onClick={() => setOpen(false)}
          >
            <FileDown className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            Export summary (PDF)
          </Link>
          <Link
            href={`/studies/${studyId}/results/export` as Route}
            role="menuitem"
            className={itemCls}
            onClick={() => setOpen(false)}
          >
            <Table className="size-4 text-[var(--color-text-muted)]" aria-hidden />
            Export data
          </Link>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" aria-hidden />
          {archived ? (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => {
                setOpen(false);
                unarchive.mutate({ studyId });
              }}
            >
              <ArchiveRestore className="size-4 text-[var(--color-text-muted)]" aria-hidden />
              Unarchive study
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            >
              <Archive className="size-4 text-[var(--color-text-muted)]" aria-hidden />
              Archive study
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={`${itemCls} text-[var(--color-danger-text-on-subtle)]`}
            onClick={() => {
              setOpen(false);
              setConfirmingDelete(true);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete study…
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingDelete}
        title="Permanently delete this study?"
        body="Everything goes with it: all versions, preregistration records, collected responses, and comments. This cannot be undone — if you might need it later, Archive instead. Replications others made survive as their own studies."
        confirmLabel={del.isPending ? "Deleting…" : "Delete forever"}
        tone="danger"
        onConfirm={() => {
          if (!del.isPending) del.mutate({ studyId });
        }}
        onCancel={() => setConfirmingDelete(false)}
      />

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
