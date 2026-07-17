"use client";

import Link from "next/link";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import type { LinkedOutputSlot, LinkedOutputsGate } from "@/server/trpc/routers/study-record";

/**
 * "Linked outputs" (ADR-0103/0104/0105, items ⑦/⑧) — make a study's outputs
 * citable from its OSF registration. Sits below the Materials panel in both
 * owner-only places; never public (the query is a writeProcedure, and the badges
 * live on OSF's registration, which is already public).
 *
 * Says "Linked output", never "resource" (OSF's word, ambiguous) and never
 * "artifact" (OSF's model name) — design-rules Vocabulary.
 */

/** Researcher-facing labels. The wire values (`analytic_code`) never reach the screen. */
const LABEL: Record<string, string> = {
  papers: "Paper",
  data: "Data",
  analytic_code: "Analysis code",
  materials: "Materials",
  supplements: "Supplements",
};

/** Why this DOI is here — read from the stored provenance, never guessed. A
 *  reader must be able to tell whether WE claimed it or the researcher did. */
const SOURCE_LINE: Record<string, string> = {
  minted: "Minted for your OSF project",
  article_doi: "From the article DOI on your record",
  external: "Added by you",
};

/** Keep in step with `GATE_MESSAGE` in the studyRecord router — the panel and the
 *  mutation must give the same reason, since a stale gate routes the researcher
 *  from one to the other. Only `awaiting_registration_doi` asks for patience;
 *  the rest name the action, because for them no amount of waiting helps. */
/** The slots we can ask OSF to mint a DOI for. Mirrors `makeOutputCitable`'s
 *  input; item ⑧ widens both together or neither. */
const MINTABLE = ["materials", "data"] as const;
type MintableType = (typeof MINTABLE)[number];
const isMintable = (t: string): t is MintableType => (MINTABLE as readonly string[]).includes(t);

const GATE_COPY: Record<Exclude<LinkedOutputsGate, null>, { text: string; connect?: true }> = {
  not_connected: { text: "in Settings · Connections to link outputs.", connect: true },
  not_preregistered: { text: "Link outputs once this study is preregistered." },
  prereg_not_on_osf: {
    text: "This study's current preregistration isn't on OSF, so there's no registration to link outputs to. Push it to OSF from the Preregister stage.",
  },
  prereg_push_failed: {
    text: "This preregistration's push to OSF didn't complete, so there's no registration to link outputs to. Retry it from the Preregister stage.",
  },
  awaiting_registration_doi: {
    text: "This registration's DOI hasn't reached us yet. Outputs can be linked once it does.",
  },
};

