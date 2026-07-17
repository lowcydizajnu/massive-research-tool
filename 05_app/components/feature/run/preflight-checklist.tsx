"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { OsfQuestion } from "@/server/modules/osf-schema";

/**
 * The mandatory-OSF-questions signal, folded INTO the readiness check rather than
 * standing beside it as a second "not ready" box (owner 2026-07-17: "Readiness
 * check should be unified, keeping emphasis on the mandatory question"). It is
 * the highest-stakes row here — the last thing between a researcher and a hollow
 * permanent DOI (ADR-0107 D4) — so it leads the list and carries the warning
 * tone, but it never gates the action: OSF completeness is warn-and-proceed, the
 * researcher owns their study.
 *
 * OSF enforces NOTHING (verified in source and observed on the sandbox
 * 2026-07-17: a registration answering none of the 16 required questions returned
 * 201 and minted a DOI, filing all 29 keys as `""`). So this names every blank
 * question in OSF's own words — a count is not actionable — and states the
 * consequence once, factually.
 */
function OsfMandatoryRow({
  unanswered,
  overviewHref,
}: {
  unanswered: OsfQuestion[];
  overviewHref: string;
}) {
  const n = unanswered.length;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] p-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-medium text-[var(--color-warning-text-on-subtle)]">
          <span className="sr-only">Needs attention: </span>
          {n === 1
            ? "1 mandatory OSF question is unanswered"
            : `${n} mandatory OSF questions are unanswered`}
        </span>
        <span className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
          OSF accepts your preregistration and mints its DOI either way — it doesn&rsquo;t check. Once filed it&rsquo;s
          permanent and public, and {n === 1 ? "this will read" : "these will read"} as blank.
        </span>
        {/* Named, in OSF's words. "6 required fields are empty" is not something a
            researcher can act on; "Starting and stopping rules" is. */}
        <ul className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
          {unanswered.map((q) => (
            <li key={q.key}>· {q.label}</li>
          ))}
        </ul>
        {/* A plain anchor, not next/link: typedRoutes rejects the #fragment, and
            the fragment is the point — it focuses the first unanswered question
            rather than landing on the top of a long page. */}
        <a
          href={`${overviewHref}#osfq-${unanswered[0].key}`}
          className="mt-0.5 inline-block w-fit rounded-[var(--radius-sm)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
        >
          Answer these
        </a>
      </div>
    </div>
  );
}

/**
 * Readiness check (ADR-0034, preflight-checklist.md): methodological linting
 * above the Preregister / Publish & run actions. Failures disable the wrapped
 * action until the researcher ticks "Proceed anyway" — advisory with friction,
 * never enforcement (researcher autonomy). A query error never strands the
 * researcher: the action stays enabled.
 *
 * On the Preregister stage it also carries OSF's own mandatory-question
 * completeness (`osfUnanswered` + `overviewHref`) — one readiness surface, not
 * two stacked boxes (owner 2026-07-17). Those are warn-and-proceed: they show,
 * they name what's blank, but they do NOT contribute to the gate. Omit both
 * props (Publish & run, amendments) and the check behaves exactly as before.
 */
export function PreflightChecklist({
  studyId,
  mode,
  osfUnanswered = [],
  overviewHref,
  children,
}: {
  studyId: string;
  mode: "preregister" | "publish";
  /** OSF's still-blank required questions (preregister stage only). */
  osfUnanswered?: OsfQuestion[];
  /** Overview URL the "Answer these" deep-link targets. Required for the OSF row. */
  overviewHref?: string;
  children: React.ReactNode;
}) {
  const { data: checks, isLoading, isError } = api.studies.preflight.useQuery({ studyId, mode });
  const [ack, setAck] = useState(false);

  const osfCount = osfUnanswered.length;
  const osfRow =
    osfCount > 0 && overviewHref ? (
      <OsfMandatoryRow unanswered={osfUnanswered} overviewHref={overviewHref} />
    ) : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {osfRow}
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Running readiness checks…</p>
      </div>
    );
  }
  if (isError || !checks) {
    return (
      <div className="flex flex-col gap-3">
        {osfRow}
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Couldn’t run the readiness checks — you can still continue.
        </p>
        {children}
      </div>
    );
  }

  const fails = checks.filter((c) => c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");
  const gateOpen = fails.length === 0 || ack;

  // The OSF blanks read as warnings in the summary (they never gate), so the pill
  // is danger only for real fails, warning when anything soft is outstanding.
  const allClear = fails.length === 0 && warns.length === 0 && osfCount === 0;
  const summary = allClear
    ? "All clear"
    : [
        fails.length ? `${fails.length} issue${fails.length === 1 ? "" : "s"}` : null,
        warns.length ? `${warns.length} note${warns.length === 1 ? "" : "s"}` : null,
        osfCount ? `${osfCount} OSF unanswered` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
            Readiness check
          </h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[length:var(--text-small)] font-medium",
              fails.length
                ? "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]"
                : warns.length || osfCount
                  ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]"
                  : "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
            )}
          >
            {summary}
          </span>
        </div>

        {/* Mandatory OSF questions lead — the highest-stakes, least-recoverable
            item in the check. Emphasized, but warn-and-proceed (never gated). */}
        {osfRow}

        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {c.status === "fail" ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" aria-hidden />
              ) : c.status === "warn" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  <span className="sr-only">
                    {c.status === "fail" ? "Issue: " : c.status === "warn" ? "Note: " : "Passed: "}
                  </span>
                  {c.title}
                </span>
                {c.detail ? (
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{c.detail}</span>
                ) : null}
                {c.blocks?.length ? (
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    {c.blocks.map((b) => `"${b.name}"`).join(", ")} —{" "}
                    <Link
                      href={`/studies/${studyId}/build` as Route}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      Fix in Build →
                    </Link>
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>

        {fails.length > 0 ? (
          <label className="mt-1 flex items-start gap-2 border-t border-[var(--color-border-subtle)] pt-2.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-primary)]"
            />
            Proceed anyway — I understand the flagged issues (e.g. this is intentionally exploratory).
          </label>
        ) : null}
      </div>

      <div
        aria-disabled={!gateOpen}
        // `inert` removes the subtree from focus order + blocks activation for
        // BOTH mouse and keyboard — pointer-events-none alone let keyboard users
        // tab to the action and fire it without acknowledging the flagged issues.
        {...(!gateOpen ? { inert: true } : {})}
        className={cn(!gateOpen && "pointer-events-none select-none opacity-50")}
      >
        {children}
      </div>
    </div>
  );
}
