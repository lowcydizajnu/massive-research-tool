"use client";

import { AudioLines, Sparkles, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import type { AiConnectionDTO } from "@/server/trpc/routers/ai";

/**
 * Workspace AI provider keys (ADR-0066 / ADR-0067 / ADR-0061 BYO-key). A card per
 * provider — paste your own key(s), validated against the CORRECT vendor, encrypted
 * at rest, stored per workspace, never read back (masked hint + status only). Hume
 * takes three keys + a Test action. Write-gated to non-viewers.
 * Wireframe: 03_design/wireframes/settings-ai-connections.md.
 */

type ProviderKey = "anthropic" | "hume";
type FieldSpec = {
  name: "apiKey" | "secretKey" | "webhookSigningKey";
  label: string;
  placeholder: string;
  help: string;
};
type ProviderSpec = {
  provider: ProviderKey;
  label: string;
  icon: LucideIcon;
  blurb: string;
  fields: FieldSpec[];
};

const PROVIDERS: ProviderSpec[] = [
  {
    provider: "anthropic",
    label: "Anthropic (Claude)",
    icon: Sparkles,
    blurb:
      "Text AI blocks (e.g. the conversation block) use your own Anthropic key, so usage is billed to your account.",
    fields: [
      { name: "apiKey", label: "API key", placeholder: "sk-ant-…", help: "Get a key at console.anthropic.com → API Keys." },
    ],
  },
  {
    provider: "hume",
    label: "Hume (emotion + voice)",
    icon: AudioLines,
    blurb:
      "Powers voice/text emotion analysis, emotional speech, and voice conversations (V2.1). Hume issues three keys — get all three at platform.hume.ai → Settings → Keys.",
    fields: [
      { name: "apiKey", label: "API key", placeholder: "Hume API key", help: "Used for emotion + speech HTTP calls." },
      { name: "secretKey", label: "Secret key", placeholder: "Hume Secret key", help: "Paired with the API key for voice (EVI)." },
      {
        name: "webhookSigningKey",
        label: "Webhook signing key",
        placeholder: "Hume Webhook signing key",
        help: "Validates incoming Hume events.",
      },
    ],
  },
];

export function AiProviderSettings() {
  const active = api.workspace.active.useQuery();
  const canManage = (active.data?.role ?? "viewer") !== "viewer";
  const list = api.ai.connections.list.useQuery();
  const byProvider = new Map((list.data ?? []).map((c) => [c.provider, c]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">AI providers</h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Connect your own provider keys; usage is billed to your account. Keys are encrypted at rest and never shown again.
        </p>
      </div>
      {PROVIDERS.map((spec) => (
        <ProviderCard
          key={spec.provider}
          spec={spec}
          connection={byProvider.get(spec.provider) ?? null}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function StatusPill({ connection }: { connection: AiConnectionDTO | null }) {
  if (connection?.status === "error") {
    return (
      <span className="rounded-full bg-[var(--color-danger-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Needs attention
      </span>
    );
  }
  if (connection) {
    return (
      <span className="rounded-full bg-[var(--color-success-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
        Connected
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      Not connected
    </span>
  );
}

function ProviderCard({
  spec,
  connection,
  canManage,
}: {
  spec: ProviderSpec;
  connection: AiConnectionDTO | null;
  canManage: boolean;
}) {
  const utils = api.useUtils();
  const Icon = spec.icon;
  const refresh = () => void utils.ai.connections.list.invalidate();

  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const labelId = `ai-provider-${spec.provider}`;

  const connect = api.ai.connections.connect.useMutation({
    onSuccess: () => {
      setValues({});
      setErr(null);
      refresh();
    },
    onError: (e) => setErr(e.message),
  });
  const disconnect = api.ai.connections.disconnect.useMutation({
    onSuccess: () => {
      setTestMsg(null);
      refresh();
    },
  });
  const test = api.ai.connections.test.useMutation({
    onSuccess: (res) => {
      setTestMsg(
        res.ok
          ? { ok: true, text: res.account ? `Connected as ${res.account}` : "Connection OK." }
          : { ok: false, text: `Couldn't reach ${spec.label} — check the key.` },
      );
      refresh();
    },
    onError: () => setTestMsg({ ok: false, text: `Couldn't reach ${spec.label} — check the key.` }),
  });

  const allFilled = spec.fields.every((f) => (values[f.name] ?? "").trim().length > 0);
  const submit = () => {
    if (!allFilled) return;
    const payload: Record<string, string> = { provider: spec.provider };
    for (const f of spec.fields) payload[f.name] = (values[f.name] ?? "").trim();
    connect.mutate(payload as Parameters<typeof connect.mutate>[0]);
  };

  return (
    <section
      aria-labelledby={labelId}
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          id={labelId}
          className="flex items-center gap-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
        >
          <Icon className="size-4 text-[var(--color-primary)]" aria-hidden />
          {spec.label}
        </span>
        <StatusPill connection={connection} />
      </div>

      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{spec.blurb}</p>

      {connection ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
              Key ending •••• {connection.keyHint ?? "????"} · added {new Date(connection.connectedAt).toLocaleDateString()}
            </span>
            {canManage && (
              <span className="flex items-center gap-2">
                <PendingButton
                  pending={test.isPending}
                  variant="secondary"
                  onClick={() => test.mutate({ provider: spec.provider })}
                  idleLabel="Test"
                  pendingLabel="Testing…"
                  className="px-2.5 py-1 text-[length:var(--text-small)]"
                />
                <button
                  type="button"
                  onClick={() => disconnect.mutate({ provider: spec.provider })}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  Disconnect
                </button>
              </span>
            )}
          </div>
          {testMsg && (
            <p
              aria-live="polite"
              className={`text-[length:var(--text-small)] ${
                testMsg.ok ? "text-[var(--color-success-text-on-subtle)]" : "text-[var(--color-danger-text-on-subtle)]"
              }`}
            >
              {testMsg.text}
            </p>
          )}
          {spec.provider === "hume" && (
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Test checks the API key. The Secret + Webhook keys are exercised by voice features.
            </p>
          )}
        </>
      ) : canManage ? (
        <div className="flex flex-col gap-3">
          {spec.fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">{f.label}</span>
              <input
                type="password"
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                autoComplete="off"
                className="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 font-mono text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              />
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{f.help}</span>
            </label>
          ))}
          <div className="flex items-center gap-2">
            <PendingButton
              pending={connect.isPending}
              onClick={submit}
              disabled={!allFilled}
              aria-disabled={!allFilled}
              idleLabel="Connect"
              pendingLabel="Checking…"
              className="px-3 py-2 text-[length:var(--text-small)]"
            />
            {!allFilled && spec.fields.length > 1 && (
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Enter all three keys to connect.</span>
            )}
          </div>
          {err && <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{err}</p>}
        </div>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Ask a workspace admin to connect an AI provider.
        </p>
      )}
    </section>
  );
}
