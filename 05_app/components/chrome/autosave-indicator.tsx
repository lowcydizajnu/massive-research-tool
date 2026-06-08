"use client";

import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/**
 * Autosave status (V1.12 H). Reads the global React Query mutation state — every
 * Builder/Whiteboard edit is a tRPC mutation — to show "Saving…", "All changes
 * saved · <ago>", or an error. Renders nothing until the first save happens, so
 * it stays quiet on read-only surfaces. Lives in the TopBar (inside the query
 * provider). Errors clear on the next save.
 */
export function AutosaveIndicator() {
  const mutating = useIsMutating();
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errored, setErrored] = useState(false);
  const prev = useRef(0);
  const [, tick] = useState(0);

  // saving → idle transition records a save time.
  useEffect(() => {
    if (prev.current > 0 && mutating === 0 && !errored) setSavedAt(Date.now());
    prev.current = mutating;
  }, [mutating, errored]);

  // Track mutation outcomes for the error state.
  useEffect(() => {
    return qc.getMutationCache().subscribe((event) => {
      const status = event?.mutation?.state.status;
      if (status === "error") setErrored(true);
      else if (status === "pending" || status === "success") setErrored(false);
    });
  }, [qc]);

  // Re-render every 20s so the relative time stays fresh while idle.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, []);

  if (mutating === 0 && savedAt === null && !errored) return null;

  const state = mutating > 0 ? "saving" : errored ? "error" : "saved";
  const dot =
    state === "saving"
      ? "var(--color-text-muted)"
      : state === "error"
        ? "var(--color-danger)"
        : "var(--color-success)";
  const label =
    state === "saving"
      ? "Saving…"
      : state === "error"
        ? "Couldn’t save — your last change may not be saved"
        : `All changes saved${savedAt ? ` · ${relativeTime(savedAt)}` : ""}`;

  return (
    <span
      role="status"
      aria-live="polite"
      title={label}
      className="flex items-center gap-1.5 text-[length:var(--text-small)] text-[var(--color-text-muted)]"
    >
      <span
        className={cn("size-1.5 rounded-full", state === "saving" && "animate-pulse")}
        style={{ backgroundColor: dot }}
        aria-hidden
      />
      <span className="hidden max-w-[220px] truncate sm:inline">{label}</span>
    </span>
  );
}
