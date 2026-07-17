"use client";

import type { DesignFacts } from "@/server/modules/design-facts";

/**
 * "From your design" — item ⑨ Phase A (ADR-0106, wireframe overview-stage).
 *
 * Read-only, recomputed every render, never stored. It states what the built
 * study IS; the researcher says what it MEANS. That split is the whole feature:
 * OSF cannot read your design, and we cannot read your intent.
 *
 * **Each measure appears ONCE and carries its own action.** A first cut listed
 * Measures and then "Measures not yet listed as variables" right below — the
 * same rows, twice, under two names (owner, 2026-07-16). A measure is a fact
 * and lives here; a declaration is intent and lives in Variables. So the row
 * offers "Declare variable" when undeclared, and states its role when declared
 * — never both, never a second list.
 *
 * Nothing claims randomization (we don't do it), a construct (no module declares
 * one), or a role (intent) — see `design-facts.ts` for the full never-list.
 */
export function DesignFactsPanel({
  facts,
  declaredRoles,
  onDeclare,
}: {
  facts: DesignFacts | undefined;
  /** instanceId → the role it is declared as, for measures already in Variables. */
  declaredRoles: Record<string, string>;
  onDeclare: (m: { instanceId: string; name: string }) => void;
}) {
  // Hidden for viewers (the writeProcedure errors for them), same as Materials.
  if (!facts) return null;
  const d = facts;

  return (
    <section
      aria-labelledby="design-facts-title"
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h3
          id="design-facts-title"
          className="font-[family-name:var(--font-plex-serif)] text-[length:var(--text-h4)] text-[var(--color-text-primary)]"
        >
          From your design
        </h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Read from the study you built. We don&rsquo;t guess what it means — that part&rsquo;s yours.
        </p>
      </div>

      {d.blockCount === 0 ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Build your study and its design appears here.
        </p>
      ) : (
        <dl className="flex flex-col gap-2">
          <Fact label="Order">
            {d.blockCount} {d.blockCount === 1 ? "screen" : "screens"}, in the order you built them.
          </Fact>

          <Fact label="Arms">
            {d.arms.length === 0 ? (
              "One group (no conditions)."
            ) : (
              <ul className="flex flex-col">
                {d.arms.map((a) => (
                  <li key={a.name}>
                    {a.name} <span className="text-[var(--color-text-muted)]">· weight {a.weight}</span>
                  </li>
                ))}
              </ul>
            )}
          </Fact>

          {d.timings.length > 0 ? (
            <Fact label="Timing">
              <ul className="flex flex-col">
                {d.timings.map((t, i) => (
                  <li key={i}>
                    {t.name}: <span className="font-mono">{t.value}</span>
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}

          {d.measures.length > 0 ? (
            <Fact label="Measures">
              <ul className="flex flex-col gap-1.5">
                {d.measures.map((m) => {
                  const role = declaredRoles[m.instanceId];
                  return (
                    <li key={m.instanceId} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="flex-1">
                        {m.prompt ?? m.name}
                        {/* A block with no prompt falls back to its module name,
                            and its response type IS that name — say it once. */}
                        {m.responseType === (m.prompt ?? m.name) ? null : (
                          <span className="text-[var(--color-text-muted)]"> · {m.responseType}</span>
                        )}
                        {m.shownOnlyTo.length > 0 ? (
                          <span className="block text-[var(--color-text-muted)]">
                            shown only to: {m.shownOnlyTo.join(", ")}
                          </span>
                        ) : null}
                      </span>
                      {/* One row, one action. Declared → say what it is; the
                          button would be the duplication we just removed. */}
                      {role ? (
                        <span className="whitespace-nowrap text-[var(--color-text-muted)]">Declared: {role}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDeclare({ instanceId: m.instanceId, name: m.prompt ?? m.name })}
                          className="whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                        >
                          Declare variable
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Fact>
          ) : null}
        </dl>
      )}

    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-[length:var(--text-small)]">
      <dt className="min-w-20 font-medium text-[var(--color-text-primary)]">{label}</dt>
      <dd className="flex-1 text-[var(--color-text-secondary)]">{children}</dd>
    </div>
  );
}
