import { X } from "lucide-react";
import Link from "next/link";

import { AutosaveIndicator } from "@/components/chrome/autosave-indicator";
import { FocusedBreadcrumb } from "@/components/chrome/focused-breadcrumb";
import { StudyActionsMenu } from "@/components/chrome/study-actions-menu";

/**
 * Focused-study-mode top bar (IA v0.4, focused-study-mode.md): a flat flush
 * strip — workspace name · breadcrumb `Studies / [Title]` · autosave · ⋯
 * actions · ✕ close. No left rail in this mode; ⌘K and the breadcrumb carry
 * cross-study navigation.
 */
export function FocusedTopBar({
  workspaceName,
  studyId,
}: {
  workspaceName: string;
  studyId: string;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] px-4 py-2">
      <span className="max-w-[180px] truncate text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {workspaceName}
      </span>
      <span aria-hidden className="text-[var(--color-text-muted)]">·</span>

      <FocusedBreadcrumb studyId={studyId} />

      <div className="flex-1" />

      <AutosaveIndicator />

      <StudyActionsMenu studyId={studyId} />

      <Link
        href="/studies"
        aria-label="Close study"
        className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <X className="size-4" aria-hidden />
      </Link>
    </header>
  );
}