export function LinkedOutputsPanel({ studyId }: { studyId: string }) {
  const q = api.studyRecord.getLinkedOutputs.useQuery({ studyId });
  const utils = api.useUtils();
  const [note, setNote] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteType, setPasteType] = useState("data");
  const [pasteDoi, setPasteDoi] = useState("");
  // Which slot's mint dialog is open. Typed to the slots that HAVE a mint path
  // (server: `makeOutputCitable`'s input), not to any string — so widening one
  // without the other is a compile error rather than a dialog that mints the
  // wrong artifact and says it worked.
  const [confirming, setConfirming] = useState<MintableType | null>(null);

  const link = api.studyRecord.linkExternalOutput.useMutation();
  const mint = api.studyRecord.makeOutputCitable.useMutation();
  const deposit = api.studyRecord.depositDataset.useMutation();
  const unlink = api.studyRecord.unlinkOutput.useMutation();
  const deposits = api.studyRecord.getDatasetDeposits.useQuery({ studyId });

  // Hidden for viewers (the writeProcedure errors for them), same as Materials.
  if (q.error || q.isLoading || !q.data) return null;
  const d = q.data;

  const refresh = async () => {
    await utils.studyRecord.getLinkedOutputs.invalidate({ studyId });
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNote(null);
    try {
      await fn();
      await refresh();
      setNote(ok);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't work.");
    }
  };

  const gate = d.gate ? GATE_COPY[d.gate] : null;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Linked outputs
        </h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Make your data, code, materials and paper citable from your OSF registration.
        </p>
      </div>

      {gate ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {gate.connect ? (
            <>
              {/* Mirror the Materials panel's existing disconnected state exactly. */}
              <Link href="/participants/connections" className="font-medium underline">
                Connect OSF
              </Link>{" "}
            </>
          ) : null}
          {gate.text}
        </p>
      ) : (
        <>
          <ul aria-label="Linked outputs" className="flex flex-col gap-1.5">
            {d.slots.map((s) => (
              <SlotRow
                key={s.resourceType}
                slot={s}
                studyId={studyId}
                busy={mint.isPending || unlink.isPending}
                onMakeCitable={() => {
                  if (isMintable(s.resourceType)) setConfirming(s.resourceType);
                }}
                onRemove={() => run(() => unlink.mutateAsync({ studyId, resourceType: s.resourceType }), "Removed.")}
              />
            ))}
          </ul>

          {/* The escape hatch, collapsed: for anyone who already deposited
              somewhere that mints DOIs. Optional, never required. */}
          {pasting ? (
            <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-2.5">
              <label className="flex flex-col gap-0.5">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">This DOI is</span>
                <select
                  className={fieldCls}
                  value={pasteType}
                  onChange={(e) => setPasteType(e.target.value)}
                  aria-label="What kind of output this DOI points at"
                >
                  {d.slots.map((s) => (
                    <option key={s.resourceType} value={s.resourceType}>
                      {LABEL[s.resourceType]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-0.5">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">DOI</span>
                <input
                  className={fieldCls}
                  value={pasteDoi}
                  onChange={(e) => setPasteDoi(e.target.value)}
                  placeholder="10.5281/zenodo.1234567"
                  aria-label="The DOI of your deposited output"
                />
              </label>
              <PendingButton
                pending={link.isPending}
                idleLabel="Link"
                pendingLabel="Linking…"
                onClick={() =>
                  run(async () => {
                    await link.mutateAsync({
                      studyId,
                      resourceType: pasteType as LinkedOutputSlot["resourceType"],
                      pid: pasteDoi,
                    });
                    setPasteDoi("");
                    setPasting(false);
                  }, "Linked.")
                }
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="self-start text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:text-[var(--color-text-primary)]"
            >
              I already have a DOI for one of these
            </button>
          )}

          {/* The deposit history. Every deposit stays listed with the N it
              carried and the day it was made — the sequence IS the transparency
              (ADR-0105 am. 1 D9), so it is never collapsed to "the latest". */}
          {deposits.data && deposits.data.deposits.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-2">
              <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]">
                Dataset deposits
              </span>
              <ol className="flex flex-col gap-1">
                {deposits.data.deposits.map((d) => (
                  <li key={d.ordinal} className="flex flex-wrap items-baseline gap-x-2 text-[length:var(--text-small)]">
                    <span className="text-[var(--color-text-secondary)]">Deposit {d.ordinal}</span>
                    <a
                      href={`https://doi.org/${d.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[var(--color-text-secondary)] underline"
                    >
                      {d.doi}
                    </a>
                    <span className="text-[var(--color-text-muted)]">
                      N={d.rowCount} ·{" "}
                      {new Date(d.depositedAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Each deposit keeps its own DOI. Earlier ones still resolve to the data they named.
              </p>
            </div>
          ) : null}
        </>
      )}

      {note ? (
        <p role="status" className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {note}
        </p>
      ) : null}

      {confirming ? (
        <MintConsent
          label={LABEL[confirming] ?? confirming}
          kind={confirming === "data" ? "deposit" : "mint"}
          priorDeposit={confirming === "data" ? (deposits.data?.deposits.at(-1) ?? null) : null}
          currentRowCount={deposits.data?.currentRowCount ?? null}
          samplingPlan={deposits.data?.samplingPlan ?? null}
          pending={mint.isPending || deposit.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            // Act on what the researcher actually confirmed. This read
            // `"materials"` hardcoded, invisible only while materials was the
            // one slot with a mint path; now `data` has one too, and the two
            // are DIFFERENT acts — materials mints the project's DOI in place,
            // a dataset deposit creates a new component every time (D7).
            run(async () => {
              if (confirming === "data") {
                const r = await deposit.mutateAsync({ studyId });
                setConfirming(null);
                return r;
              }
              await mint.mutateAsync({ studyId, resourceType: confirming });
              setConfirming(null);
            }, confirming === "data" ? "Deposited — your dataset has its own DOI." : "Linked — your materials now have a DOI.")
          }
        />
      ) : null}
    </section>
  );
}

const fieldCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2.5 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

function SlotRow({
  slot,
  busy,
  onMakeCitable,
  onRemove,
  studyId,
}: {
  slot: LinkedOutputSlot;
  busy: boolean;
  onMakeCitable: () => void;
  onRemove: () => void;
  studyId: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-2">
      <span className="min-w-28 text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]">
        {LABEL[slot.resourceType] ?? slot.resourceType}
      </span>
      <StateChip slot={slot} />
      <div className="flex flex-1 flex-col">
        {slot.pid ? (
          <a
            href={`https://doi.org/${slot.pid}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline"
          >
            {slot.pid}
          </a>
        ) : null}
        {/* The honesty line: WHO claimed this, or why nothing can. */}
        {slot.source ? (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{SOURCE_LINE[slot.source]}</span>
        ) : slot.error ? (
          <span role="alert" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {slot.error}
          </span>
        ) : slot.autoBlocked ? (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{slot.autoBlocked}</span>
        ) : !slot.auto ? (
          // No automatic source, ever — we host no code or supplements with a
          // DOI. Say it, rather than render a button that cannot act.
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            No automatic source — paste a DOI if you deposited this somewhere.
          </span>
        ) : null}
      </div>
      {/* `data` never offers Remove: it holds a deposit per row (ADR-0105 am. 1
          D7), so "remove the data DOI" names nothing — and removing the
          resource would not retract the DOI anyway (D6). It offers another
          deposit instead, which is the act that actually exists. */}
      {slot.state === "linked" && slot.resourceType !== "data" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline disabled:opacity-50"
        >
          Remove
        </button>
      ) : slot.auto === "mint_project" || slot.auto === "deposit_dataset" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onMakeCitable}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50"
        >
          {slot.auto === "deposit_dataset"
            ? slot.state === "linked"
              ? "Deposit again"
              : "Deposit to OSF"
            : "Make citable"}
        </button>
      ) : slot.auto === "article_doi" ? (
        <Link
          href={`/studies/${studyId}/record`}
          className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline"
        >
          Link the article DOI
        </Link>
      ) : null}
    </li>
  );
}

/** Text, never colour alone — the Linked/Failed distinction must survive
 *  greyscale, matching the Materials chips. */
function StateChip({ slot }: { slot: LinkedOutputSlot }) {
  const base = "inline-flex w-fit items-baseline rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium";
  if (slot.state === "linked") {
    return <span className={`${base} bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]`}>Linked</span>;
  }
  if (slot.state === "failed") {
    return <span className={`${base} bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]`}>Failed</span>;
  }
  return <span className={`${base} bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]`}>Not linked</span>;
}

/**
 * The consent gate. Both consequences BEFORE the click, in researcher language,
 * because both are permanent and neither is obvious (ADR-0104 D3 / ADR-0105 D5).
 * Cancel is focused first: the confirm cannot be undone.
 */
function MintConsent({
  label,
  kind,
  priorDeposit,
  currentRowCount,
  samplingPlan,
  pending,
  onConfirm,
  onCancel,
}: {
  label: string;
  /** `mint` makes an existing project citable; `deposit` sends a dataset to a
   *  NEW component. Different acts, so different consequences to state. */
  kind: "mint" | "deposit";
  /** The last deposit, when there is one — the other half of the N delta (D9). */
  priorDeposit: { ordinal: number; rowCount: number; depositedAt: string } | null;
  currentRowCount: number | null;
  samplingPlan: string | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mint-consent-title"
      className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3"
    >
      <h4 id="mint-consent-title" className="text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)]">
        {kind === "deposit"
          ? priorDeposit
            ? "Deposit this dataset again?"
            : "Deposit this dataset to OSF?"
          : `Make ${label.toLowerCase()} citable?`}
      </h4>

      {/* The N delta, before the click. A second deposit is legitimate — often
          it IS collecting more responses to reach the planned effect size — but
          it must not be invisible, because a dataset that grew after the
          researcher saw it is the one thing a reader needs told (D9). */}
      {kind === "deposit" && priorDeposit && currentRowCount != null ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <strong>
            This is deposit {priorDeposit.ordinal + 1}. N went {priorDeposit.rowCount} → {currentRowCount}
          </strong>{" "}
          since deposit {priorDeposit.ordinal} on{" "}
          {new Date(priorDeposit.depositedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          . Deposit {priorDeposit.ordinal}&rsquo;s DOI keeps resolving to the data it named — nothing is overwritten.
        </p>
      ) : null}
      {kind === "deposit" && priorDeposit && samplingPlan ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Your preregistered sampling plan says: &ldquo;{samplingPlan}&rdquo;. If this deposit departs from it, say why in
          a Deviations section — that&rsquo;s your call to make, not ours.
        </p>
      ) : null}

      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        <strong>
          This makes {kind === "deposit" ? "a new OSF component holding your data" : "your OSF project"} public
        </strong>{" "}
        — anyone will be able to {kind === "deposit" ? "download it" : "see it"}.
      </p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
        <strong>The DOI can&rsquo;t be removed.</strong> OSF mints it permanently, and neither we nor you can take it back.
      </p>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {kind === "deposit"
          ? "We send exactly the table you published on this record — the columns you chose, nothing else."
          : "OSF will mint the DOI and we’ll link it to your registration."}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-canvas)]"
        >
          Cancel
        </button>
        <PendingButton
          pending={pending}
          idleLabel={kind === "deposit" ? (priorDeposit ? "Deposit again" : "Deposit") : "Make citable"}
          pendingLabel={kind === "deposit" ? "Depositing…" : "Linking…"}
          onClick={onConfirm}
        />
      </div>
    </div>
  );
}
