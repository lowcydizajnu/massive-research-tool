import { CommandPalette } from "@/components/chrome/command-palette";
import { UserMenu } from "@/components/chrome/user-menu";
import { WorkspaceSwitcher } from "@/components/chrome/workspace-switcher";

/**
 * Personal-mode top bar (ADR-0033, personal-mode-topbar.md) — the slim chrome
 * for `/home`. No workspace context, no LeftRail: just the switcher (reading
 * "Home"), ⌘K, and the account menu. Creating a study needs a workspace, so
 * `+ New study` is intentionally absent here (it lives on the Home Quick actions
 * widget with a workspace picker).
 */
export function PersonalTopBar({
  userInitials,
  displayName,
  email,
}: {
  userInitials: string;
  displayName: string | null;
  email: string | null;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] px-4 py-2">
      <WorkspaceSwitcher activeLabel="Home" mode="personal" />
      <span className="hidden text-[length:var(--text-small)] text-[var(--color-text-muted)] sm:inline">
        All workspaces
      </span>
      <div className="flex-1" />
      <CommandPalette />
      <UserMenu initials={userInitials} displayName={displayName} email={email} />
    </header>
  );
}
