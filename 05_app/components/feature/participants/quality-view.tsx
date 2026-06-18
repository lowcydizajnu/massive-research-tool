"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { READ_ONLY_TITLE, ReadOnlyBanner, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import type { QualityFlagRow } from "@/server/trpc/routers/quality";

/**
 * Participants · Quality (V1.15 P5 / ADR-0049 + ADR-0052). Cross-study flag queue
 * with an inline response preview (so a decision is informed) and in-app
 * approve/reject/bonus that trigger the provider's money operation behind a
 * confirmation step (Prolific charges — we never touch money rails).
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
const shortPid = (pid: string | null) => (!pid ? "—" : pid.length > 12 ? `${pid.slice(0, 6)}…${pid.slice(-4)}` : pid);

/**
 * Render a stored answer payload as readable text. Block answers are jsonb in a
 * handful of shapes ({selected:[…]}, {value}, {text}, scalars, arrays) — show the
 * human value, not raw JSON. Falls back to JSON for anything unrecognized.
 */
function formatAnswer(answer: unknown): string {
  if (answer == null) return "—";
  if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") return String(answer);
  if (Array.isArray(answer)) return answer.map(formatAnswer).join(", ");
  if (typeof answer === "object") {
    const o = answer as Record<string, unknown>;
    for (const key of ["selected", "value", "text", "label", "choice"]) {
      if (o[key] != null) return formatAnswer(o[key]);
    }
  }
  return JSON.stringify(answer);
}

