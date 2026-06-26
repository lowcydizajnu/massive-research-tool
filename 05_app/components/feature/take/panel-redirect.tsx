"use client";

import { useEffect, useState } from "react";

/**
 * Auto-redirect to an external research panel (ADR-0071). Used on the completion
 * and consent-refusal screens when the study has a panel redirect configured.
 * Counts down `delaySec` then navigates; a sticky "return to panel" bar (when
 * `stickyText` is set) lets the participant skip the wait. The URL is resolved
 * server-side (placeholders already filled).
 */
export function PanelRedirect({
  url,
  delaySec,
  stickyText,
  buttonLabel = "Return to panel",
}: {
  url: string;
  delaySec: number;
  stickyText: string;
  buttonLabel?: string;
}) {
  const [left, setLeft] = useState(Math.max(0, Math.round(delaySec)));

  useEffect(() => {
    if (left <= 0) {
      window.location.href = url;
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, url]);

  const go = () => {
    window.location.href = url;
  };

  if (stickyText) {
    return (
      <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] px-6 py-3">
        <span className="text-[length:var(--text-body)] text-[var(--color-text-primary)]">{stickyText}</span>
        <button
          type="button"
          onClick={go}
          className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[length:var(--text-body-emphasis)] font-medium text-white hover:opacity-90"
        >
          {buttonLabel} →
        </button>
      </div>
    );
  }

  return (
    <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      Redirecting you back to the panel{left > 0 ? ` in ${left}s` : "…"} —{" "}
      <button type="button" onClick={go} className="underline hover:opacity-80">
        go now →
      </button>
    </p>
  );
}
