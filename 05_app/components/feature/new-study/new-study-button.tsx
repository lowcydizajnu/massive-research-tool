"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { READ_ONLY_TITLE, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

import { useNewStudy } from "./context";

/** localStorage key — once the researcher has opened New study, the first-run
 *  pulse never returns (independent of how many studies they end up with). */
const PULSE_DISMISSED_KEY = "mrt:newstudy-pulse-dismissed";

/**
 * Opens the New study modal. Used from the TopBar (primary chrome action) and
 * the Studies empty-state CTA, both driving the one modal via context.
 *
 * First-run nudge (feedback #10f): a brand-new researcher (zero authored
 * studies) sees a soft animated dot on the button, drawing their eye to where a
 * study begins. It clears the moment they open the modal once (persisted), and
 * never shows for anyone who already has a study.
 */
export function NewStudyButton({
  variant = "primary",
  autoFocus,
}: {
  variant?: "primary" | "topbar";
  autoFocus?: boolean;
}) {
  const { open } = useNewStudy();
  const { canWrite } = useWorkspaceRole();
  const stats = api.me.stats.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // Assume dismissed until storage is read, so the dot never flashes for the
  // (common) returning researcher before hydration settles.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(localStorage.getItem(PULSE_DISMISSED_KEY) === "true");
  }, []);

  const pulse = canWrite && !dismissed && stats.data?.studiesAuthored === 0;

  const handleOpen = () => {
    if (!dismissed) {
      localStorage.setItem(PULSE_DISMISSED_KEY, "true");
      setDismissed(true);
    }
    open();
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      autoFocus={autoFocus}
      disabled={!canWrite}
      title={canWrite ? undefined : READ_ONLY_TITLE}
      aria-keyshortcuts="Command+N"
      data-tour="new-study"
      className={cn(
        "relative flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40",
        variant === "topbar"
          ? "px-3 py-1.5 text-[length:var(--text-body-emphasis)]"
          : "px-4 py-2 text-[length:var(--text-body-emphasis)]",
      )}
    >
      <Plus className="size-4" aria-hidden />
      New study
      {pulse ? (
        <span className="absolute -right-1 -top-1 flex size-3" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-primary)] opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-[var(--color-primary)] ring-2 ring-[var(--color-surface-canvas)]" />
        </span>
      ) : null}
    </button>
  );
}