export function QualityView({ initialOpen, initialResolved }: { initialOpen: QualityFlagRow[]; initialResolved: QualityFlagRow[] }) {
  const { role, canWrite } = useWorkspaceRole();
  const utils = api.useUtils();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approved" | "rejected" | "dismissed" | null>(null);
  const [bulkReason, setBulkReason] = useState("");

  const open = api.recruitment.quality.list.useQuery({ resolved: false }, { initialData: initialOpen });
  const resolved = api.recruitment.quality.list.useQuery({ resolved: true }, { initialData: initialResolved });
  const refresh = () => void utils.recruitment.quality.list.invalidate();
  const clearSelection = () => {
    setSelected(new Set());
    setBulkAction(null);
    setBulkReason("");
  };

  const rescan = api.recruitment.quality.rescan.useMutation({
    onSuccess: (r) => {
      setNote(r.created ? `Found ${r.created} new flag${r.created === 1 ? "" : "s"}.` : "No new flags.");
      refresh();
    },
    onError: (e) => setNote(e.message),
  });
  const bulkResolve = api.recruitment.quality.bulkResolve.useMutation({
    onSuccess: (r) => {
      setNote(
        `${r.resolved} resolved${r.appliedOnProvider ? ` · ${r.appliedOnProvider} actioned on Prolific` : ""}${r.failed.length ? ` · ${r.failed.length} failed` : ""}.`,
      );
      clearSelection();
      refresh();
    },
    onError: (e) => setNote(e.message),
  });

  const rows = tab === "open" ? (open.data ?? []) : (resolved.data ?? []);
  const openIds = (open.data ?? []).map((f) => f.id);
  const allSelected = openIds.length > 0 && openIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
              onClick={() => {
                setTab(t);
                clearSelection();
              }}
              className={
                "rounded-[var(--radius-sm)] px-2.5 py-1 font-medium " +
                (tab === t ? "bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]")
              }
            >
              {t === "open" ? `Needs review (${open.data?.length ?? 0})` : `Resolved (${resolved.data?.length ?? 0})`}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-2">
          {note ? <span aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{note}</span> : null}
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
            {tab === "open" ? "Nothing flagged. Re-scan after more submissions complete, or flag a session manually." : "No resolved flags yet."}
          </p>
        </div>
      ) : (
        <>
          {tab === "open" && canWrite ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-2">
              <div className="flex flex-wrap items-center gap-3 text-[length:var(--text-small)]">
                <label className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(openIds))} />
                  {selected.size > 0 ? `${selected.size} selected` : "Select all"}
                </label>
                {selected.size > 0 ? (
                  <span className="flex items-center gap-3">
                    {(["approved", "rejected", "dismissed"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          setNote(null);
                          setBulkAction(a);
                        }}
                        className="font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      >
                        {a === "approved" ? "Approve" : a === "rejected" ? "Reject" : "Dismiss"} {selected.size}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>
              {bulkAction ? (
                <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-3">
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    {bulkAction === "approved"
                      ? `Approve ${selected.size} on Prolific — each linked submission is paid its reward. Continue?`
                      : bulkAction === "rejected"
                        ? `Reject ${selected.size} on Prolific — these participants are not paid and Prolific notifies them with your reason.`
                        : `Dismiss ${selected.size} flag${selected.size === 1 ? "" : "s"} (records your decision; no payment action).`}
                  </p>
                  {bulkAction === "rejected" ? (
                    <textarea
                      value={bulkReason}
                      onChange={(e) => setBulkReason(e.target.value)}
                      rows={2}
                      placeholder="Reason shown to every rejected participant (required)"
                      className="w-full max-w-prose rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
                    />
                  ) : null}
                  <div className="flex items-center gap-3">
                    <PendingButton
                      onClick={() => bulkResolve.mutate({ flagIds: [...selected], resolution: bulkAction, note: bulkReason.trim() || undefined })}
                      disabled={bulkAction === "rejected" && !bulkReason.trim()}
                      pending={bulkResolve.isPending}
                      idleLabel={`Confirm — ${selected.size}`}
                      pendingLabel="Working…"
                      className={"w-fit px-4 py-1.5 " + (bulkAction === "rejected" ? "bg-[var(--color-danger)] hover:opacity-90" : "")}
                    />
                    <button type="button" onClick={() => setBulkAction(null)} className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {rows.map((f) => (
              <FlagRow
                key={f.id}
                flag={f}
                canWrite={canWrite}
                resolved={tab === "resolved"}
                onDone={refresh}
                selectable={tab === "open" && canWrite}
                checked={selected.has(f.id)}
                onToggle={() => toggle(f.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type Action = "approved" | "rejected" | "bonus";

function FlagRow({
  flag,
  canWrite,
  resolved,
  onDone,
  selectable = false,
  checked = false,
  onToggle,
}: {
  flag: QualityFlagRow;
  canWrite: boolean;
  resolved: boolean;
  onDone: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [err, setErr] = useState<string | null>(null);

  const preview = api.recruitment.quality.responsePreview.useQuery({ flagId: flag.id }, { enabled: expanded });
  const resolve = api.recruitment.quality.resolve.useMutation({ onSuccess: onDone, onError: (e) => setErr(e.message) });
  const bonus = api.recruitment.quality.bonus.useMutation({ onSuccess: onDone, onError: (e) => setErr(e.message) });

  const linked = !!flag.providerSubmissionId;
  const reset = () => {
    setAction(null);
    setReason("");
    setErr(null);
  };

  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {selectable ? (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              aria-label="Select flag for bulk action"
              className="mt-0.5"
            />
          ) : null}
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
        {resolved ? (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {flag.resolution} {flag.resolvedBy ? `· ${flag.resolvedBy}` : ""}
          </span>
        ) : (
          <div className="flex items-center gap-2 text-[length:var(--text-small)]">
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[var(--color-text-secondary)] underline hover:opacity-80">
              {expanded ? "Hide answers" : "View answers"}
            </button>
            {(["approved", "rejected", "bonus"] as const).map((a) => (
              <button
                key={a}
                type="button"
                disabled={!canWrite || (a === "bonus" && !linked)}
                title={canWrite ? undefined : READ_ONLY_TITLE}
                onClick={() => {
                  setErr(null);
                  setAction(a);
                }}
                className="font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
              >
                {a === "approved" ? "Approve" : a === "rejected" ? "Reject" : "Bonus"}
              </button>
            ))}
            <button
              type="button"
              disabled={!canWrite || resolve.isPending}
              title={canWrite ? undefined : READ_ONLY_TITLE}
              onClick={() => resolve.mutate({ flagId: flag.id, resolution: "dismissed" })}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Inline answer preview — informed decisions (research data, not PII). */}
      {expanded && !resolved ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3">
          {preview.isLoading ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading answers…</p>
          ) : !preview.data?.responseId ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No linked response to preview.</p>
          ) : preview.data.items.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {preview.data.durationSec != null ? `Completed in ${preview.data.durationSec}s. ` : ""}No item answers recorded.
            </p>
          ) : (
            <>
              <p className="mb-1 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {preview.data.status} · {preview.data.durationSec != null ? `${preview.data.durationSec}s` : "—"} · {preview.data.items.length} answers
              </p>
              <ul className="flex flex-col gap-0.5">
                {preview.data.items.map((it, i) => (
                  <li key={i} className="flex gap-2 text-[length:var(--text-small)]">
                    <span className="shrink-0 text-[var(--color-text-muted)]">{it.moduleKey}</span>
                    <span className="truncate text-[var(--color-text-primary)]">{formatAnswer(it.answer)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {/* Confirmation panel for money actions (ADR-0052). */}
      {action && !resolved ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-3">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            {action === "approved"
              ? linked
                ? "Approve on Prolific — this pays the participant their reward. Continue?"
                : "No linked Prolific submission — this records your decision only (no payment)."
              : action === "rejected"
                ? "Reject on Prolific — the participant is not paid and Prolific notifies them with your reason."
                : "Send a bonus to this participant on Prolific."}
          </p>
          {action === "rejected" ? (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason shown to the participant (required)"
              className="w-full max-w-prose rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            />
          ) : null}
          {action === "bonus" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0.01}
                step={0.5}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-24 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                className="min-w-48 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
              />
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <PendingButton
              onClick={() => {
                if (action === "bonus") bonus.mutate({ flagId: flag.id, amountMajor: Math.max(0.01, Number(amount) || 0), reason });
                else resolve.mutate({ flagId: flag.id, resolution: action, note: reason.trim() || undefined });
              }}
              disabled={(action === "rejected" || action === "bonus") && !reason.trim()}
              pending={resolve.isPending || bonus.isPending}
              idleLabel={action === "approved" ? "Confirm approve" : action === "rejected" ? "Confirm reject" : "Send bonus"}
              pendingLabel="Working…"
              className={"w-fit px-4 py-1.5 " + (action === "rejected" ? "bg-[var(--color-danger)] hover:opacity-90" : "")}
            />
            <button type="button" onClick={reset} className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80">
              Cancel
            </button>
          </div>
          {err ? <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{err}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
