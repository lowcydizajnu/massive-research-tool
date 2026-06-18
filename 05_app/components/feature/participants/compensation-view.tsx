"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { PendingButton } from "@/components/ui/pending-button";
import { READ_ONLY_TITLE, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import type {
  CompensationSummary,
  MonthSpend,
  PayoutRow,
  StudySpend,
} from "@/server/trpc/routers/compensation";

/**
 * Participants · Compensation (V1.15 P4 / participants-compensation.md, ADR-0048).
 * Read-only spend mirror — we never process money. All figures grouped BY CURRENCY
 * (no FX, no blended totals). Budget form is owner/admin-only.
 */
function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function CompensationView({
  summary,
  byStudy,
  byMonth,
  recentPayouts,
}: {
  summary: CompensationSummary;
  byStudy: StudySpend[];
  byMonth: MonthSpend[];
  recentPayouts: PayoutRow[];
}) {
  const { role } = useWorkspaceRole();
  const canManageBudget = role === "owner" || role === "admin";
  const hasData = summary.currencies.length > 0;

  return (
    <section className="flex flex-col gap-5">
      <p className="max-w-prose text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        What you&rsquo;ve spent recruiting participants, mirrored from your provider. We don&rsquo;t process payments —
        your provider charges you directly.
      </p>

      {summary.budget?.overThreshold ? (
        <div
          role="status"
          className={
            "rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-small)] " +
            (summary.budget.overLimit
              ? "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]"
              : "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]")
          }
        >
          {summary.budget.overLimit ? "Over budget" : "Approaching budget"} this month:{" "}
          {money(summary.budget.thisMonthCents, summary.budget.currency)} of{" "}
          {money(summary.budget.monthlyLimitCents, summary.budget.currency)}.
        </div>
      ) : null}

      {!hasData ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-6 text-center">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            No participant spend recorded yet. Approve submissions on your provider and it&rsquo;ll appear here.
          </p>
        </div>
      ) : (
        <>
          {/* KPI strip — one row of cards per currency */}
          <div className="flex flex-col gap-3">
            {summary.currencies.map((c) => (
              <div key={c.currency} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label={`Total spend (${c.currency})`} value={money(c.allTimeCents, c.currency)} />
                <Kpi label="Last 30 days" value={money(c.last30Cents, c.currency)} />
                <Kpi label="Participants paid" value={String(c.participantsPaid)} />
                <Kpi label="Avg / participant" value={money(c.avgCents, c.currency)} />
              </div>
            ))}
          </div>

          {/* By study */}
          <div className="flex flex-col gap-2">
            <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">By study</h2>
            <table className="w-full text-left text-[length:var(--text-small)]">
              <caption className="sr-only">Spend by study</caption>
              <thead className="text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1 font-medium">Study</th>
                  <th className="py-1 font-medium">Paid</th>
                  <th className="py-1 font-medium">Reward</th>
                  <th className="py-1 font-medium">Bonus</th>
                  <th className="py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {byStudy.map((s) => (
                  <tr key={`${s.studyId}-${s.currency}`} className="border-t border-[var(--color-border-subtle)]">
                    <td className="py-1 text-[var(--color-text-primary)]">{s.title}</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">{s.participantsPaid}</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">{money(s.rewardCents, s.currency)}</td>
                    <td className="py-1 text-[var(--color-text-secondary)]">{money(s.bonusCents, s.currency)}</td>
                    <td className="py-1 font-medium text-[var(--color-text-primary)]">{money(s.totalCents, s.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* By month */}
          {byMonth.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Last 6 months</h2>
              <MonthBars data={byMonth} />
            </div>
          ) : null}

          {/* Recent payouts */}
          {recentPayouts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                Recent payouts <span className="font-normal text-[var(--color-text-muted)]">(latest 50)</span>
              </h2>
              <table className="w-full text-left text-[length:var(--text-small)]">
                <caption className="sr-only">Recent payouts</caption>
                <thead className="text-[var(--color-text-muted)]">
                  <tr>
                    <th className="py-1 font-medium">When</th>
                    <th className="py-1 font-medium">Study</th>
                    <th className="py-1 font-medium">Kind</th>
                    <th className="py-1 font-medium">Amount</th>
                    <th className="py-1 font-medium">Decided by</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayouts.map((p, i) => (
                    <tr key={i} className="border-t border-[var(--color-border-subtle)]">
                      <td className="py-1 text-[var(--color-text-secondary)]">{new Date(p.decidedAt).toLocaleDateString()}</td>
                      <td className="py-1 text-[var(--color-text-secondary)]">{p.studyTitle ?? "—"}</td>
                      <td className="py-1 text-[var(--color-text-secondary)]">{p.kind}</td>
                      <td className="py-1 text-[var(--color-text-primary)]">{money(p.amountCents, p.currency)}</td>
                      <td className="py-1 text-[var(--color-text-muted)]">{p.decidedBy ?? "on provider"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {canManageBudget ? <BudgetForm initial={summary.budget} /> : null}
      {canManageBudget ? <AutoApprovalForm /> : null}
    </section>
  );
}

function AutoApprovalForm() {
  const router = useRouter();
  const { canWrite } = useWorkspaceRole();
  const policy = api.recruitment.compensation.getAutoApprovalPolicy.useQuery();
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(24);
  const [synced, setSynced] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Seed local state once the policy loads (uncontrolled-until-loaded).
  if (policy.data && !synced) {
    setEnabled(policy.data.enabled);
    setHours(policy.data.minAgeHours);
    setSynced(true);
  }
  const save = api.recruitment.compensation.setAutoApprovalPolicy.useMutation({
    onSuccess: () => {
      setErr(null);
      router.refresh();
    },
    onError: (e) => setErr(e.message),
  });

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4">
      <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Auto-approval</h2>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        When on, submissions with <strong>no open quality flag</strong> are approved (and paid on Prolific) automatically once
        they&rsquo;ve been awaiting review for the set time. Flagged participants are never auto-approved; rejections always stay manual.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable auto-approval
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">After (hours awaiting review)</span>
          <input
            type="number"
            min={1}
            max={720}
            value={hours}
            onChange={(e) => setHours(Math.min(720, Math.max(1, Number(e.target.value) || 24)))}
            disabled={!enabled}
            className="w-24 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)] disabled:opacity-50"
          />
        </label>
        <PendingButton
          onClick={() => save.mutate({ enabled, minAgeHours: hours })}
          disabled={!canWrite}
          title={canWrite ? undefined : READ_ONLY_TITLE}
          pending={save.isPending}
          idleLabel="Save"
          pendingLabel="Saving…"
          className="px-4 py-1.5"
        />
      </div>
      {err ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-3">
      <span className="text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">{value}</span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}

function MonthBars({ data }: { data: MonthSpend[] }) {
  const max = Math.max(...data.map((d) => d.totalCents), 1);
  return (
    <ul className="flex flex-col gap-1">
      {data.map((d) => (
        <li key={`${d.month}-${d.currency}`} className="flex items-center gap-2 text-[length:var(--text-small)]">
          <span className="w-24 shrink-0 text-[var(--color-text-muted)]">
            {d.month} · {d.currency}
          </span>
          <span
            className="inline-block h-3 rounded-[var(--radius-sm)] bg-[var(--color-primary)]"
            style={{ width: `${Math.max(4, (d.totalCents / max) * 100)}%` }}
            aria-hidden
          />
          <span className="text-[var(--color-text-secondary)]">{money(d.totalCents, d.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function BudgetForm({ initial }: { initial: CompensationSummary["budget"] }) {
  const router = useRouter();
  const [limit, setLimit] = useState(initial ? String(initial.monthlyLimitCents / 100) : "");
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">((initial?.currency as "USD" | "EUR" | "GBP") ?? "GBP");
  const [threshold, setThreshold] = useState(initial?.alertThresholdPct ?? 100);
  const [err, setErr] = useState<string | null>(null);
  const { canWrite } = useWorkspaceRole();

  const save = api.recruitment.compensation.setBudget.useMutation({
    onSuccess: () => {
      setErr(null);
      router.refresh();
    },
    onError: (e) => setErr(e.message),
  });

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-4">
      <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Monthly budget</h2>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Optional. Advisory only — we warn when this month&rsquo;s spend crosses the threshold; nothing is blocked.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Monthly limit</span>
          <input
            type="number"
            min={0}
            step={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-28 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
        </label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as "USD" | "EUR" | "GBP")}
          className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
        >
          <option value="GBP">GBP</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Alert at %</span>
          <input
            type="number"
            min={1}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Math.min(100, Math.max(1, Number(e.target.value) || 100)))}
            className="w-20 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
        </label>
        <PendingButton
          onClick={() =>
            save.mutate({
              monthlyLimitCents: limit.trim() ? Math.round(Number(limit) * 100) : null,
              currency,
              alertThresholdPct: threshold,
            })
          }
          disabled={!canWrite}
          title={canWrite ? undefined : READ_ONLY_TITLE}
          pending={save.isPending}
          idleLabel="Save budget"
          pendingLabel="Saving…"
          className="px-4 py-1.5"
        />
        {initial ? (
          <button
            type="button"
            onClick={() => save.mutate({ monthlyLimitCents: null, currency, alertThresholdPct: threshold })}
            className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
          >
            Clear
          </button>
        ) : null}
      </div>
      {err ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {err}
        </p>
      ) : null}
    </div>
  );
}
