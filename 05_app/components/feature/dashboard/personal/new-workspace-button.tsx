"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * "New workspace" affordance for the Home Workspaces widget (ADR-0033). Creates a
 * workspace owned by the caller via workspace.create, then switches into it (the
 * server action sets the active-workspace cookie and lands on /dashboard).
 */
export function NewWorkspaceButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = api.workspace.create.useMutation();

  async function submit() {
    if (!name.trim()) return setError("Name your workspace.");
    setError(null);
    try {
      const { id } = await create.mutateAsync({ name: name.trim() });
      // Server action sets the active-workspace cookie and redirects to /dashboard.
      await switchWorkspaceAction(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t create the workspace.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <Plus className="size-3.5" aria-hidden /> New workspace
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Workspace name"
          className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
        />
        <PendingButton
          pending={create.isPending}
          onClick={submit}
          idleLabel="Create"
          pendingLabel="Creating…"
          className="px-3 py-1.5 text-[length:var(--text-small)]"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{error}</p>
      )}
    </div>
  );
}
