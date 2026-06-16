"use client";

import { canWriteRole, READ_ONLY_TITLE } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";

/**
 * Workspace setting (ADR-0046 decision 4): which activity-event kinds are hidden
 * from the workspace Activity feed. Owner/admin only — editors/viewers see it
 * read-only. Checked = shown; unchecking adds the kind to the hidden set
 * (`workspace.updateActivityFilter`). Grouped so the noisy member-management
 * events are easy to mute as a set.
 */
type Kind = { key: string; label: string };
const GROUPS: { title: string; kinds: Kind[] }[] = [
  {
    title: "Member management",
    kinds: [
      { key: "member_role_changed", label: "Role changed" },
      { key: "co_owner_promoted", label: "Co-owner added" },
      { key: "ownership_transferred", label: "Ownership transferred" },
      { key: "member_removed", label: "Member removed" },
      { key: "member_left", label: "Member left" },
    ],
  },
  {
    title: "Study activity",
    kinds: [
      { key: "fork", label: "Replications" },
      { key: "preregister_complete", label: "Preregistrations" },
      { key: "new_named_version", label: "New versions" },
      { key: "comment_on_your_study", label: "Comments" },
      { key: "review_request", label: "Review requests" },
      { key: "proposal_open", label: "Change proposals" },
    ],
  },
];

export function ActivityFilterSettings() {
  const utils = api.useUtils();
  const active = api.workspace.active.useQuery();
  const hidden = new Set(active.data?.activityFilterKinds ?? []);
  const canManage = active.data?.role === "owner" || active.data?.role === "admin";

  const update = api.workspace.updateActivityFilter.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.workspace.active.invalidate(), utils.workspace.recentActivity.invalidate()]);
    },
  });

  const toggle = (key: string, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(key);
    else next.add(key);
    update.mutate({ hiddenKinds: [...next] });
  };

  return (
    <div className="flex flex-col gap-3" title={canManage ? undefined : READ_ONLY_TITLE}>
      <div>
        <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
          Workspace activity feed
        </h3>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Choose what shows in this workspace&rsquo;s Activity feed and dashboard. Unchecking hides that kind for
          everyone.{!canManage ? " Only owners and admins can change this." : ""}
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => (
          <fieldset key={g.title} disabled={!canManage || update.isPending} className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
              {g.title}
            </legend>
            {g.kinds.map((k) => (
              <label key={k.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!hidden.has(k.key)}
                  onChange={(e) => toggle(k.key, e.target.checked)}
                  className="size-4 accent-[var(--color-primary)] disabled:opacity-40"
                />
                <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{k.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
