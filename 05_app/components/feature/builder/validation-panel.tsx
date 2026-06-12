"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { api } from "@/lib/trpc/react";

/**
 * Validation sub-tab (ADR-0034): the same readiness checks that gate
 * Preregister/Publish, browsable any time from the Builder — read-only, no
 * proceed gate (that lives on the freeze surfaces).
 */
export function ValidationPanel({ studyId }: { studyId: string }) {
  const { data, isLoading } = api.studies.preflight.useQuery({ studyId, mode: "publish" });
  if (isLoading || !data) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Running checks…</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Readiness</h2>
      <ul className="flex flex-col gap-1.5">
        {data.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            {c.status === "fail" ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" aria-hidden />
            ) : c.status === "warn" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="text-[length:var(--text-small)] text-[var(--color-text-primary)]">{c.title}</span>
              {c.detail ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{c.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        The same checks gate Preregister and Publish &amp; run.
      </p>
    </div>
  );
}
