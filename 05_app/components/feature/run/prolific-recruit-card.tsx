"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { canWriteRole, READ_ONLY_TITLE, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import { LANGUAGES, PROLIFIC_COUNTRIES, countryName } from "@/lib/iso-countries";

/**
 * Run-stage Prolific recruitment (V1.15 P1b). When the study is runnable and the
 * researcher has a Prolific connection, create + publish a Prolific study from
 * here: country/language eligibility (the common filters; everything else via
 * the "More filters →" deeplink), reward, target N. Eligibility is sent to
 * Prolific via the adapter's createStudy. Viewers are read-only.
 */
export function ProlificRecruitCard({ studyId, studyTitle }: { studyId: string; studyTitle: string }) {
  const { canWrite } = useWorkspaceRole();
  const connections = api.recruitment.connections.list.useQuery();
  const providerStudy = api.recruitment.getProviderStudy.useQuery({ studyId });
  const connected = (connections.data ?? []).some((c) => c.provider === "prolific" && c.status === "active");

  if (connections.isLoading || providerStudy.isLoading) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div>
        <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Recruit on Prolific</h2>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Create a Prolific study pointing at this study&rsquo;s recruitment link — no more pasting URLs by hand.
        </p>
      </div>

      {!connected ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          Connect Prolific in{" "}
          <Link href={"/participants/connections" as Route} className="text-[var(--color-primary)] underline">
            Participants · Connections
          </Link>{" "}
          to recruit automatically.
        </p>
      ) : providerStudy.data?.providerStudyId ? (
        <LiveState studyId={studyId} url={providerStudy.data.providerStudyUrl} status={providerStudy.data.status} canWrite={canWrite} />
      ) : (
        <CreateForm studyId={studyId} studyTitle={studyTitle} canWrite={canWrite} />
      )}
    </section>
  );
}

/** Provider lifecycle state → badge label + token classes. */
const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Live on Prolific", cls: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]" },
  paused: { label: "Paused on Prolific", cls: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]" },
  awaiting_review: { label: "Recruited — awaiting review", cls: "bg-[var(--color-info-subtle)] text-[var(--color-info-text-on-subtle)]" },
  completed: { label: "Completed on Prolific", cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]" },
  unpublished: { label: "Not yet live", cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]" },
  unknown: { label: "On Prolific", cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]" },
};

function LiveState({
  studyId,
  url,
  status,
  canWrite,
}: {
  studyId: string;
  url: string;
  status: "live" | "stopped";
  canWrite: boolean;
}) {
  const utils = api.useUtils();
  // Reconciles the live provider status + submissions on read; refetch on focus
  // + every 30s while live so it moves without a manual reload (full live-push
  // is the P2 webhook). Falls back to the stored status when not yet loaded.
  const progress = api.recruitment.openRecruitment.forStudy.useQuery(
    { studyId },
    { refetchOnWindowFocus: true, refetchInterval: status === "live" ? 30_000 : false },
  );
  const stop = api.recruitment.stopProviderStudy.useMutation({
    onSuccess: () => {
      void utils.recruitment.getProviderStudy.invalidate({ studyId });
      void utils.recruitment.openRecruitment.forStudy.invalidate({ studyId });
    },
  });

  const state = progress.data?.state ?? (status === "live" ? "active" : "unknown");
  const badge = STATE_BADGE[state] ?? STATE_BADGE.unknown;
  const counts = progress.data?.counts;
  const placesTaken = progress.data?.placesTaken ?? null;
  const totalPlaces = progress.data?.totalPlaces ?? null;
  // Stop is meaningful while the provider study is still recruiting.
  const canStop = state === "active" || state === "paused" || (!progress.data && status === "live");

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[length:var(--text-small)]">
          <span className={"rounded-[var(--radius-sm)] px-1.5 py-0.5 font-medium " + badge.cls}>{badge.label}</span>
          {totalPlaces ? (
            <span className="text-[var(--color-text-secondary)]">
              {placesTaken ?? 0} / {totalPlaces} recruited
            </span>
          ) : null}
          <a href={url} target="_blank" rel="noreferrer" className="text-[var(--color-text-secondary)] underline hover:opacity-80">
            Open on Prolific →
          </a>
        </span>
        {canStop ? (
          <button
            type="button"
            disabled={!canWrite || stop.isPending}
            title={canWrite ? undefined : READ_ONLY_TITLE}
            onClick={() => {
              if (window.confirm("Stop this study on Prolific? No new participants will be recruited."))
                stop.mutate({ studyId, provider: "prolific" });
            }}
            className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-40"
          >
            {stop.isPending ? "Stopping…" : "Stop on Prolific"}
          </button>
        ) : null}
      </div>

      {counts && counts.total > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <CountStat n={counts.started} label="Started" />
          <CountStat n={counts.submitted} label="Awaiting review" />
          <CountStat n={counts.approved} label="Approved" />
          <CountStat n={counts.rejected} label="Rejected" />
          <CountStat n={counts.timedOut} label="Timed out" />
        </div>
      ) : progress.isLoading ? (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading submissions…</p>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No submissions yet. Counts appear here as participants take the study.
        </p>
      )}
    </div>
  );
}

