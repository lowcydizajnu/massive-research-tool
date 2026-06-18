import { X } from "lucide-react";
import Link from "next/link";

import { AutosaveIndicator } from "@/components/chrome/autosave-indicator";
import { CommandPalette } from "@/components/chrome/command-palette";
import { FocusedBreadcrumb } from "@/components/chrome/focused-breadcrumb";
import { StudyActionsMenu } from "@/components/chrome/study-actions-menu";
import { StudyStateBadge } from "@/components/chrome/study-state-badge";
import { WorkspaceRoleBadge } from "@/components/feature/workspace/role-gate";

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
      <Link
        href="/dashboard"
        title={`${workspaceName} — go to dashboard`}
        className="max-w-[180px] truncate rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-secondary)]"
      >
        {workspaceName}
      </Link>
      <span aria-hidden className="text-[var(--color-text-muted)]">·</span>

      <FocusedBreadcrumb studyId={studyId} />

      <div className="flex-1" />

      <StudyStateBadge studyId={studyId} />

      <WorkspaceRoleBadge />

      <AutosaveIndicator />

      <CommandPalette />

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
