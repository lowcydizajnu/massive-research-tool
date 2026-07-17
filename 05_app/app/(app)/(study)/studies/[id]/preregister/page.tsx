import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { PreflightChecklist } from "@/components/feature/run/preflight-checklist";
import { AmendButton } from "@/components/feature/preregister/amend-button";
import { LinkedOutputsPanel } from "@/components/feature/study-record/linked-outputs-panel";
import { OsfMaterialsPanel } from "@/components/feature/study-record/osf-materials-panel";
import { PushToOsfButton } from "@/components/feature/study-record/push-to-osf-button";
import { PreregisterButton } from "@/components/feature/preregister/preregister-button";
import { UnansweredQuestionsNotice } from "@/components/feature/preregister/unanswered-questions-notice";
import { RefreshOsfStatus } from "@/components/feature/preregister/refresh-osf-status";
import { PushStatusPoller } from "@/components/feature/preregister/push-status-poller";
import { RetryPushButton } from "@/components/feature/preregister/retry-push-button";
import { WithdrawRegistration } from "@/components/feature/preregister/withdraw-registration";
import { ReadOnlyBanner } from "@/components/feature/workspace/role-gate";
import { preregTemplate } from "@/lib/prereg-templates";
import { canWriteRole } from "@/lib/workspace/roles";
import { planTemplateKey } from "@/server/modules/blocks";
import { unansweredRequired, type OsfQuestion } from "@/server/modules/osf-schema";
import { registry } from "@/server/adapters/registry";
import { getCurrentDbUser } from "@/server/auth/current-db-user";
import { getServerApi } from "@/server/trpc/server";
import type {
  PreregistrationStatus,
  RegistryPushStatus,
  StudyDetail,
} from "@/server/trpc/routers/studies";

/** Banner tone + copy for each push status (preregister-stage.md · States). */
function banner(pre: PreregistrationStatus): {
  role: "status" | "alert";
  className: string;
  message: string;
} {
  const tone: Record<RegistryPushStatus, { role: "status" | "alert"; cls: string; msg: string }> = {
    pending: {
      role: "status",
      cls: "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]",
      msg: "Preregistered — pushing to OSF…",
    },
    pushed: {
      role: "status",
      cls: "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]",
      msg: "Submitted to OSF — pending your approval there to finalize.",
    },
    no_credentials: {
      role: "status",
      cls: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
      msg: "Preregistered locally — not pushed. Connect (or reconnect) OSF to push this registration: the stored token may have been revoked.",
    },
    not_pushed: {
      role: "status",
      cls: "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]",
      msg: "Preregistered locally — not pushed.",
    },
    opted_out: {
      role: "status",
      cls: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
      msg: "Preregistered locally — OSF push skipped.",
    },
    failed: {
      role: "alert",
      cls: "bg-[var(--color-danger-subtle)] text-[var(--color-danger-text-on-subtle)]",
      msg: "OSF push failed.",
    },
  };
  const t = tone[pre.pushStatus];
  return { role: t.role, className: t.cls, message: t.msg };
}

