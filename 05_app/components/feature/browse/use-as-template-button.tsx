"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PendingButton } from "@/components/ui/pending-button";
import { signInHref } from "@/lib/auth/sign-in-redirect";
import { api } from "@/lib/trpc/react";

/**
 * "Use as template" (ADR-0038): copy a public study as a fresh starting point —
 * fresh block identities, NO lineage (vs Replicate, which preserves ids for
 * diffing). Opens a small dialog confirming the destination workspace (a picker
 * when the caller has more than one; ADR-0055), so it never silently creates.
 */
export function UseAsTemplateButton({ studyId, className, authed = true }: { studyId: string; className?: string; authed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const copy = api.studies.useAsTemplate.useMutation({
    onSuccess: ({ id }) => router.push(`/studies/${id}/build`),
  });
  const workspaces = api.workspace.list.useQuery(undefined, { enabled: open });
  const writable = (workspaces.data ?? []).filter((w) => w.role !== "viewer");
  const targetId = target ?? writable[0]?.id;

  return (
    <>
      <PendingButton
        variant="secondary"
        onClick={() => (authed ? setOpen(true) : router.push(signInHref()))}
        pending={copy.isPending}
        idleLabel="Use as template"
        pendingLabel="Copying…"
        className={className}
      />
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !copy.isPending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Use as template"
            className="flex w-full max-w-[420px] flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-raised)] p-5 text-left"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <h3 className="font-serif text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">Use as template</h3>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Starts a fresh study from this design — new block identities, no replication lineage.
            </p>
            <div className="flex flex-col gap-1">
              <span className="text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">Create in</span>
              {writable.length > 1 ? (
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
              ) : (
                <span className="rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] px-2 py-1.5 text-[length:var(--text-small)] text-[var(--color-text-primary)]">
                  {writable[0]?.name ?? "your workspace"}
                </span>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={copy.isPending}
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-[length:var(--text-body)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              >
                Cancel
              </button>
              <PendingButton
                pending={copy.isPending}
                idleLabel="Create from template"
                pendingLabel="Copying…"
                onClick={() => copy.mutate({ studyId, targetWorkspaceId: targetId })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
