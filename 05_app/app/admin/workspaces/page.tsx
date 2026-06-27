import type { Metadata } from "next";

import { getServerApi } from "@/server/trpc/server";

export const metadata: Metadata = { title: "Workspaces — Admin" };

/**
 * Cross-workspace census (Analytics + Admin handoff, AA2.4; ADR-0075). Auth is
 * enforced by app/admin/layout.tsx.
 */
export default async function AdminWorkspacesPage() {
  const api = await getServerApi();
  const rows = await api.admin.workspaces();
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Workspaces
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Every workspace ({rows.length}), newest first.
        </p>
      </header>

      <table className="w-full border-collapse text-[length:var(--text-body)]">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] text-left text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="py-2 pr-4 font-medium">Workspace</th>
            <th className="py-2 pr-4 font-medium">Members</th>
            <th className="py-2 pr-4 font-medium">Studies</th>
            <th className="py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} className="border-b border-[var(--color-border-subtle)]">
              <td className="py-2 pr-4">
                <span className="text-[var(--color-text-primary)]">{w.name}</span>
                {w.archivedAt ? (
                  <span className="ml-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">(archived)</span>
                ) : null}
                <span className="block text-[length:var(--text-small)] text-[var(--color-text-muted)]">{w.slug}</span>
              </td>
              <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{w.memberCount}</td>
              <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{w.studyCount}</td>
              <td className="py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">{fmt(w.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
