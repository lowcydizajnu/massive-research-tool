import Link from "next/link";
import type { Route } from "next";

/**
 * Explore content island (EE1, ADR-0076; explore-destination.md). One component
 * rendered in BOTH shells — the authed `(workspace)/explore` page and (EE1.3)
 * the public `(public)/explore` route — via the `isPublic` flag, which hides
 * workspace-scoped affordances on the public surface.
 *
 * EE1.1 is the scaffold: the four bands (curated scenarios, featured starter
 * templates, community studies, opt-in researcher showcase) render as the
 * floating-card layout the wireframe specifies, with placeholder bodies.
 * EE1.2 fills the scenarios band from Markdown; EE1.3 wires the dynamic bands
 * to the public `explore.*` queries and the public route.
 */
const BAND =
  "flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6";
const BAND_TITLE =
  "font-serif text-[length:var(--text-title)] font-medium text-[var(--color-text-primary)]";
const PLACEHOLDER =
  "rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6 text-[length:var(--text-small)] text-[var(--color-text-muted)]";

export function ExploreContent({ isPublic = false }: { isPublic?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header band */}
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Explore
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          See what you can run, then make it yours.
        </p>
      </header>

      {/* Band 1 — curated use-case scenarios (EE1.2 fills from Markdown) */}
      <section aria-labelledby="explore-scenarios" className={BAND}>
        <h2 id="explore-scenarios" className={BAND_TITLE}>
          Start with a use case
        </h2>
        <p className={PLACEHOLDER}>Curated starting points are on the way.</p>
      </section>

      {/* Band 2 — featured starter templates (EE1.3 dynamic) */}
      <section aria-labelledby="explore-templates" className={BAND}>
        <h2 id="explore-templates" className={BAND_TITLE}>
          Featured starter templates
        </h2>
        <p className={PLACEHOLDER}>Featured templates will appear here.</p>
      </section>

      {/* Band 3 — community studies (EE1.3 dynamic) */}
      <section aria-labelledby="explore-community" className={BAND}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="explore-community" className={BAND_TITLE}>
            From the community
          </h2>
          {!isPublic ? (
            <Link
              href={"/browse" as Route}
              className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
            >
              Browse all →
            </Link>
          ) : null}
        </div>
        <p className={PLACEHOLDER}>Recent public studies will appear here.</p>
      </section>

      {/* Band 4 — opt-in researcher showcase (EE2): rendered only when profiles
          exist, so it's intentionally omitted from the scaffold (no empty state). */}
    </div>
  );
}
