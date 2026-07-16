import type { PublicPrereg } from "@/server/study/prereg-chain";

/**
 * The public amendment history (ADR-0102 D6, closing ADR-0004 §133's deferral of
 * the lineage-chain display).
 *
 * Renders INSIDE PreregistrationBody rather than as its own composer section, on
 * purpose: ADR-0004 forbids hiding amendment history, and an authored section
 * would hand the owner a reorder/hide toggle over their own audit trail.
 *
 * Server-safe (no client hooks).
 */

/** The author's own labels, mirroring the amend form. Never a second vocabulary. */
const CLASSIFICATION: Record<string, string> = {
  typo: "Typo / wording",
  "methodological-correction": "Methodological correction",
  clarification: "Clarification",
  "scope-change": "Scope change",
  other: "Other",
};

const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export function AmendmentHistory({ plans }: { plans: PublicPrereg[] }) {
  // Nothing to show for a single, never-amended filing — PreregistrationBody
  // already states the version and links the registration.
  if (plans.length < 2) return null;

  return (
    <section aria-labelledby="rec-amendments" className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
      <h3 id="rec-amendments" className="text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
        Amendment history
      </h3>
      <ol className="flex flex-col gap-3">
        {plans.map((p) => (
          <li key={p.versionNumber} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                v{p.versionNumber}
              </span>
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">filed {day(p.filedAt)}</span>
              {p.amendsVersionNumber ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  · amends v{p.amendsVersionNumber}
                </span>
              ) : (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">· original filing</span>
              )}
              {p.withdrawn ? (
                <span className="rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]">
                  Withdrawn
                </span>
              ) : null}
            </div>
            {p.changeSummary ? (
              <p className="whitespace-pre-wrap text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                {p.changeSummary}
              </p>
            ) : null}
            {p.classification ? (
              // Attributed, not laundered: the reason is the author's own label.
              // ADR-0004 flags cherry-picking to obscure scope changes as a known
              // abuse vector — the answer is to say who classified it.
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {CLASSIFICATION[p.classification] ?? p.classification} —{" "}
                <span className="italic">classified by the author</span>
              </p>
            ) : null}
            {p.registrationUrl || p.doi ? (
              <p className="text-[length:var(--text-small)]">
                <a
                  href={p.registrationUrl || `https://doi.org/${p.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-primary)] hover:opacity-90"
                >
                  View v{p.versionNumber} on OSF →
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
