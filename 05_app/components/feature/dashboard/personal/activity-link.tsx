"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { openActivityAction } from "@/app/actions/switch-workspace";
import { api } from "@/lib/trpc/react";

/**
 * "All activity" link for the Home feeds. When the user is in more than one
 * workspace, clicking opens a small picker (Activity is workspace-scoped, so we
 * must choose which one); picking switches into it and lands on its Activity.
 * With a single workspace it's a plain link.
 */
export function ActivityLink() {
  const [open, setOpen] = useState(false);
  const workspaces = api.workspace.list.useQuery();
  const list = workspaces.data ?? [];

  if (list.length <= 1) {
    return (
      <Link
        href="/activity"
        className="mt-1 inline-flex w-fit items-center gap-1 text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
      >
        All activity <ArrowRight className="size-3" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="relative mt-1 w-fit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
      >
        All activity <ArrowRight className="size-3" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute left-0 z-40 mt-1 min-w-[12rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] shadow-[var(--shadow-md)]"
          >
            <p className="px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Activity in…
            </p>
            {list.map((w) => (
              <form key={w.id} action={openActivityAction.bind(null, w.id)}>
                <button
                  type="submit"
                  role="menuitem"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  <span className="truncate">{w.name}</span>
                  <ArrowRight className="size-3 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                </button>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
