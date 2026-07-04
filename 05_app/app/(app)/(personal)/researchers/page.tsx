import type { Metadata } from "next";

import { ResearcherCard } from "@/components/feature/explore/researcher-card";
import { getServerApi } from "@/server/trpc/server";

/**
 * "Meet Researchers" — a personal-mode directory of opt-in public researchers
 * (owner 2026-07-04, discoverability entry point). Reuses `explore.publicProfiles`
 * (PII-free, EE2/ADR-0077) + the shared `ResearcherCard`. Empty until researchers
 * turn on a public profile.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Researchers" };

export default async function ResearchersPage() {
  const api = await getServerApi();
  const researchers = await api.explore.publicProfiles({ limit: 48 });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Meet researchers
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Public researchers on My Research Lab — follow their work and replicate their studies.
        </p>
      </header>

      {researchers.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {researchers.map((p) => (
            <li key={p.handle}>
              <ResearcherCard profile={p} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-8 text-center">
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
            No public researcher profiles yet.
          </p>
          <p className="mt-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Researchers appear here once they turn on a public profile in Settings → Profile. Turn on
            yours to be discoverable.
          </p>
        </div>
      )}
    </main>
  );
}
