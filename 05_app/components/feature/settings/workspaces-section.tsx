"use client";

import { unstable_rethrow } from "next/navigation";
import { useState } from "react";

import { switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { NewWorkspaceButton } from "@/components/feature/dashboard/personal/new-workspace-button";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "Your workspaces" list on the Account → Workspaces tab. Lists the caller's
 * active workspaces (workspace.list), each with an Open (switch) action, an
 * inline Rename for owners/admins (workspace.rename, ADR-0092), and a role +
 * study-count line. A New-workspace affordance sits below. The archived list
 * (ArchivedWorkspacesSection) renders separately beneath this in the tab.
 */
export function WorkspacesSection() {
  const utils = api.useUtils();
  const list = api.workspace.list.useQuery();
  const rows = list.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
          Your workspaces
        </h2>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Open a workspace, or rename one you own. Archived workspaces are listed below.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          You have no active workspaces.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((w) => (
            <WorkspaceRow
              key={w.id}
              id={w.id}
              name={w.name}
              role={w.role}
              studyCount={w.studyCount}
              onRenamed={() => utils.workspace.list.invalidate()}
            />
          ))}
        </ul>
      )}

      <NewWorkspaceButton />
    </section>
  );
}

function WorkspaceRow({
  id,
  name,
  role,
  studyCount,
  onRenamed,
}: {
  id: string;
  name: string;
  role: string;
  studyCount: number;
  onRenamed: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const canRename = role === "owner" || role === "admin";
  const rename = api.workspace.rename.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await onRenamed();
    },
  });

  async function open() {
    try {
      // Server action sets the active-workspace cookie and redirects to /dashboard.
      await switchWorkspaceAction(id);
    } catch (e) {
      unstable_rethrow(e);
    }
  }

  function save() {
    const next = draft.trim();
    if (!next || next === name) return setEditing(false);
    rename.mutate({ workspaceId: id, name: next });
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
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
            aria-label={`Rename ${name}`}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
          />
        ) : (
          <div
            className="truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
            title={name}
          >
            {name}
          </div>
        )}
        <div className="text-[length:var(--text-small)] capitalize text-[var(--color-text-muted)]">
          {role} · {studyCount} stud{studyCount === 1 ? "y" : "ies"}
        </div>
        {rename.error ? (
          <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
            {rename.error.message}
          </p>
        ) : null}
      </div>
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
          <>
            {canRename ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Rename
              </button>
            ) : null}
            <button
              type="button"
              onClick={open}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Open
            </button>
          </>
        )}
      </div>
    </li>
  );
}
