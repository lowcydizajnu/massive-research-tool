import Link from "next/link";

import { switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { getServerApi } from "@/server/trpc/server";

/**
 * Your workspaces — `/me/memberships` (personal mode, V1.14 T3 / ADR-0046). The
 * cross-workspace membership list: every workspace you're an active member of and
 * your role in each. Soft-removed memberships are already filtered by
 * `workspace.list`. Opening one switches the active workspace and lands on its
 * dashboard; role changes / leaving happen inside each workspace's Team page.
 */
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function roleChip(role: string) {
  const cls =
    role === "owner"
      ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
      : role === "admin"
        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text-on-subtle)]"
        : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]";
  return (
    <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium ${cls}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

export default async function MembershipsPage() {
  const api = await getServerApi();
  const [workspaces, active] = await Promise.all([api.workspace.list(), api.workspace.active()]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        <div>
          <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            Your workspaces
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Every workspace you belong to and what you can do in each. Open one to work in it; manage members and your
            own membership from that workspace&rsquo;s Team page.
          </p>
        </div>

        {workspaces.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              You&rsquo;re not a member of any workspace yet.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {workspaces.map((w) => {
              const isActive = w.id === active.id;
              return (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
                        {w.name}
                      </span>
                      {isActive ? (
                        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">(current)</span>
                      ) : null}
                    </span>
                    <span className="truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      {w.studyCount} stud{w.studyCount === 1 ? "y" : "ies"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {roleChip(w.role)}
                    {isActive ? (
                      <Link
                        href="/dashboard"
                        className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                      >
                        Open
                      </Link>
                    ) : (
                      <form action={switchWorkspaceAction.bind(null, w.id)}>
                        <button
                          type="submit"
                          className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                        >
                          Open
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
