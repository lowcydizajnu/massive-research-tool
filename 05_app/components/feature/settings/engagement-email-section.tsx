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
  // Marketing/product-update consent (feedback #9) — explicit opt-in, distinct
  // from the engagement-email digest opt-out above.
  const setMarketing = api.me.setMarketingOptIn.useMutation({
    onSuccess: () => void utils.me.emailPrefs.invalidate(),
  });

  const optedOut = q.data?.engagementEmailsOptedOut ?? false;
  const marketingOptIn = q.data?.marketingOptIn ?? false;

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

      <div className="mt-1 border-t border-[var(--color-border-subtle)] pt-3">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Product &amp; marketing emails — occasional updates, tips, and announcements about new features.
          Off unless you opt in.
        </p>
        <label className="mt-2 flex items-center gap-2 text-[length:var(--text-body)] text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={marketingOptIn}
            disabled={q.isLoading || setMarketing.isPending}
            onChange={(e) => setMarketing.mutate({ optIn: e.target.checked })}
          />
          Send me product &amp; marketing emails
        </label>
      </div>
    </section>
  );
}
