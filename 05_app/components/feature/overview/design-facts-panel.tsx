"use client";

import { api } from "@/lib/trpc/react";

/**
 * "From your design" — item ⑨ Phase A (ADR-0106, wireframe overview-stage).
 *
 * Read-only, recomputed every render, never stored. It states what the built
 * study IS; the researcher says what it MEANS. That split is the whole feature:
 * OSF cannot read your design, and we cannot read your intent.
 *
 * Every line here is a fact off the snapshot. Nothing claims randomization (we
 * don't do it), a construct (no module declares one), or a variable's role
 * (intent). See `server/modules/design-facts.ts` for the full never-list.
 */
export function DesignFactsPanel({
  studyId,
  declaredInstanceIds,
  onUseVariable,
}: {
  studyId: string;
  /** Blocks already claimed by a variable **in the editor right now** — not just
   *  in the last save. The server computes candidates from the saved overview,
   *  so without this a just-added variable keeps offering "Use this" and the
   *  second click is a silent no-op that reads as a broken button. */
  declaredInstanceIds: string[];
  onUseVariable: (v: { instanceId: string; name: string }) => void;
}) {
  const q = api.studies.getDesignFacts.useQuery({ studyId });

  // Hidden for viewers (the writeProcedure errors for them), same as Materials.
  if (q.error || q.isLoading || !q.data) return null;
  const claimed = new Set(declaredInstanceIds);
  const d = { ...q.data, candidateVariables: q.data.candidateVariables.filter((c) => !claimed.has(c.instanceId)) };

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

          <Fact label="Measures">
            {d.measures.length === 0 ? (
              "No blocks collect a response yet."
            ) : (
              <ul className="flex flex-col gap-1">
                {d.measures.map((m) => (
                  <li key={m.instanceId} className="flex flex-col">
                    <span>
                      {m.prompt ?? m.name}
                      {/* A block with no prompt of its own falls back to the
                          module name, and its response type IS that name — so
                          don't render "Social post · Social post". */}
                      {m.responseType === (m.prompt ?? m.name) ? null : (
                        <span className="text-[var(--color-text-muted)]"> · {m.responseType}</span>
                      )}
                    </span>
                    {/* The arm's own name — never "the treatment condition",
                        which nothing in the design declares. */}
                    {m.shownOnlyTo.length > 0 ? (
                      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                        shown only to: {m.shownOnlyTo.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
        </dl>
      )}

      {/* Candidates, not decisions. "Use this" sets the block link and the data
          type; the ROLE stays empty because a role is intent (ADR-0106 D1). */}
      {d.candidateVariables.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]">
            Measures not yet listed as variables
          </span>
          <ul className="flex flex-col gap-1">
            {d.candidateVariables.map((c) => (
              <li key={c.instanceId} className="flex flex-wrap items-center gap-2">
                {/* The QUESTION, not the module name — three Likerts all read
                    "Likert (7-point)" and picking blind is not a choice. */}
                <span className="flex-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  {c.prompt ?? c.name}
                  {c.dataType === (c.prompt ?? c.name) ? null : (
                    <span className="text-[var(--color-text-muted)]"> · {c.dataType}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onUseVariable({ instanceId: c.instanceId, name: c.name })}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  Use this
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Adds it to Variables with the block linked. You choose what it is.
          </p>
        </div>
      ) : null}
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
