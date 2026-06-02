import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";

/**
 * Top bar — floating cap with workspace-global chrome (studies-destination
 * wireframe). Workspace switcher popover + ⌘K search are deferred (inert here);
 * `+ New study` and the breadcrumb are live.
 */
export function TopBar({
  workspaceName,
  userInitials,
}: {
  workspaceName: string;
  userInitials: string;
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

      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        · Studies
      </span>

      <div className="flex-1" />

      {/* ⌘K search (modal deferred) */}
      <span
        aria-hidden
        className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-1.5 py-0.5 font-mono text-[length:var(--text-mono)] text-[var(--color-text-muted)]"
      >
        ⌘K
      </span>

      <Link
        href="/studies/new"
        aria-keyshortcuts="Command+N"
        className="flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
      >
        <Plus className="size-4" aria-hidden />
        New study
      </Link>

      <span
        aria-label="Account"
        className="flex size-8 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-[length:var(--text-small)] font-medium text-[var(--color-primary-text-on-subtle)]"
      >
        {userInitials}
      </span>
    </header>
  );
}
