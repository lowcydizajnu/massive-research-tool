"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { cn } from "@/lib/utils";
import type { RunningStatus, RunningStudyRow } from "@/server/trpc/routers/studies";

/**
 * Studies·Running board (studies-running-tab.md, V1.13.0 Stream C / N4.2). The
 * operational "is data collection going well right now?" view: a KPI strip, a
 * recruitment table (one row per currently-recruiting study), and an alert
 * center (the non-healthy rows, phrased). Reads the N4.1 `studies.runningOverview`
 * + `studies.runningList` and polls every 60s while the tab is visible (the
 * Page Visibility API pauses it in the background). Per-row Pause/Stop reuse
 * `studies.setRecruitmentStatus` (writeProcedure — the server enforces role, as
 * on the Run stage); a paused study drops off the board (Resume lives on Run).
 */

const POLL_MS = 60_000;

const STATUS_BADGE: Record<RunningStatus, { label: string; cls: string }> = {
  healthy: {
    label: "Healthy",
    cls: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
  },
  imbalanced: {
    label: "Imbalanced",
    cls: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
  },
  target_reached: {
    label: "Target reached",
    cls: "bg-[var(--color-info-subtle)] text-[var(--color-info-text-on-subtle)]",
  },
};

export function RunningBoard() {
  const refetchInterval = useVisibleInterval(POLL_MS);
  const utils = api.useUtils();
  const overview = api.studies.runningOverview.useQuery(undefined, { refetchInterval });
  const list = api.studies.runningList.useQuery(undefined, { refetchInterval });

  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const setStatus = api.studies.setRecruitmentStatus.useMutation({
    onSuccess: () => {
      setConfirmStopId(null);
      void utils.studies.runningList.invalidate();
      void utils.studies.runningOverview.invalidate();
    },
  });
  const isPausing = (id: string) =>
    setStatus.isPending && setStatus.variables?.studyId === id && setStatus.variables.status === "paused";
  const isStopping = (id: string) =>
    setStatus.isPending && setStatus.variables?.studyId === id && setStatus.variables.status === "closed";

  const rows = list.data ?? [];
  const alerts = rows.filter((r) => r.status !== "healthy");

  return (
    <div className="flex flex-col gap-5">
      {/* KPI strip — polite live region so SR users hear the polled counts change. */}
      <section aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {overview.isError ? (
          <p
            role="alert"
            className="col-span-full text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]"
          >
            Couldn’t load the summary.{" "}
            <button type="button" onClick={() => void overview.refetch()} className="underline">
              Retry
            </button>
          </p>
        ) : (
          <>
            <Kpi label="Running" value={overview.data?.recruitingStudies} loading={overview.isLoading} />
            <Kpi label="Responses today" value={overview.data?.responsesToday} loading={overview.isLoading} />
            <Kpi label="This week" value={overview.data?.responsesThisWeek} loading={overview.isLoading} />
            <Kpi
              label="Needs attention"
              value={overview.data?.needingAttention}
              loading={overview.isLoading}
              tone={overview.data && overview.data.needingAttention > 0 ? "warning" : undefined}
            />
          </>
        )}
      </section>

      {/* Recruitment table. */}
      {list.isError ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t load running studies.{" "}
          <button type="button" onClick={() => void list.refetch()} className="underline">
            Retry
          </button>
        </p>
      ) : list.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Study
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Responses
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Last response
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Condition balance
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 pl-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row
                    key={r.studyId}
                    r={r}
                    confirmingStop={confirmStopId === r.studyId}
                    pausing={isPausing(r.studyId)}
                    stopping={isStopping(r.studyId)}
                    onPause={() => setStatus.mutate({ studyId: r.studyId, status: "paused" })}
                    onAskStop={() => setConfirmStopId(r.studyId)}
                    onConfirmStop={() => setStatus.mutate({ studyId: r.studyId, status: "closed" })}
                    onCancelStop={() => setConfirmStopId(null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {setStatus.error ? (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger)]">
              {setStatus.error.message}
            </p>
          ) : null}

          {/* Alert center — the non-healthy rows, phrased (no separate query). */}
          {alerts.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">
                Needs attention
              </h2>
              <ul className="flex flex-col gap-1.5">
                {alerts.map((r) => (
                  <li
                    key={r.studyId}
                    className={cn(
                      "rounded-[var(--radius-md)] border-l-2 px-3 py-2 text-[length:var(--text-small)]",
                      r.status === "imbalanced"
                        ? "border-l-[var(--color-danger)] bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]"
                        : "border-l-[var(--color-info)] bg-[var(--color-info-subtle)] text-[var(--color-info-text-on-subtle)]",
                    )}
                  >
                    {alertText(r)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  tone?: "warning";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <span
        className={cn(
          "font-serif text-[length:var(--text-display)] font-medium",
          tone === "warning" ? "text-[var(--color-warning-text-on-subtle)]" : "text-[var(--color-text-primary)]",
        )}
      >
        {loading ? "—" : (value ?? 0)}
      </span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}

function Row({
  r,
  confirmingStop,
  pausing,
  stopping,
  onPause,
  onAskStop,
  onConfirmStop,
  onCancelStop,
}: {
  r: RunningStudyRow;
  confirmingStop: boolean;
  pausing: boolean;
  stopping: boolean;
  onPause: () => void;
  onAskStop: () => void;
  onConfirmStop: () => void;
  onCancelStop: () => void;
}) {
  const badge = STATUS_BADGE[r.status];
  const pct = r.targetN ? Math.min(100, Math.round((r.currentN / r.targetN) * 100)) : null;

  return (
    <tr className="border-b border-[var(--color-border-subtle)] align-top text-[length:var(--text-small)]">
      {/* Study + condition count. */}
      <td className="py-3 pr-3">
        <Link
          href={`/studies/${r.studyId}/dashboard` as Route}
          className="block text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:text-[var(--color-primary)] hover:underline"
        >
          {r.title}
        </Link>
        <span className="text-[var(--color-text-muted)]">
          {r.conditionCount} condition{r.conditionCount === 1 ? "" : "s"}
        </span>
      </td>

      {/* n / target + % bar. */}
      <td className="px-3 py-3">
        <span className="text-[var(--color-text-primary)]">
          {r.currentN}
          {r.targetN != null ? ` / ${r.targetN}` : ""}
        </span>
        {pct != null ? (
          <span className="mt-1 flex items-center gap-2">
            <span
              className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% of target`}
            >
              <span className="block h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-[var(--color-text-muted)]">{pct}%</span>
          </span>
        ) : null}
      </td>

      {/* Last response. */}
      <td className="px-3 py-3 text-[var(--color-text-secondary)]">
        {r.lastResponseAt ? relativeTime(r.lastResponseAt) : "—"}
      </td>

      {/* Condition balance. */}
      <td className="px-3 py-3 text-[var(--color-text-secondary)]">
        {r.conditionBalance ? `${r.conditionBalance.min} : ${r.conditionBalance.max}` : "—"}
      </td>

      {/* Status badge — tone + text (never color-only). */}
      <td className="px-3 py-3">
        <span
          className={cn(
            "inline-block rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium",
            badge.cls,
          )}
        >
          {badge.label}
        </span>
      </td>

      {/* Actions. */}
      <td className="py-3 pl-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Link
            href={`/studies/${r.studyId}/run` as Route}
            className="rounded-[var(--radius-md)] px-2 py-1 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Run
          </Link>
          <Link
            href={`/studies/${r.studyId}/results` as Route}
            className="rounded-[var(--radius-md)] px-2 py-1 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Results
          </Link>
          <PendingButton
            variant="secondary"
            onClick={onPause}
            pending={pausing}
            idleLabel="Pause"
            pendingLabel="Pausing…"
            aria-label={`Pause recruitment for ${r.title}`}
          />
          {confirmingStop ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--color-text-secondary)]">Stop?</span>
              <PendingButton
                onClick={onConfirmStop}
                pending={stopping}
                idleLabel="Stop now"
                pendingLabel="Stopping…"
                aria-label={`Confirm stop recruitment for ${r.title}`}
              />
              <button
                type="button"
                onClick={onCancelStop}
                className="text-[var(--color-text-muted)] underline hover:opacity-80"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={onAskStop}
              aria-label={`Stop recruitment for ${r.title}`}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-1 font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Stop
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function alertText(r: RunningStudyRow): string {
  switch (r.status) {
    case "imbalanced":
      return `${r.title}: condition imbalance — ${r.conditionBalance?.min} vs ${r.conditionBalance?.max} across arms.`;
    case "target_reached":
      return `${r.title}: target reached (${r.currentN}${r.targetN != null ? ` / ${r.targetN}` : ""}) — consider closing.`;
    default:
      return r.title;
  }
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)]" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        Nothing running right now — open recruitment from a study’s Run stage.
      </p>
      <Link
        href="/studies"
        className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
      >
        Browse studies
      </Link>
    </div>
  );
}

/** Compact relative time. No Date.now in module scope — computed per render. */
function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
