"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Replicate a public study (ADR-0018) — now asks the replication KIND first
 * (ADR-0039, replicate-a-study.md): the intent stores with the protocol and
 * Replication Recipe sections are injected into the fork's Overview. Skippable
 * ("replicate without declaring") — never block the researcher.
 */
const INTENTS = [
  {
    key: "direct" as const,
    label: "Direct",
    detail: "Follow the original as exactly as possible — differences need justification.",
  },
  {
    key: "conceptual" as const,
    label: "Conceptual",
    detail: "Test the same claim with a different operationalization.",
  },
  {
    key: "extension" as const,
    label: "Extension",
    detail: "The original plus new conditions or measures.",
  },
];

export function ReplicateButton({ studyId, className }: { studyId: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<"direct" | "conceptual" | "extension">("direct");
  const [target, setTarget] = useState<string | undefined>(undefined);
  const fork = api.studies.fork.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  // Where it lands (ADR-0055): from the global Browse there's no active-workspace
  // context to assume, so offer a picker of the caller's write-capable workspaces,
  // preselected to the most-recently-active one (the list is sorted by activity).
  const workspaces = api.workspace.list.useQuery(undefined, { enabled: open });
  const writable = (workspaces.data ?? []).filter((w) => w.role !== "viewer");
  const targetId = target ?? writable[0]?.id;

  return (
    <div className="flex flex-col items-end gap-1">
      <PendingButton
        pending={fork.isPending}
        idleLabel="Replicate"
        pendingLabel="Replicating…"
        onClick={() => setOpen(true)}
        className={className}
      />
      {fork.isError ? (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
          Couldn’t replicate — this study may no longer be public.
        </p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !fork.isPending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="What kind of replication is this?"
            className="flex w-full max-w-[460px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 text-left"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
              What kind of replication is this?
            </h3>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Reviewers judge differences against the kind — declaring it tunes the readiness checks
              and adds Replication Recipe sections to your Overview.
            </p>
            <div role="radiogroup" aria-label="Replication kind" className="flex flex-col gap-1.5">
              {INTENTS.map((o) => (
                <label
                  key={o.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border p-2.5",
                    intent === o.key
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)]/40"
                      : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]",
                  )}
                >
                  <input
                    type="radio"
                    name="replication-intent"
                    checked={intent === o.key}
                    onChange={() => setIntent(o.key)}
                    className="mt-0.5 size-4 accent-[var(--color-primary)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-[length:var(--text-body)] font-medium text-[var(--color-text-primary)]">
                      {o.label}
                    </span>
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{o.detail}</span>
                  </span>
                </label>
              ))}
            </div>
            {writable.length > 1 ? (
              <label className="flex flex-col gap-1">
                <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Replicate into</span>
                <select
                  value={targetId ?? ""}
                  onChange={(e) => setTarget(e.target.value)}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]"
                >
                  {writable.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={fork.isPending}
                onClick={() => {
                  setOpen(false);
                  fork.mutate({ studyId, targetWorkspaceId: targetId });
                }}
                className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] hover:underline"
              >
                Replicate without declaring
              </button>
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={fork.isPending}
                  onClick={() => setOpen(false)}
                  className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                >
                  Cancel
                </button>
                <PendingButton
                  pending={fork.isPending}
                  idleLabel="Create replication"
                  pendingLabel="Replicating…"
                  onClick={() => fork.mutate({ studyId, intent, targetWorkspaceId: targetId })}
                />
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
