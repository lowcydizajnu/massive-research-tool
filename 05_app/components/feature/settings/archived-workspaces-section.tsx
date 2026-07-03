"use client";

import { api } from "@/lib/trpc/react";

/**
 * "Archived workspaces" restore list on `/settings/account` (ADR-0090). Personal
 * scope, so it's reachable even when the caller has zero active workspaces (they
 * archived them all). Renders nothing when there's nothing archived. Restoring
 * clears `archived_at` and the workspace re-appears in the switcher.
 */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

export function ArchivedWorkspacesSection() {
  const utils = api.useUtils();
  const archived = api.workspace.listArchived.useQuery();
  const restore = api.workspace.unarchive.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.workspace.listArchived.invalidate(), utils.workspace.list.invalidate()]);
    },
  });

  const rows = archived.data ?? [];
  if (rows.length === 0) return null; // nothing archived → section absent (wireframe Empty state)

  return (
    <section className="mt-2 flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
        Archived workspaces
      </h2>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Hidden from your switcher. Nothing in them is deleted — restore any of them anytime.
      </p>
      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {rows.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
          >
            <div className="min-w-0">
              <div
                className="truncate text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
                title={w.name}
              >
                {w.name}
              </div>
              <div className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Archived {formatDate(w.archivedAt)} · {w.studyCount} stud{w.studyCount === 1 ? "y" : "ies"}
              </div>
            </div>
            <button
              type="button"
              disabled={restore.isPending}
              aria-label={`Restore ${w.name}`}
              onClick={() => restore.mutate({ workspaceId: w.id })}
              className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
      {restore.error ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {restore.error.message}
        </p>
      ) : null}
    </section>
  );
}
