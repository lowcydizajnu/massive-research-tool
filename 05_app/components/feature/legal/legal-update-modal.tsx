"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/trpc/react";

/**
 * Legal-update re-prompt (legal-baseline LG3). When the Terms or Privacy version
 * is bumped, a signed-in researcher who accepted an older version is asked to
 * re-acknowledge before continuing. Acceptance at SIGNUP is recorded server-side
 * in finalizeOnboarding; this modal only covers in-force version bumps.
 *
 * Mounted in the (app) shell (inside TRPCReactProvider). Never shown in the
 * participant runtime (/take/*) — that route group is outside (app) anyway, but
 * we guard defensively. Non-blocking on read failure: if the query errors we
 * render nothing rather than trapping the user.
 */
export function LegalUpdateModal() {
  const pathname = usePathname() ?? "";
  const inTakeRuntime = pathname.startsWith("/take/");

  const outstanding = api.legal.outstandingAcceptances.useQuery(undefined, {
    enabled: !inTakeRuntime,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const utils = api.useUtils();
  const accept = api.legal.acceptUpdate.useMutation();
  const [submitting, setSubmitting] = useState(false);

  const items = outstanding.data ?? [];
  if (inTakeRuntime || items.length === 0) return null;

  async function acceptAll() {
    setSubmitting(true);
    try {
      for (const it of items) {
        await accept.mutateAsync({ documentKind: it.documentKind, documentVersion: it.currentVersion });
      }
      await utils.legal.outstandingAcceptances.invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Updated legal terms"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface-canvas)] p-6 shadow-[var(--shadow-md)]"
      >
        <h2 className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">
          We&rsquo;ve updated our terms
        </h2>
        <p className="mt-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Please review and accept the updated documents to continue.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {items.map((it) => (
            <li
              key={it.documentKind}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
            >
              <Link
                href={`/legal/${it.documentKind}` as Route}
                target="_blank"
                className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-primary)] hover:opacity-90"
              >
                {it.title}
              </Link>
              {it.summary ? (
                <p className="mt-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {it.summary}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={acceptAll}
          disabled={submitting}
          className="mt-5 w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "I agree to the updated terms"}
        </button>
      </div>
    </div>
  );
}
