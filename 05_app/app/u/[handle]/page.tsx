import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { ProfileFollow } from "@/components/feature/profile/profile-follow";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { getServerApi } from "@/server/trpc/server";

/**
 * Public researcher profile — `/u/<handle>` (EE2, ADR-0077; public-profile-page.md).
 * Fully public (no auth; outside the (app) shell). Resolves only when the
 * researcher opted in; otherwise 404 (never "private" — don't leak existence).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const api = await getServerApi();
  const p = await api.profile.publicByHandle({ handle }).catch(() => null);
  return p ? { title: `${p.displayName} — Massive Research Lab` } : { title: "Not found" };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : (name.slice(0, 2) || "··");
  return s.toUpperCase();
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const api = await getServerApi();
  const profile = await api.profile.publicByHandle({ handle }).catch(() => null);
  if (!profile) notFound();

  const viewer = await getCurrentDbUser();
  const isSelf = viewer?.id === profile.id;

  return (
    <main className="min-h-screen bg-[var(--color-surface-page)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Identity header */}
        <header className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-primary-subtle)] text-[length:var(--text-title)] font-medium text-[var(--color-primary-text-on-subtle)]">
              {profile.publicAvatarR2Key || profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.publicAvatarR2Key ? `/api/media/${profile.publicAvatarR2Key}` : (profile.avatarUrl as string)}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                initials(profile.displayName)
              )}
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
                {profile.displayName}
              </h1>
              {profile.affiliation ? (
                <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{profile.affiliation}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-3 text-[length:var(--text-small)]">
                {profile.orcid ? (
                  <a href={`https://orcid.org/${profile.orcid}`} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">ORCID</a>
                ) : null}
                {profile.websiteUrl ? (
                  <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">Website</a>
                ) : null}
                {profile.scholarUrl ? (
                  <a href={profile.scholarUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">Scholar</a>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            {!viewer ? (
              <Link href={"/signup" as Route} className="inline-flex rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90">
                Sign up to follow
              </Link>
            ) : isSelf ? (
              <Link href={"/settings/account?tab=profile" as Route} className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
                Edit profile
              </Link>
            ) : (
              <ProfileFollow targetId={profile.id} name={profile.displayName} />
            )}
          </div>
        </header>

        {profile.bio ? (
          <p className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            {profile.bio}
          </p>
        ) : null}

        {profile.researchAreas.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {profile.researchAreas.map((a) => (
              <span key={a} className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{a}</span>
            ))}
          </div>
        ) : null}

        {/* Published articles (feedback 01KW5CKK) — researcher-linked external work. */}
        {profile.articles.length > 0 ? (
          <section aria-labelledby="pp-articles" className="flex flex-col gap-3">
            <h2 id="pp-articles" className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">Publications</h2>
            <ul className="flex flex-col gap-2">
              {profile.articles.map((a, i) => (
                <li key={`${a.url}-${i}`}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[length:var(--text-body)] text-[var(--color-primary)] hover:underline"
                  >
                    {a.title} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Public studies */}
        <section aria-labelledby="pp-studies" className="flex flex-col gap-3">
          <h2 id="pp-studies" className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">Public studies</h2>
          {profile.studies.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No public studies yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {profile.studies.map((s) => (
                <li key={s.id}>
                  <Link href={`/browse/${s.id}` as Route} className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4 hover:opacity-90">
                    <span className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{s.title}</span>
                    {s.replicationCount > 0 ? (
                      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{s.replicationCount} {s.replicationCount === 1 ? "replication" : "replications"}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Public templates */}
        {profile.templates.length > 0 ? (
          <section aria-labelledby="pp-templates" className="flex flex-col gap-3">
            <h2 id="pp-templates" className="font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]">Templates</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {profile.templates.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
                  <span className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{t.name}</span>
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Used {t.useCount} {t.useCount === 1 ? "time" : "times"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
