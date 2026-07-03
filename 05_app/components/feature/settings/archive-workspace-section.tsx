"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/trpc/react";

/**
 * "Archive this workspace" — the owner-only lifecycle control on `/settings/workspace`
 * (ADR-0090). Reversible soft-hide: nothing is deleted, restore lives in Account
 * settings. Hidden entirely for non-owners. Blocked (with a named, actionable hint)
 * while a study is still recruiting. On success, a full navigation to /home lets the
 * shell re-resolve the active workspace (this one is now archived).
 */
export function ArchiveWorkspaceSection() {
  const active = api.workspace.active.useQuery();
  const blockers = api.workspace.archiveBlockers.useQuery();
  const [confirming, setConfirming] = useState(false);
  const archive = api.workspace.archive.useMutation({
    onSuccess: () => {
      window.location.assign("/home");
    },
  });

  // Owner-only card — non-owners use study-level archive instead.
  if (active.data && active.data.role !== "owner") return null;

  const recruiting = blockers.data?.recruitingStudies ?? [];
  const blocked = recruiting.length > 0;
  const name = active.data?.name ?? "this workspace";

  return (
    <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-4">
      <h3 className="mb-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
        Archive this workspace
      </h3>
      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Hides this workspace and everything in it from everyone. Nothing is deleted — you can
          restore it anytime from{" "}
          <Link
            href={"/settings/account" as Route}
            className="text-[var(--color-primary)] hover:opacity-90"
          >
            Account settings
          </Link>
          .
        </p>

        {blocked ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
            Stop recruitment before archiving — still recruiting:{" "}
            <span className="font-medium">{recruiting.map((s) => s.title).join(", ")}</span>.{" "}
            <Link href={"/studies?tab=running" as Route} className="font-medium underline">
              Go to running studies
            </Link>
          </p>
        ) : null}

        <div>
          <button
            type="button"
            disabled={blocked || archive.isPending || active.isLoading}
            aria-describedby={blocked ? "archive-blocked-hint" : undefined}
            onClick={() => setConfirming(true)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
          >
            {archive.isPending ? "Archiving…" : "Archive workspace"}
          </button>
        </div>

        {archive.error ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            {archive.error.message}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Archive "${name}"?`}
        body="It'll be hidden from everyone in the workspace. Nothing is deleted — restore it anytime from Account settings."
        confirmLabel="Archive workspace"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirming(false);
          archive.mutate();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
