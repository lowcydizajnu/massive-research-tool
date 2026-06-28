import { LayoutTemplate } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { ExploreScenarioCard } from "@/components/feature/explore/explore-scenario-card";
import { UseTemplateButton } from "@/components/feature/library/use-template-button";
import { getExploreScenarios } from "@/content/explore/scenarios";

/**
 * Explore content island (EE1, ADR-0076; explore-destination.md). One component
 * rendered in BOTH shells — the authed `(workspace)/explore` page and (EE1.3b)
 * the public `(public)/explore` route — via `isPublic`, which hides
 * workspace-scoped affordances. The dynamic data is fetched by the page and
 * passed in, so the island stays presentational + shell-agnostic.
 *
 * EE1.3 wired the curated scenarios (EE1.2) + the dynamic featured-templates and
 * community-studies bands. Empty dynamic bands collapse (no empty shells); the
 * researcher showcase awaits opt-in profiles (EE2).
 */
export type FeaturedTemplate = {
  id: string;
  name: string;
  description: string | null;
  coverImageR2Key: string | null;
  useCount: number;
};
export type CommunityStudy = {
  id: string;
  title: string;
  tags: string[] | null;
  authorName: string | null;
  replicationCount: number;
};
export type ShowcaseProfile = { handle: string; displayName: string };

const BAND =
  "flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6";
const BAND_TITLE =
  "font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]";
const CARD =
  "flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)]";
const COVER =
  "flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-[var(--color-primary-subtle)] to-[var(--color-surface-subtle)]";

export function ExploreContent({
  isPublic = false,
  featuredTemplates = [],
  communityStudies = [],
  showcaseProfiles = [],
}: {
  isPublic?: boolean;
  featuredTemplates?: FeaturedTemplate[];
  communityStudies?: CommunityStudy[];
  showcaseProfiles?: ShowcaseProfile[];
}) {
  const scenarios = getExploreScenarios();
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Explore
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          See what you can run, then make it yours.
        </p>
      </header>

      {/* Band 1 — curated use-case scenarios (EE1.2) */}
      <section aria-labelledby="explore-scenarios" className={BAND}>
        <h2 id="explore-scenarios" className={BAND_TITLE}>
          Start with a use case
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {scenarios.map((s) => (
            <li key={s.slug}>
              <ExploreScenarioCard scenario={s} isPublic={isPublic} />
            </li>
          ))}
        </ul>
      </section>

      {/* Band 2 — featured starter templates (collapses when none) */}
      {featuredTemplates.length > 0 ? (
        <section aria-labelledby="explore-templates" className={BAND}>
          <h2 id="explore-templates" className={BAND_TITLE}>
            Featured starter templates
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredTemplates.map((t) => (
              <li key={t.id}>
                <article className={CARD}>
                  <div aria-hidden className={COVER}>
                    <LayoutTemplate className="size-10 text-[var(--color-primary)]" />
                  </div>
                  <div className="flex flex-col gap-2 p-4">
                    <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                      {t.name}
                    </h3>
                    {t.description ? (
                      <p className="line-clamp-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                        {t.description}
                      </p>
                    ) : null}
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      Used {t.useCount} {t.useCount === 1 ? "time" : "times"}
                    </span>
                    <div className="mt-1">
                      {isPublic ? (
                        <Link
                          href={"/signup" as Route}
                          className="inline-flex items-center self-start rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
                        >
                          Use template
                        </Link>
                      ) : (
                        <UseTemplateButton templateId={t.id} />
                      )}
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Band 3 — community studies (collapses when none) */}
      {communityStudies.length > 0 ? (
        <section aria-labelledby="explore-community" className={BAND}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="explore-community" className={BAND_TITLE}>
              From the community
            </h2>
            <Link
              href={(isPublic ? "/signup" : "/browse") as Route}
              className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
            >
              Browse all →
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {communityStudies.map((s) => (
              <li key={s.id}>
                <Link
                  href={(isPublic ? "/signup" : `/browse/${s.id}`) as Route}
                  className={`${CARD} p-4 transition-opacity hover:opacity-90`}
                >
                  <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                    {s.title}
                  </h3>
                  <span className="mt-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {s.authorName ?? "Unknown researcher"}
                    {s.replicationCount > 0
                      ? ` · ${s.replicationCount} ${s.replicationCount === 1 ? "replication" : "replications"}`
                      : ""}
                  </span>
                  {s.tags && s.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Band 4 — opt-in researcher showcase (EE2): only when profiles exist. */}
      {showcaseProfiles.length > 0 ? (
        <section aria-labelledby="explore-researchers" className={BAND}>
          <h2 id="explore-researchers" className={BAND_TITLE}>
            Researchers to follow
          </h2>
          <ul className="flex flex-wrap gap-2">
            {showcaseProfiles.map((p) => (
              <li key={p.handle}>
                <Link
                  href={`/u/${p.handle}` as Route}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:opacity-90"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]">
                    {(p.displayName.trim()[0] ?? "·").toUpperCase()}
                  </span>
                  {p.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
