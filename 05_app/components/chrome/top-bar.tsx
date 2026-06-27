import { AnnouncementsBell } from "@/components/chrome/announcements-bell";
import { AutosaveIndicator } from "@/components/chrome/autosave-indicator";
import { CommandPalette } from "@/components/chrome/command-palette";
import { Breadcrumb } from "@/components/chrome/breadcrumb";
import { UserMenu } from "@/components/chrome/user-menu";
import { WorkspaceSwitcher } from "@/components/chrome/workspace-switcher";
import { NewStudyButton } from "@/components/feature/new-study/new-study-button";
import { WorkspaceRoleBadge } from "@/components/feature/workspace/role-gate";

/**
 * Top bar — floating cap with workspace-global chrome (studies-destination
 * wireframe). The workspace switcher (ADR-0033) lets you jump to Home or another
 * workspace; ⌘K, `+ New study`, the breadcrumb, and the account menu are live.
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
    <header className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] px-4 py-2">
      <WorkspaceSwitcher activeLabel={workspaceName} mode="workspace" />

      <Breadcrumb />

      <div className="flex-1" />

      <AutosaveIndicator />

      <CommandPalette />

      <NewStudyButton variant="topbar" />

      <WorkspaceRoleBadge />

      <AnnouncementsBell />

      <UserMenu initials={userInitials} displayName={displayName} email={email} />
    </header>
  );
}