function CountStat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{n}</span>
      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</span>
    </div>
  );
}

function CreateForm({ studyId, studyTitle, canWrite }: { studyId: string; studyTitle: string; canWrite: boolean }) {
  const utils = api.useUtils();
  const [title, setTitle] = useState(studyTitle);
  const [targetN, setTargetN] = useState(50);
  const [amount, setAmount] = useState(1.5);
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("GBP");
  const [countries, setCountries] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = api.recruitment.createProviderStudy.useMutation({
    onSuccess: () => {
      setErr(null);
      void utils.recruitment.getProviderStudy.invalidate({ studyId });
    },
    onError: (e) => setErr(e.message),
  });

  const toggle = (list: string[], set: (v: string[]) => void, code: string) =>
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);

  const visibleCountries = PROLIFIC_COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countryFilter.trim().toLowerCase()),
  );

  return (
    <fieldset disabled={!canWrite} className="flex flex-col gap-4 border-0 p-0">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Prolific study title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Participants (target N)</span>
          <input
            type="number"
            min={1}
            value={targetN}
            onChange={(e) => setTargetN(Math.max(1, Number(e.target.value) || 1))}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Reward per participant</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.1}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className="w-24 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "USD" | "EUR" | "GBP")}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            >
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Languages</span>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <label key={l.code} className="flex items-center gap-1 text-[length:var(--text-small)]">
                <input type="checkbox" checked={languages.includes(l.code)} onChange={() => toggle(languages, setLanguages, l.code)} className="size-3.5 accent-[var(--color-primary)]" />
                {l.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          Countries {countries.length ? `(${countries.length} selected)` : "(all Prolific countries)"}
        </span>
        <input
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          placeholder="Filter countries…"
          aria-label="Filter countries"
          className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
        />
        <div className="flex max-h-40 flex-wrap content-start gap-x-4 gap-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2">
          {visibleCountries.map((c) => (
            <label key={c.code} className="flex w-40 items-center gap-1 text-[length:var(--text-small)] text-[var(--color-text-primary)]">
              <input type="checkbox" checked={countries.includes(c.code)} onChange={() => toggle(countries, setCountries, c.code)} className="size-3.5 accent-[var(--color-primary)]" />
              <span aria-hidden>{c.flag}</span> {c.name}
            </label>
          ))}
        </div>
        <a
          href="https://app.prolific.com/researcher/studies"
          target="_blank"
          rel="noreferrer"
          className="w-fit text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
        >
          More eligibility filters (age, profession, …) on Prolific →
        </a>
      </div>

      <div className="flex items-center gap-3">
        <PendingButton
          onClick={() =>
            create.mutate({
              studyId,
              provider: "prolific",
              title,
              description: "",
              targetN,
              reward: { amount, currency },
              eligibility: { country: countries, language: languages },
            })
          }
          disabled={!title.trim()}
          pending={create.isPending}
          idleLabel="Create & publish on Prolific"
          pendingLabel="Creating…"
          className="w-fit px-4 py-1.5"
        />
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {countries.length ? countries.map(countryName).slice(0, 3).join(", ") : "All countries"}
          {countries.length > 3 ? ` +${countries.length - 3}` : ""}
        </span>
      </div>
      {err ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          {err}
        </p>
      ) : null}
    </fieldset>
  );
}
