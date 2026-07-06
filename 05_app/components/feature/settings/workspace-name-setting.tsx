"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "Workspace name" control on the Workspace Settings page (`/settings/workspace`).
 * The active-workspace counterpart to the per-workspace Rename in the Account →
 * Workspaces list (WorkspacesSection): same `workspace.rename` mutation (ADR-0092
 * — name-only, slug stays stable so links/bookmarks keep working), surfaced where
 * users actually go to change *this* workspace. Owner/admin only; everyone else
 * sees the name read-only. Self-fetches the active workspace + viewer role via the
 * cached `workspace.active` query, matching the other controls on this page.
 */
export function WorkspaceNameSetting() {
  const utils = api.useUtils();
  const active = api.workspace.active.useQuery();
  const name = active.data?.name ?? "";
  const role = active.data?.role;
  const canRename = role === "owner" || role === "admin";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const rename = api.workspace.rename.useMutation({
    onSuccess: async () => {
      setEditing(false);
      // Refresh the chrome (top bar, switcher) and the Account list too.
      await Promise.all([utils.workspace.active.invalidate(), utils.workspace.list.invalidate()]);
    },
  });

  function startEdit() {
    setDraft(name);
    setEditing(true);
  }

  function save() {
    const next = draft.trim();
    if (!next || next === name) return setEditing(false);
    if (!active.data) return;
    rename.mutate({ workspaceId: active.data.id, name: next });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Workspace name
        </h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          The display name for this workspace, shown in the top bar and the workspace switcher. Renaming
          keeps every existing link working.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") {
                  setDraft(name);
                  setEditing(false);
                }
              }}
              aria-label="Workspace name"
              className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          ) : (
            <div
              className="truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
              title={name}
            >
              {active.isLoading ? "…" : name}
            </div>
          )}
          {rename.error ? (
            <p role="alert" className="mt-1 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
              {rename.error.message}
            </p>
          ) : null}
        </div>

        {canRename ? (
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <PendingButton
                  pending={rename.isPending}
                  onClick={save}
                  idleLabel="Save"
                  pendingLabel="Saving…"
                  className="px-3 py-1.5 text-[length:var(--text-small)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setDraft(name);
                    setEditing(false);
                  }}
                  className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                disabled={active.isLoading}
                className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                Rename
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
