"use client";

import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { canWriteRole, READ_ONLY_TITLE, ReadOnlyBanner, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import type { RecruitmentConnectionDTO } from "@/server/trpc/routers/recruitment";

/**
 * Participants · Connections (V1.15 / participants-connections.md). Connect a
 * recruitment provider with a Personal Access Token (PAT-first, ADR-0047).
 * Prolific is live; Sona + CloudResearch are disabled placeholders. Viewers are
 * read-only (T3.5).
 */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ConnectionsView({ initial }: { initial: RecruitmentConnectionDTO[] }) {
  const { role, canWrite } = useWorkspaceRole();
  const { data: connections } = api.recruitment.connections.list.useQuery(undefined, { initialData: initial });
  const prolific = (connections ?? []).find((c) => c.provider === "prolific") ?? null;

  return (
    <section className="flex flex-col gap-4">
      <ReadOnlyBanner role={role} />

      <ProviderCard
        name="Prolific"
        description="Global participant pool — pay-per-response recruitment for online studies."
        connection={prolific}
        canWrite={canWrite}
      />

      <PlaceholderCard
        name="CloudResearch"
        description="US-focused recruitment. Coming after Prolific."
        badge="Coming later"
      />
      <PlaceholderCard
        name="Sona Systems"
        description="Polish university subject pools — credit-based recruitment for psychology students (UJ, UW, SWPS, AGH, …)."
        badge="Coming in V1.17"
        feedback
      />
    </section>
  );
}

function StatusPill({ connection }: { connection: RecruitmentConnectionDTO | null }) {
  if (!connection) {
    return (
      <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
        Not connected
      </span>
    );
  }
  if (connection.status === "error") {
    return (
      <span className="rounded-[var(--radius-sm)] bg-[var(--color-warning-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-warning-text-on-subtle)]">
        Reconnect needed
      </span>
    );
  }
  return (
    <span className="rounded-[var(--radius-sm)] bg-[var(--color-success-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-success-text-on-subtle)]">
      Connected
    </span>
  );
}

function ProviderCard({
  name,
  description,
  connection,
  canWrite,
}: {
  name: string;
  description: string;
  connection: RecruitmentConnectionDTO | null;
  canWrite: boolean;
}) {
  const utils = api.useUtils();
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => void utils.recruitment.connections.list.invalidate();

  const connect = api.recruitment.connections.connect.useMutation({
    onSuccess: () => {
      setToken("");
      setErr(null);
      refresh();
    },
    onError: (e) => setErr(e.message),
  });
  const disconnect = api.recruitment.connections.disconnect.useMutation({ onSuccess: refresh });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">{name}</h2>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{description}</p>
        </div>
        <StatusPill connection={connection} />
      </div>

      {connection ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-3">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Connected {shortDate(connection.connectedAt)}
            {connection.providerUserId ? ` · ${connection.providerUserId}` : ""}
            {connection.status === "error" && connection.lastError ? ` · ${connection.lastError}` : ""}
          </span>
          <button
            type="button"
            disabled={!canWrite || disconnect.isPending}
            title={canWrite ? undefined : READ_ONLY_TITLE}
            onClick={() => {
              if (window.confirm(`Disconnect ${name}? Studies already on ${name} are unaffected.`))
                disconnect.mutate({ provider: "prolific" });
            }}
            className="rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger-text-on-subtle)] disabled:opacity-40"
          >
            {connection.status === "error" ? "Reconnect" : disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : null}

      {!connection || connection.status === "error" ? (
        <fieldset disabled={!canWrite} className="flex flex-col gap-2 border-0 p-0">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
              Personal Access Token
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={canWrite ? "Paste your Prolific token" : "View-only access"}
              className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
            />
          </label>
          <div className="flex items-center gap-3">
            <PendingButton
              onClick={() => connect.mutate({ provider: "prolific", accessToken: token })}
              disabled={!token.trim()}
              pending={connect.isPending}
              idleLabel="Connect"
              pendingLabel="Connecting…"
              className="w-fit px-4 py-1.5"
            />
            <a
              href="https://app.prolific.com/researcher/account/api-tokens"
              target="_blank"
              rel="noreferrer"
              className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
            >
              Where do I find my token?
            </a>
          </div>
          {err ? (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
              {err}
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

function PlaceholderCard({
  name,
  description,
  badge,
  feedback,
}: {
  name: string;
  description: string;
  badge: string;
  feedback?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-4 opacity-90">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)]">{name}</h2>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{description}</p>
        </div>
        <span className="rounded-[var(--radius-sm)] bg-[var(--color-surface-canvas)] px-1.5 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]">
          {badge}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="cursor-default rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)] opacity-60"
        >
          Connect
        </button>
        {feedback ? (
          <a
            href="mailto:lowcydizajnu@gmail.com?subject=Prioritize%20Sona%20Systems%20integration"
            className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] underline hover:opacity-80"
          >
            Tell us if you want this prioritized
          </a>
        ) : null}
      </div>
    </div>
  );
}
