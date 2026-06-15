"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PreflightChecklist } from "@/components/feature/run/preflight-checklist";
import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import type { RunInfo } from "@/server/trpc/routers/studies";

/**
 * Run stage (serves the run-a-study JTBD). Opens recruitment for the
 * preregistered version and surfaces the recruitment link Hanna pastes into
 * Prolific (provider integration is V1.6), plus a Preview link. Pause/close are
 * V1.6 — V1.5 opens and shares.
 */
export function RunPanel({
  studyId,
  info,
  recruitmentUrl,
  previewUrl,
}: {
  studyId: string;
  info: RunInfo;
  recruitmentUrl: string;
  previewUrl: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const open = api.studies.openRecruitment.useMutation({ onSuccess: () => router.refresh() });
  const publish = api.studies.publish.useMutation({ onSuccess: () => router.refresh() });
  const setStatus = api.studies.setRecruitmentStatus.useMutation({
    onSuccess: () => {
      setConfirmStop(false);
      router.refresh();
    },
  });
  const status = info.recruitment?.status;
  const n = info.recruitment?.currentN ?? 0;
  const responsesLabel = `${n} response${n === 1 ? "" : "s"} collected`;

  if (!info.runnable) {
    return (
      <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          To run a study you freeze an immutable version participants take (your editable draft is
          never run directly). Two ways to freeze:
        </p>
        <PreflightChecklist studyId={studyId} mode="publish">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/studies/${studyId}/preregister`}
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
            >
              Preregister (to OSF) →
            </Link>
            <PendingButton
              variant="secondary"
              onClick={() => publish.mutate({ studyId })}
              pending={publish.isPending}
              idleLabel="Publish & run (no OSF)"
              pendingLabel="Publishing…"
            />
          </div>
        </PreflightChecklist>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Preregister is the open-science path; Publish &amp; run is for pilots and exploratory work.
        </p>
      </section>
    );
  }

  if (!info.recruitment) {
    return (
      <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          Open recruitment to get a link you can share with participants (e.g. paste into Prolific).
          You can preview the study yourself first.
        </p>
        <div className="flex flex-wrap gap-2">
          <PendingButton
            onClick={() => open.mutate({ studyId })}
            pending={open.isPending}
            idleLabel="Open recruitment"
            pendingLabel="Opening…"
          />
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Preview
          </a>
        </div>
      </section>
    );
  }

  // Paused — new participants are blocked (the /take link reads as closed) but
  // every collected response is kept; resume reopens the same session.
  if (status === "paused") {
    return (
      <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <div className="flex items-center gap-2 text-[length:var(--text-small)]">
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] px-2 py-0.5 font-medium text-[var(--color-warning-text-on-subtle)]">
            Paused
          </span>
          <span className="text-[var(--color-text-muted)]">{responsesLabel}</span>
        </div>
        <p className="max-w-prose text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Recruitment is paused — the link is inactive and no new participants can start. Your data is safe; resume any time.
        </p>
        <div className="flex flex-wrap gap-2">
          <PendingButton
            onClick={() => setStatus.mutate({ studyId, status: "open" })}
            pending={setStatus.isPending}
            idleLabel="Resume recruitment"
            pendingLabel="Resuming…"
          />
          <button
            type="button"
            onClick={() => setStatus.mutate({ studyId, status: "closed" })}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Stop collecting
          </button>
        </div>
        {info.divergedFromLive && info.versionKind ? (
          <MakeLiveControl
            studyId={studyId}
            versionKind={info.versionKind}
            liveVersionNumber={info.liveVersionNumber}
          />
        ) : null}
      </section>
    );
  }

  // Closed — terminal; data is retained and Results stays available. Reopen
  // collects more responses on the same frozen version.
  if (status === "closed") {
    return (
      <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <div className="flex items-center gap-2 text-[length:var(--text-small)]">
          <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 font-medium text-[var(--color-text-secondary)]">
            Closed
          </span>
          <span className="text-[var(--color-text-muted)]">{responsesLabel}</span>
        </div>
        <p className="max-w-prose text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Recruitment is closed — no new participants can start. Your results stay available below. You can reopen to collect more.
        </p>
        <PendingButton
          variant="secondary"
          onClick={() => setStatus.mutate({ studyId, status: "open" })}
          pending={setStatus.isPending}
          idleLabel="Reopen recruitment"
          pendingLabel="Reopening…"
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 border-t border-[var(--color-border-subtle)] pt-4">
      <div className="flex items-center gap-2 text-[length:var(--text-small)]">
        <span className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle)] px-2 py-0.5 font-medium text-[var(--color-success-text-on-subtle)]">
          Recruiting
        </span>
        <span className="text-[var(--color-text-muted)]">
          {info.recruitment.currentN} response{info.recruitment.currentN === 1 ? "" : "s"} collected
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
          Recruitment link
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={recruitmentUrl}
            className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-3 py-1.5 font-mono text-[length:var(--text-small)] text-[var(--color-text-primary)]"
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(recruitmentUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Paste this into your recruitment platform. Participants are assigned a condition at random.
        </p>
      </div>

      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="w-fit text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
      >
        Preview as a participant (no data recorded) →
      </a>

      {info.divergedFromLive && info.versionKind ? (
        <MakeLiveControl
          studyId={studyId}
          versionKind={info.versionKind}
          liveVersionNumber={info.liveVersionNumber}
        />
      ) : null}

      {/* Stop / Pause — non-destructive; both gate the link, keeping all data. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-subtle)] pt-3">
        <PendingButton
          variant="secondary"
          onClick={() => setStatus.mutate({ studyId, status: "paused" })}
          pending={setStatus.isPending && setStatus.variables?.status === "paused"}
          idleLabel="Pause"
          pendingLabel="Pausing…"
        />
        {confirmStop ? (
          <span className="flex items-center gap-2 text-[length:var(--text-small)]">
            <span className="text-[var(--color-text-secondary)]">Stop collecting responses?</span>
            <PendingButton
              onClick={() => setStatus.mutate({ studyId, status: "closed" })}
              pending={setStatus.isPending && setStatus.variables?.status === "closed"}
              idleLabel="Stop now"
              pendingLabel="Stopping…"
            />
            <button
              type="button"
              onClick={() => setConfirmStop(false)}
              className="text-[var(--color-text-muted)] underline hover:opacity-80"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmStop(true)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
          >
            Stop collecting
          </button>
        )}
      </div>
    </section>
  );
}

type Classification = "" | "typo" | "methodological-correction" | "clarification" | "scope-change" | "other";

/**
 * Make-live control (ADR-0044) — shown in the recruiting/paused branches only
 * when the draft diverges from the live version. One action that freezes the
 * draft and switches recruitment to it (server `studies.makeLive`). For a
 * preregistered study it collects the required amendment summary inline (the
 * change is filed as an ADR-0004 amendment + re-pushed to OSF); for a published
 * study it's a one-step confirm. The recruitment link is unchanged.
 */
function MakeLiveControl({
  studyId,
  versionKind,
  liveVersionNumber,
}: {
  studyId: string;
  versionKind: "preregistered" | "published";
  liveVersionNumber: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [classification, setClassification] = useState<Classification>("");
  const makeLive = api.studies.makeLive.useMutation({
    onSuccess: () => {
      setOpen(false);
      setSummary("");
      setClassification("");
      router.refresh();
    },
  });
  const isPrereg = versionKind === "preregistered";
  const canSubmit = !isPrereg || summary.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning-subtle)] bg-[var(--color-warning-subtle)] p-3">
      <p className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
        <strong className="font-medium">You have unpublished edits.</strong> New participants get the
        frozen {versionKind} version {liveVersionNumber}. Make your edits live to switch new
        participants to a fresh version — anyone in progress finishes on v{liveVersionNumber}, and
        your existing responses stay in Results.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
        >
          Make these edits live
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {isPrereg ? (
            <>
              <label
                htmlFor="make-live-summary"
                className="text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]"
              >
                What changed? (filed as an amendment to your preregistration)
              </label>
              <textarea
                id="make-live-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                placeholder="e.g. Fixed a broken stimulus URL in the treatment condition"
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
              />
              <select
                aria-label="Amendment classification (optional)"
                value={classification}
                onChange={(e) => setClassification(e.target.value as Classification)}
                className="w-fit rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
              >
                <option value="">Classification (optional)</option>
                <option value="typo">Typo</option>
                <option value="methodological-correction">Methodological correction</option>
                <option value="clarification">Clarification</option>
                <option value="scope-change">Scope change</option>
                <option value="other">Other</option>
              </select>
            </>
          ) : (
            <p className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
              This publishes a new version and switches recruitment to it.
            </p>
          )}
          <div className="flex items-center gap-2">
            <PendingButton
              onClick={() =>
                makeLive.mutate({
                  studyId,
                  ...(isPrereg
                    ? {
                        changeSummary: summary.trim(),
                        classification: classification || undefined,
                      }
                    : {}),
                })
              }
              pending={makeLive.isPending}
              disabled={!canSubmit}
              idleLabel={isPrereg ? "File amendment & make live" : "Make live"}
              pendingLabel="Making live…"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[length:var(--text-small)] text-[var(--color-text-muted)] underline hover:opacity-80"
            >
              Cancel
            </button>
          </div>
          {makeLive.error ? (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger)]">
              {makeLive.error.message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
