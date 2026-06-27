"use client";

import { Plus } from "lucide-react";

import { READ_ONLY_TITLE, useWorkspaceRole } from "@/components/feature/workspace/role-gate";
import { cn } from "@/lib/utils";

import { useNewStudy } from "./context";

/**
 * Opens the New study modal. Used from the TopBar (primary chrome action) and
 * the Studies empty-state CTA, both driving the one modal via context.
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
  return (
    <button
      type="button"
      onClick={open}
      autoFocus={autoFocus}
      disabled={!canWrite}
      title={canWrite ? undefined : READ_ONLY_TITLE}
      aria-keyshortcuts="Command+N"
      data-tour="new-study"
      className={cn(
        "flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40",
        variant === "topbar"
          ? "px-3 py-1.5 text-[length:var(--text-body-emphasis)]"
          : "px-4 py-2 text-[length:var(--text-body-emphasis)]",
      )}
    >
      <Plus className="size-4" aria-hidden />
      New study
    </button>
  );
}
