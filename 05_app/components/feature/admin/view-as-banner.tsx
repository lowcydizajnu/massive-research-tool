"use client";

import { useState } from "react";

import { stopViewAs } from "@/app/actions/view-as";
import { api } from "@/lib/trpc/react";

/**
 * Read-only "view-as" banner (ADR-0075). Shows across the app while an admin is
 * impersonating a researcher; Exit clears the session and reloads as the admin.
 * Mounted in the (app) shell. Renders nothing when not impersonating.
 */
export function ViewAsBanner() {
  const viewingAs = api.me.viewingAs.useQuery(undefined, { staleTime: 60_000 });
  const [exiting, setExiting] = useState(false);
  if (!viewingAs.data) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-[var(--color-ink-deep)] px-4 py-1.5 text-[length:var(--text-small)] text-white">
      <span>
        Viewing as <strong className="font-medium">{viewingAs.data.targetName}</strong> · read-only
      </span>
      <button
        type="button"
        disabled={exiting}
        onClick={async () => {
          setExiting(true);
          await stopViewAs();
          // Full reload so the cleared cookie takes effect everywhere.
          window.location.href = "/admin/users";
        }}
        className="rounded-[var(--radius-sm)] bg-white/15 px-2 py-0.5 font-medium hover:bg-white/25 disabled:opacity-60"
      >
        {exiting ? "Exiting…" : "Exit view-as"}
      </button>
    </div>
  );
}
