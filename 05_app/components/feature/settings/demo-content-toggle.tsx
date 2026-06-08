"use client";

import { api } from "@/lib/trpc/react";

/**
 * "Show demo content" workspace toggle (V1.12 A3, ADR-0023). When on, seeded
 * demo studies appear in this workspace's study lists; demo studies are never
 * publicly discoverable regardless. Off by default.
 */
export function DemoContentToggle() {
  const utils = api.useUtils();
  const active = api.workspace.active.useQuery();
  const setShow = api.workspace.setShowDemoContent.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.workspace.active.invalidate(), utils.studies.list.invalidate()]);
    },
  });
  const checked = active.data?.showDemoContent ?? false;

  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={active.isLoading || setShow.isPending}
        onChange={(e) => setShow.mutate({ show: e.target.checked })}
        className="mt-0.5 size-4 accent-[var(--color-primary)]"
      />
      <span className="flex flex-col">
        <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          Show demo content
        </span>
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Display the seeded example studies in your workspace. They’re never visible to other
          researchers in Browse.
        </span>
      </span>
    </label>
  );
}
