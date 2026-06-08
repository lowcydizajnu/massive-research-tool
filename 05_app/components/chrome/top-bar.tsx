import { ChevronDown } from "lucide-react";

import { AutosaveIndicator } from "@/components/chrome/autosave-indicator";
import { Breadcrumb } from "@/components/chrome/breadcrumb";
import { UserMenu } from "@/components/chrome/user-menu";
import { NewStudyButton } from "@/components/feature/new-study/new-study-button";

/**
 * Top bar — floating cap with workspace-global chrome (studies-destination
 * wireframe). Workspace switcher popover + ⌘K search are deferred (inert here);
 * `+ New study`, the breadcrumb, and the account menu (V1.12 A1) are live.
 */
export function TopBar({
  workspaceName,
  userInitials,
  displayName,
  email,
}: {
  workspaceName: string;
  userInitials: string;
  displayName: string | null;
  email: string | null;
}) {
  return (
    <header className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] px-3 py-2">
      {/* Workspace switcher (popover deferred per IA v0.3) */}
      <button
        type="button"
        aria-disabled="true"
        title="Switch workspace — coming soon"
        className="flex max-w-[200px] items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <span className="truncate">{workspaceName}</span>
        <ChevronDown className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      </button>

      <Breadcrumb />

      <div className="flex-1" />

      <AutosaveIndicator />

      {/* ⌘K search (modal deferred) */}
      <span
        aria-hidden
        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-1.5 py-0.5 font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]"
      >
        ⌘K
      </span>

      <NewStudyButton variant="topbar" />

      <UserMenu initials={userInitials} displayName={displayName} email={email} />
    </header>
  );
}
