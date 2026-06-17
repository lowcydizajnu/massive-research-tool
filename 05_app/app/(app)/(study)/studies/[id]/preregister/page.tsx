import Link from "next/link";
import { notFound } from "next/navigation";

import { StageTabs } from "@/components/chrome/stage-tabs";
import { PreflightChecklist } from "@/components/feature/run/preflight-checklist";
import { AmendButton } from "@/components/feature/preregister/amend-button";
import { PreregisterButton } from "@/components/feature/preregister/preregister-button";
import { RefreshOsfStatus } from "@/components/feature/preregister/refresh-osf-status";
import { PushStatusPoller } from "@/components/feature/preregister/push-status-poller";
import { RetryPushButton } from "@/components/feature/preregister/retry-push-button";
import { WithdrawRegistration } from "@/components/feature/preregister/withdraw-registration";
import { ReadOnlyBanner } from "@/components/feature/workspace/role-gate";
import { canWriteRole } from "@/lib/workspace/roles";
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
  try {
    study = await api.studies.get({ id });
    pre = await api.studies.getPreregistration({ studyId: id });
  } catch {
    study = null;
  }
  if (!study) notFound();

  const dbUser = await getCurrentDbUser();
  const connection = dbUser
    ? await registry.getConnection(dbUser.id)
    : { connected: false, connectedAt: null };

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      <StageTabs studyId={study.id} active="Preregister" />

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
            <PreflightChecklist studyId={study.id} mode="preregister">
              <PreregisterButton studyId={study.id} />
            </PreflightChecklist>
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

            {/* File a new amendment — freezes the current draft as a superseding
                preregistered version (ADR-0004). Same pre-flight gate as preregister.
                Hidden once withdrawn — there's nothing live to amend. */}
            {!pre.withdrawn ? (
              <div className="border-t border-[var(--color-border-subtle)] pt-3">
                <PreflightChecklist studyId={study.id} mode="preregister">
                  <AmendButton studyId={study.id} />
                </PreflightChecklist>
              </div>
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
