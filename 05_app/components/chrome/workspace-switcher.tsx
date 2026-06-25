"use client";

import { Check, ChevronDown, Home, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Workspace switcher (ADR-0033) — replaces the old disabled stub. The popover
 * offers "Home" (cross-workspace personal mode) above the caller's workspaces;
 * picking a workspace submits `switchWorkspaceAction` (sets the active-workspace
 * cookie server-side, then redirects). Used in both the personal and workspace
 * top bars. `mode` marks which entry is the current one.
 */
export function WorkspaceSwitcher({
  activeLabel,
  mode,
}: {
  activeLabel: string;
  mode: "personal" | "workspace";
}) {
  const [open, setOpen] = useState(false);
  // Only fetch the list when the popover opens (cheap, and keeps the bar quiet).
  const { data: workspaces, isLoading } = api.workspace.list.useQuery(undefined, { enabled: open });

  // Inline "New workspace" (ADR-0033) — create + switch into it, reachable from
  // anywhere via the switcher (not just the Home widget).
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const create = api.workspace.create.useMutation();
  async function submitCreate() {
    if (!name.trim()) return setCreateErr("Name your workspace.");
    setCreateErr(null);
    try {
      const { id } = await create.mutateAsync({ name: name.trim() });
      await switchWorkspaceAction(id); // sets the active cookie + redirects
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Couldn’t create the workspace.");
    }
  }

  return (
    <div className="relative flex items-center">
      {/* The whole highlighted item (name + caret) opens the switcher. Dashboard
          stays reachable from inside the menu (the current workspace row). */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[220px] items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <span className="truncate" title={activeLabel}>
          {activeLabel}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      </button>

      {open ? (
        <>
          {/* click-outside backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] py-1 shadow-[var(--shadow-md)]"
          >
            <Link
              role="menuitem"
              href="/home"
              onClick={() => setOpen(false)}
              aria-current={mode === "personal" ? "page" : undefined}
              className="flex items-center gap-2 px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
            >
              <Home className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
              <span className="flex-1">Home</span>
              <span className="text-[var(--color-text-muted)]">All workspaces</span>
              {mode === "personal" ? <Check className="size-3.5 text-[var(--color-primary)]" aria-hidden /> : null}
            </Link>

            <div className="my-1 border-t border-[var(--color-border-subtle)]" />

            {isLoading ? (
              <p className="px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
            ) : (workspaces ?? []).length === 0 ? (
              <p className="px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">No workspaces.</p>
            ) : (
              (workspaces ?? []).map((w) => {
                const isCurrent = mode === "workspace" && w.name === activeLabel;
                // The current workspace is just an indicator (you're already in
                // it) — no switch, no dashboard link.
                if (isCurrent) {
                  return (
                    <div
                      key={w.id}
                      role="menuitem"
                      aria-current="page"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-small)] text-[var(--color-text-primary)]"
                    >
                      <span className="min-w-0 flex-1 truncate" title={w.name}>
                        {w.name}
                      </span>
                      <Check className="size-3.5 shrink-0 text-[var(--color-primary)]" aria-hidden />
                    </div>
                  );
                }
                return (
                  <form key={w.id} action={switchWorkspaceAction.bind(null, w.id)}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                    >
                      <span className="min-w-0 flex-1 truncate" title={w.name}>
                        {w.name}
                      </span>
                      <span className="shrink-0 text-[var(--color-text-muted)]">{w.role}</span>
                    </button>
                  </form>
                );
              })
            )}

            <div className="my-1 border-t border-[var(--color-border-subtle)]" />
            {creating ? (
              <div className="flex flex-col gap-1.5 px-3 py-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitCreate();
                    }
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Workspace name"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                />
                <div className="flex items-center gap-1.5">
                  <PendingButton
                    pending={create.isPending}
                    onClick={submitCreate}
                    idleLabel="Create"
                    pendingLabel="Creating…"
                    className="px-2.5 py-1 text-[length:var(--text-small)]"
                  />
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
                  >
                    Cancel
                  </button>
                </div>
                {createErr ? (
                  <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{createErr}</p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                <Plus className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                <span className="flex-1">New workspace</span>
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
