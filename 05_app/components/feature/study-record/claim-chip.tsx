import { claimLabel, type ClaimBinding } from "@/lib/study-record/sections";
import type { PublicPrereg } from "@/server/study/prereg-chain";

/**
 * The Preregistered / Exploratory chip (ADR-0102) + its referent.
 *
 * The label is DERIVED, never stored and never typed: "Preregistered" means this
 * claim is bound to a hypothesis in a frozen preregistered version, which is a
 * checkable fact. Unbound (or downgraded) reads "Exploratory" — the honest
 * default, not a penalty.
 *
 * The referent line is not decoration. A bare "Preregistered" chip is just a
 * self-report with better styling; naming *which* frozen hypothesis, in *which*
 * filing, is the whole reason the word is trustworthy. Never render the chip
 * without it.
 *
 * Server-safe (no client hooks). Reuses the `hypothesis-chips` treatment rather
 * than introducing a visual decision — the design language is locked at v0.6.
 */
export function ClaimChip({ claim, plans }: { claim?: ClaimBinding; plans: PublicPrereg[] }) {
  // A study with no preregistration has nothing to bind to — every claim is
  // exploratory by definition, and chipping them all adds noise, not honesty.
  if (!plans.length) return null;

  // Resolve the referent from the chain. This IS the check: a binding only earns
  // the word if it names a real hypothesis in a real frozen filing of this study.
  const filed = claim ? plans.find((p) => p.versionId === claim.planVersionId) : undefined;
  const text = claim && filed ? filed.hypotheses[claim.hypothesisIndex - 1] : undefined;
  const prereg = claimLabel(claim, !!text) === "preregistered";

  return (
    <div className="flex flex-col gap-1">
      <span
        className={
          "inline-flex w-fit items-baseline rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium " +
          (prereg
            ? "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
            : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]")
        }
      >
        {prereg ? "Preregistered" : "Exploratory"}
      </span>
      {prereg && filed && text ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Tests <span className="text-[var(--color-text-secondary)]">H{claim!.hypothesisIndex}</span> of the
          preregistration filed {filed.filedAt.slice(0, 10)} (v{filed.versionNumber}):{" "}
          <span className="italic text-[var(--color-text-secondary)]">&ldquo;{text}&rdquo;</span>
        </p>
      ) : null}
      {claim && !text && !claim.exploratoryOverride ? (
        // A stored binding that no longer resolves. Degrade to Exploratory rather
        // than throw or claim: we cannot evidence it, so we must not assert it.
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          This claim referenced a preregistered hypothesis that can no longer be resolved.
        </p>
      ) : null}
    </div>
  );
}
