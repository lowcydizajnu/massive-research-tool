"use client";

import { useState } from "react";

import { startViewAs } from "@/app/actions/view-as";

/**
 * "View as" trigger on the admin Users census (ADR-0075 / ADR-0082). Starts a
 * read-only impersonation session (admin-gated + audited server-side) and lands
 * on the researcher's Studies. Break-glass: a non-empty reason is required to
 * enter — it is stored on the audit log and surfaced to the target researcher.
 * Self / unknown targets are rejected by the action.
 */
export function ViewAsButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        // Break-glass reason (ADR-0082) — required, stored + shown to the target.
        const reason = window.prompt(
          "Reason for support access (the researcher will see this):",
        );
        if (reason == null) return; // cancelled
        if (!reason.trim()) {
          window.alert("A reason is required to start support access.");
          return;
        }
        setBusy(true);
        const res = await startViewAs(userId, reason);
        if (res.ok) window.location.href = "/studies";
        else {
          setBusy(false);
          window.alert(
            res.error === "reason_required"
              ? "A reason is required to start support access."
              : "Could not start support access.",
          );
        }
      }}
      className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-60"
    >
      {busy ? "…" : "View as"}
    </button>
  );
}
