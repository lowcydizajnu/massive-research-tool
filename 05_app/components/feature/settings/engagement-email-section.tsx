"use client";

import { api } from "@/lib/trpc/react";

/**
 * Personal engagement-email preference (EE3 / ADR-0081). One opt-out covering the
 * weekly digest + return-nudge. (These only send when an operator has enabled them
 * platform-wide; this lets a researcher opt out regardless.)
 */
export function EngagementEmailSection() {
  const utils = api.useUtils();
  const q = api.me.emailPrefs.useQuery();
  const set = api.me.setEngagementEmailOptOut.useMutation({
    onSuccess: () => void utils.me.emailPrefs.invalidate(),
  });

  const optedOut = q.data?.engagementEmailsOptedOut ?? false;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">Notifications</h2>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Occasional engagement emails — a weekly activity digest and the odd reminder if you&rsquo;ve been away.
        Account and security emails are always sent.
      </p>
      <label className="flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={!optedOut}
          disabled={q.isLoading || set.isPending}
          onChange={(e) => set.mutate({ optedOut: !e.target.checked })}
        />
        Send me engagement emails
      </label>
    </section>
  );
}
