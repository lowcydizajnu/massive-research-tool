"use client";

import { CircleUserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { getBar, getVars, interpolate, subscribeVars } from "@/lib/take/study-variables";

/**
 * Signed-in bar (ADR-0099 / ADR-0098 am.). After the participant signs in at a
 * login block, a slim account bar shows the researcher's `signedInTemplate`
 * (default "Signed in as {username}") on every LATER screen — immersion for
 * deception studies. Reads the client-only study-variable carry and renders into
 * the page-level `#take-topbar` slot (under the fake nav), like the persistent
 * notification host. Nothing is read from the server — the username lives only in
 * this tab (never recorded / exported).
 *
 * Marked `data-no-vars` so the token hydrator skips it (this bar interpolates its
 * own template at the data level).
 */
export function SignedInBar({ responseId }: { responseId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("take-topbar"));
    const refresh = () => {
      const bar = getBar(responseId);
      if (!bar) return setText(null);
      const resolved = interpolate(bar.template, getVars(responseId)).trim();
      // Hide until the template fully resolves (no leftover `{token}`) and is
      // non-empty — e.g. before the participant has signed in.
      setText(resolved && !/\{[a-zA-Z0-9_]+\}/.test(resolved) ? resolved : null);
    };
    refresh();
    return subscribeVars(refresh);
  }, [responseId]);

  if (!text) return null;

  const bar = (
    <div
      data-no-vars
      className="motion-safe:animate-in mx-auto my-2 flex w-[calc(100%-2rem)] max-w-[var(--take-content-max,640px)] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] px-4 py-2 shadow-[var(--shadow-sm)]"
    >
      <CircleUserRound className="size-5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)]">
        {text}
      </span>
    </div>
  );

  return slot ? createPortal(bar, slot) : bar;
}
