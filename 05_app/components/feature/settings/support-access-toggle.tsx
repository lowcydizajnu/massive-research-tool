"use client";

import { canWriteRole, READ_ONLY_TITLE } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";

/**
 * "Allow administrator support access" workspace toggle (ADR-0082). On by
 * default. When off, a platform operator using read-only "View as" support
 * access is excluded from this workspace — its studies and results don't appear.
 * A workspace doing sensitive work can turn it off to opt out entirely.
 */
export function SupportAccessToggle() {
  const utils = api.useUtils();
  const active = api.workspace.active.useQuery();
  const setEnabled = api.workspace.setSupportAccessEnabled.useMutation({
    onSuccess: async () => {
      await utils.workspace.active.invalidate();
    },
  });
  const checked = active.data?.supportAccessEnabled ?? true;
  const canWrite = canWriteRole(active.data?.role);

  return (
    <label className="flex items-start gap-3" title={canWrite ? undefined : READ_ONLY_TITLE}>
      <input
        type="checkbox"
        checked={checked}
        disabled={active.isLoading || setEnabled.isPending || !canWrite}
        onChange={(e) => setEnabled.mutate({ enabled: e.target.checked })}
        className="mt-0.5 size-4 accent-[var(--color-primary)] disabled:opacity-40"
      />
      <span className="flex flex-col">
        <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          Allow administrator support access
        </span>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Lets a platform administrator open a read-only support session to help debug this
          workspace. Sessions are always logged and you’re notified when one starts. Turn this off
          for sensitive work to exclude this workspace entirely.
        </span>
      </span>
    </label>
  );
}
