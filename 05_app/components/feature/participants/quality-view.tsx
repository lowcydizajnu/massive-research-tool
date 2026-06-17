"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { READ_ONLY_TITLE, ReadOnlyBanner, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import type { QualityFlagRow } from "@/server/trpc/routers/quality";

/**
 * Participants · Quality (V1.15 P5 / participants-quality.md, ADR-0049). Cross-study
 * queue of flagged submissions (heuristic + manual). Resolution is audit-only in V1 —
 * it records the decision; the actual approve/reject happens on the provider.
 */
const KIND_LABEL: Record<string, string> = {
  fast_completion: "Suspiciously fast",
  straight_lining: "Straight-lining",
  duplicate_pid: "Duplicate participant",
  manual: "Manually flagged",
  slow_completion: "Suspiciously slow",
  attention_check: "Attention check failed",
  spam_text: "Possible spam text",
};
const SEVERITY_TONE: Record<string, string> = {
  high: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
  medium: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
  low: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
};
function shortPid(pid: string | null): string {
  if (!pid) return "—";
  return pid.length > 12 ? `${pid.slice(0, 6)}…${pid.slice(-4)}` : pid;
}

export function QualityView({ initialOpen, initialResolved }: { initialOpen: QualityFlagRow[]; initialResolved: QualityFlagRow[] }) {
  const { role, canWrite } = useWorkspaceRole();
  const utils = api.useUtils();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [note, setNote] = useState<string | null>(null);

  const open = api.recruitment.quality.list.useQuery({ resolved: false }, { initialData: initialOpen });
  const resolved = api.recruitment.quality.list.useQuery({ resolved: true }, { initialData: initialResolved });

  const refresh = () => {
    void utils.recruitment.quality.list.invalidate();
  };
  const rescan = api.recruitment.quality.rescan.useMutation({
    onSuccess: (r) => {
      setNote(r.created ? `Found ${r.created} new flag${r.created === 1 ? "" : "s"}.` : "No new flags.");
      refresh();
    },
    onError: (e) => setNote(e.message),
  });

  const rows = tab === "open" ? (open.data ?? []) : (resolved.data ?? []);

  return (
    <section className="flex flex-col gap-4">
      <ReadOnlyBanner role={role} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Quality" className="flex gap-1 text-[length:var(--text-small)]">
          {(["open", "resolved"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={
                "rounded-[var(--radius-sm)] px-2.5 py-1 font-medium " +
                (tab === t
                  ? "bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]")
              }
            >
              {t === "open" ? `Needs review (${open.data?.length ?? 0})` : `Resolved (${resolved.data?.length ?? 0})`}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-2">
          {note ? (
            <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {note}
            </span>
          ) : null}
          <PendingButton
            variant="secondary"
            onClick={() => rescan.mutate({})}
            disabled={!canWrite}
            title={canWrite ? undefined : READ_ONLY_TITLE}
            pending={rescan.isPending}
            idleLabel="Re-scan"
            pendingLabel="Scanning…"
            className="px-3 py-1.5 text-[length:var(--text-small)]"
          />
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-6 text-center">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {tab === "open"
              ? "Nothing flagged. Re-scan after more submissions complete, or flag a session manually."
              : "No resolved flags yet."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((f) => (
            <FlagRow key={f.id} flag={f} canWrite={canWrite} resolved={tab === "resolved"} onResolved={refresh} />
          ))}
        </ul>
      )}

      {tab === "open" ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Resolving records your decision here. Approve or reject the submission on your provider to finalize payment.
        </p>
      ) : null}
    </section>
  );
}

function FlagRow({
  flag,
  canWrite,
  resolved,
  onResolved,
}: {
  flag: QualityFlagRow;
  canWrite: boolean;
  resolved: boolean;
  onResolved: () => void;
}) {
  const resolve = api.recruitment.quality.resolve.useMutation({ onSuccess: onResolved });
  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={"rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium " + (SEVERITY_TONE[flag.severity] ?? "")}>
              {KIND_LABEL[flag.flagKind] ?? flag.flagKind}
            </span>
            <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{flag.studyTitle ?? "—"}</span>
            <span className="font-mono text-[length:var(--text-small)] text-[var(--color-text-muted)]" title={flag.externalPid ?? undefined}>
              {shortPid(flag.externalPid)}
            </span>
          </div>
          {flag.detail ? <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{flag.detail}</p> : null}
        </div>
        {!resolved ? (
          <div className="flex items-center gap-2">
            {(["approved", "rejected", "dismissed"] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={!canWrite || resolve.isPending}
                title={canWrite ? undefined : READ_ONLY_TITLE}
                onClick={() => resolve.mutate({ flagId: flag.id, resolution: r })}
                className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-40"
              >
                {r === "approved" ? "Approve" : r === "rejected" ? "Reject" : "Dismiss"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {flag.resolution} {flag.resolvedBy ? `· ${flag.resolvedBy}` : ""}
          </span>
        )}
      </div>
    </li>
  );
}
