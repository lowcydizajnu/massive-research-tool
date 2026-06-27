import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnnouncementForm } from "@/components/feature/admin/announcement-form";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { isAdminExternalId } from "@/server/admin/is-admin";
import { getServerApi } from "@/server/trpc/server";

export const metadata: Metadata = { title: "Announcements — Admin" };

/**
 * Owner-only announcement authoring (platform-foundation PF4). Gated by the
 * ADMIN_USER_IDS allow-list until the full Admin destination (Analytics + Admin
 * handoff) lands. Non-admins get a 404.
 */
export default async function AdminAnnouncementsPage() {
  const dbUser = await getCurrentDbUser();
  if (!dbUser || !isAdminExternalId(dbUser.externalId)) notFound();

  const api = await getServerApi();
  const rows = await api.announcements.list({ limit: 50 });
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-4">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Announcements
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Publish a &ldquo;what&rsquo;s new&rdquo; update. It appears in every researcher&rsquo;s ✨ panel. Owner-only.
        </p>
      </header>

      <AnnouncementForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
          Published ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">Nothing published yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2"
              >
                <span className="font-medium text-[var(--color-text-primary)]">{a.title}</span>
                <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {fmt(a.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
