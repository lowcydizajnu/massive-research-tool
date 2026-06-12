"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Readiness check (ADR-0034, preflight-checklist.md): methodological linting
 * above the Preregister / Publish & run actions. Failures disable the wrapped
 * action until the researcher ticks "Proceed anyway" — advisory with friction,
 * never enforcement (researcher autonomy). A query error never strands the
 * researcher: the action stays enabled.
 */
export function PreflightChecklist({
  studyId,
  mode,
  children,
}: {
  studyId: string;
  mode: "preregister" | "publish";
  children: React.ReactNode;
}) {
  const { data: checks, isLoading, isError } = api.studies.preflight.useQuery({ studyId, mode });
  const [ack, setAck] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Running readiness checks…</p>
      </div>
    );
  }
  if (isError || !checks) {
    return (
      <div className="flex flex-col gap-3">
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

  const summary =
    fails.length === 0 && warns.length === 0
      ? "All clear"
      : [
          fails.length ? `${fails.length} issue${fails.length === 1 ? "" : "s"}` : null,
          warns.length ? `${warns.length} note${warns.length === 1 ? "" : "s"}` : null,
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
                : warns.length
                  ? "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]"
                  : "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
            )}
          >
            {summary}
          </span>
        </div>

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
        className={cn(!gateOpen && "pointer-events-none select-none opacity-50")}
      >
        {children}
      </div>
    </div>
  );
}
