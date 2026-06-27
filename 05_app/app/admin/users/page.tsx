import type { Metadata } from "next";

import { getServerApi } from "@/server/trpc/server";

export const metadata: Metadata = { title: "Users — Admin" };

/**
 * User census (Analytics + Admin handoff, AA2.5; ADR-0075). Auth is enforced by
 * app/admin/layout.tsx.
 */
export default async function AdminUsersPage() {
  const api = await getServerApi();
  const rows = await api.admin.users();
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Users
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Every researcher ({rows.length}), newest first.
        </p>
      </header>

      <table className="w-full border-collapse text-[length:var(--text-body)]">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] text-left text-[length:var(--text-small)] uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Role</th>
            <th className="py-2 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-[var(--color-border-subtle)]">
              <td className="py-2 pr-4 text-[var(--color-text-primary)]">{u.displayName || "—"}</td>
              <td className="py-2 pr-4 text-[var(--color-text-secondary)]">{u.email}</td>
              <td className="py-2 pr-4">
                {u.isAdmin ? (
                  <span className="rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]">
                    Admin
                  </span>
                ) : (
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Researcher</span>
                )}
              </td>
              <td className="py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">{fmt(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
