"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";

/**
 * Workspace AI provider key (ADR-0061 / ADR-0006 BYO-key). Paste an Anthropic
 * (Claude) API key — validated against Anthropic, encrypted at rest, stored per
 * workspace, used by AI blocks. Mirrors the recruitment-provider connection UX;
 * the key is never read back (masked hint only). Write-gated to non-viewers.
 */
export function AiProviderSettings() {
  const utils = api.useUtils();
  const active = api.workspace.active.useQuery();
  const canManage = (active.data?.role ?? "viewer") !== "viewer";
  const list = api.ai.connections.list.useQuery();
  const anthropic = (list.data ?? []).find((c) => c.provider === "anthropic") ?? null;

  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => void utils.ai.connections.list.invalidate();
  const connect = api.ai.connections.connect.useMutation({
    onSuccess: () => {
      setKey("");
      setErr(null);
      refresh();
    },
    onError: (e) => setErr(e.message),
  });
  const disconnect = api.ai.connections.disconnect.useMutation({ onSuccess: refresh });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          <Sparkles className="size-4 text-[var(--color-primary)]" aria-hidden />
          Anthropic (Claude)
        </span>
        {anthropic ? (
          <span className="rounded-full bg-[var(--color-success-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">
            Connected
          </span>
        ) : (
          <span className="rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Not connected
          </span>
        )}
      </div>

      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        AI blocks (e.g. the conversation block) use your own Anthropic key, so usage is billed to your
        account. The key is validated, encrypted at rest, and never shown again.
      </p>

      {anthropic ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
            Key ending •••• {anthropic.keyHint ?? "????"} · added{" "}
            {new Date(anthropic.connectedAt).toLocaleDateString()}
          </span>
          {canManage && (
            <button
              type="button"
              onClick={() => disconnect.mutate({ provider: "anthropic" })}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            >
              Disconnect
            </button>
          )}
        </div>
      ) : canManage ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-3 py-2 font-mono text-[length:var(--text-small)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
            <PendingButton
              pending={connect.isPending}
              onClick={() => key.trim() && connect.mutate({ provider: "anthropic", apiKey: key.trim() })}
              idleLabel="Connect"
              pendingLabel="Checking…"
              className="px-3 py-2 text-[length:var(--text-small)]"
            />
          </div>
          {err && (
            <p className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">{err}</p>
          )}
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Get a key at console.anthropic.com → API Keys.
          </p>
        </div>
      ) : (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Ask a workspace admin to connect an AI provider.
        </p>
      )}
    </div>
  );
}