export default async function PreregisterStagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await getServerApi();

  let study: StudyDetail | null = null;
  let pre: PreregistrationStatus | null = null;
  // Whether the editable draft actually diverges from the registered plan
  // (ADR-0056 E4a) — gates the amendment affordance so non-plan updates (status,
  // materials pushed to OSF, links) don't wrongly surface "file an amendment".
  let planDiverged = false;
  try {
    study = await api.studies.get({ id });
    pre = await api.studies.getPreregistration({ studyId: id });
    planDiverged = (await api.studies.getRunInfo({ studyId: id })).divergedFromLive;
  } catch {
    study = null;
  }

  /**
   * Which of OSF's own questions are still blank (ADR-0107 D4). Read live.
   *
   * On failure this stays EMPTY and the notice does not render — the same as
   * "nothing to ask". That is the one wrong-but-safe direction available here:
   * we cannot fabricate a list we could not fetch, and the alternative (claiming
   * everything is answered) is a false all-clear before a permanent filing. The
   * questions form on Overview shows its own retry.
   */
  let unansweredOsfQuestions: OsfQuestion[] = [];
  try {
    const q = await api.studies.getTemplateQuestions({ studyId: id });
    if (q) unansweredOsfQuestions = unansweredRequired(q.questions, q.answers);
  } catch {
    unansweredOsfQuestions = [];
  }
  if (!study) notFound();

  const dbUser = await getCurrentDbUser();
  const connection = dbUser
    ? await registry.getConnection(dbUser.id)
    : { connected: false, connectedAt: null };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
        {/* Header */}
        <div className="min-w-0">
          <h1
            title={study.title}
            className="truncate font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]"
          >
            {study.title}
          </h1>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Preregister this design to the Open Science Framework.
          </p>
        </div>

        {/* Registry status row */}
        <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)]">
          <span
            className={
              "rounded-[var(--radius-sm)] px-2 py-0.5 font-medium " +
              (connection.connected
                ? "bg-[var(--color-success-subtle)] text-[var(--color-success-text-on-subtle)]"
                : "bg-[var(--color-warning-subtle)] text-[var(--color-warning-text-on-subtle)]")
            }
          >
            {connection.connected ? "OSF connected" : "OSF not connected"}
          </span>
          {!connection.connected ? (
            <span className="text-[var(--color-text-muted)]">
              Connect your OSF account in{" "}
              <Link
                href="/settings/account"
                className="underline hover:text-[var(--color-text-secondary)]"
              >
                Settings · Connections
              </Link>{" "}
              to push automatically.
            </span>
          ) : null}
        </div>

        <ReadOnlyBanner role={study.viewerRole} />
        {/* Action zone (no preregistration yet) OR receipt zone. The fieldset disables
            the write buttons for viewers; OSF links stay clickable (fieldset ignores <a>). */}
        <fieldset disabled={!canWriteRole(study.viewerRole)} className="contents">
        {pre === null ? (
          <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
            <p className="max-w-prose text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
              This saves an immutable, timestamped snapshot of your current design. You can keep
              editing your working draft afterwards.
            </p>
            {/* Which OSF registration form this plan will be filed under — chosen on
                the Overview stage (ADR-0101). Shown so the researcher is never
                surprised; it used to be picked invisibly from replication intent. */}
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Filing as{" "}
              <span className="font-medium text-[var(--color-text-secondary)]">
                {preregTemplate(planTemplateKey(study.overview)).label}
              </span>
              {" · "}
              <Link href={`/studies/${study.id}/overview` as Route} className="text-[var(--color-primary)] hover:underline">
                Change in Overview →
              </Link>
            </p>
            {/* The ONLY completeness check in the chain (ADR-0107 D4). OSF
                enforces nothing: a registration answering none of its required
                questions returns 201 and mints a DOI (observed 2026-07-17).
                Warn, never block — the researcher owns their study (owner,
                2026-07-17) — but name every blank question in OSF's own words. */}
            <UnansweredQuestionsNotice
              unanswered={unansweredOsfQuestions}
              overviewHref={`/studies/${study.id}/overview`}
            />
            {study.dataCollectionStatus === "not-started" ? (
              <PreflightChecklist studyId={study.id} mode="preregister">
                <PreregisterButton studyId={study.id} />
              </PreflightChecklist>
            ) : (
              /* Plan-before-data gate (ADR-0101). Enforced server-side in the
                 preregister mutation; the button is ABSENT rather than disabled,
                 because there is no override and offering it would be a lie.
                 Warning tone, not danger: whoever sees this got here legitimately
                 (they published rather than preregistered, then ran the study). */
              <div
                role="status"
                className="flex max-w-prose flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] p-3"
              >
                <span className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-warning-text-on-subtle)]">
                  {study.dataCollectionStatus === "finished"
                    ? "This study has already finished collecting data."
                    : "This study has already recorded participant responses."}
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-warning-text-on-subtle)]">
                  A preregistration is a plan made <em>before</em> the data exist — that&rsquo;s the guarantee it
                  carries, so it can&rsquo;t be added now. Your design is still fully shareable: save a version, or
                  publish a{" "}
                  <Link href={`/studies/${study.id}/record` as Route} className="underline">
                    Record
                  </Link>
                  .
                </span>
              </div>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-3 border-t border-[var(--color-border-subtle)] pt-4">
            <div className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              {pre.name}
            </div>
            {pre.withdrawn ? (
              <div
                role="status"
                className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-secondary)]"
              >
                Withdrawn on OSF — the registration shows a public withdrawal tombstone (title, contributors,
                justification). Its DOI still resolves.
              </div>
            ) : (
              (() => {
                const b = banner(pre);
                return (
                  <div
                    role={b.role}
                    className={"rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-small)] " + b.className}
                  >
                    {b.message}
                  </div>
                );
              })()
            )}
            {pre.pushStatus === "pending" ? <PushStatusPoller studyId={study.id} /> : null}
            {pre.url ? (
              <a
                href={pre.url}
                target="_blank"
                rel="noreferrer"
                className="w-fit text-[length:var(--text-small)] underline hover:text-[var(--color-text-secondary)]"
              >
                View on OSF →
              </a>
            ) : null}
            {/* Available while live on OSF (not just before the DOI) so the
                researcher can also pull a finalized withdrawal back in. */}
            {pre.pushStatus === "pushed" && !pre.withdrawn ? (
              <RefreshOsfStatus studyId={study.id} />
            ) : null}
            {pre.pushStatus === "pushed" ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {pre.doi ? `DOI: ${pre.doi}` : "DOI: minted by OSF once you approve the registration there."}
              </p>
            ) : null}
            {pre.pushStatus === "failed" && pre.lastError ? (
              <p className="max-w-prose truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {pre.lastError}
              </p>
            ) : null}
            {pre.pushStatus === "no_credentials" ? (
              <Link
                href="/settings/account"
                className="w-fit text-[length:var(--text-small)] underline hover:text-[var(--color-text-secondary)]"
              >
                Connect OSF in Settings →
              </Link>
            ) : null}
            {pre.pushStatus === "failed" ||
            pre.pushStatus === "no_credentials" ||
            pre.pushStatus === "pending" ? (
              <RetryPushButton studyId={study.id} />
            ) : null}

            {pre.amends !== null ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Amends v{pre.amends}
                {pre.changeSummary ? ` — ${pre.changeSummary}` : ""}
              </p>
            ) : null}

            {/* Push a non-plan record update to the OSF project (ADR-0056 E4b) —
                lives here too, since this is where OSF is managed. Self-hides
                until there's an OSF project; never an amendment. */}
            {!pre.withdrawn ? (
              <div className="border-t border-[var(--color-border-subtle)] pt-3">
                <PushToOsfButton studyId={study.id} />
              </div>
            ) : null}

            {/* Materials → OSF here too (ADR-0094): once a preregistration exists
                an OSF project does, so you can push stimuli + design + protocol
                before the study opens, and re-push later. Self-hides otherwise. */}
            {!pre.withdrawn ? (
              <div className="border-t border-[var(--color-border-subtle)] pt-3">
                <OsfMaterialsPanel studyId={study.id} />
                <LinkedOutputsPanel studyId={study.id} />
              </div>
            ) : null}

            {/* Amendment is for changes to the REGISTERED PLAN only (ADR-0056 E4a).
                It surfaces only when the editable draft actually diverges from the
                live preregistered version — so non-plan updates (recruitment status,
                materials, links, the study record) don't wrongly prompt an
                amendment. Hidden once withdrawn — there's nothing live to amend. */}
            {!pre.withdrawn && planDiverged ? (
              <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-3">
                <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  Your draft changes the registered plan. To make those changes part of the record, file an amendment —
                  it freezes the current draft as a superseding preregistered version and re-files it on OSF.
                </p>
                <PreflightChecklist studyId={study.id} mode="preregister">
                  <AmendButton studyId={study.id} />
                </PreflightChecklist>
              </div>
            ) : !pre.withdrawn ? (
              <p className="border-t border-[var(--color-border-subtle)] pt-3 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Your draft matches the preregistration. Non-plan updates — recruitment status, materials, links, the
                study record — don’t need an amendment; only changes to the registered plan do.
              </p>
            ) : null}

            {/* Withdraw (retract) the pushed registration on OSF (ADR-0005 am. 3).
                Only once it's actually on OSF and not already withdrawn; irreversible,
                so it confirms first. */}
            {pre.pushStatus === "pushed" && !pre.withdrawn ? (
              <WithdrawRegistration studyId={study.id} />
            ) : null}
          </section>
        )}
        </fieldset>
      </div>
    </main>
  );
}
