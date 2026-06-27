"use client";

import { useState } from "react";

import { startViewAs } from "@/app/actions/view-as";

/**
 * "View as" trigger on the admin Users census (ADR-0075). Starts a read-only
 * impersonation session (admin-gated + audited server-side) and lands on the
 * researcher's Studies. Self / unknown targets are rejected by the action.
 */
export function ViewAsButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await startViewAs(userId);
        if (res.ok) window.location.href = "/studies";
        else setBusy(false);
      }}
      className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
    >
      {busy ? "…" : "View as"}
    </button>
  );
}
