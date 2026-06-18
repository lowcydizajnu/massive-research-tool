"use client";

import { Check, ChevronDown, Home } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";

/**
 * Workspace switcher (ADR-0033) — replaces the old disabled stub. The popover
 * offers "Home" (cross-workspace personal mode) above the caller's workspaces;
 * picking a workspace submits `switchWorkspaceAction` (sets the active-workspace
 * cookie server-side, then redirects). Used in both the personal and workspace
 * top bars. `mode` marks which entry is the current one.
 */
export function WorkspaceSwitcher({
  activeLabel,
  mode,
}: {
  activeLabel: string;
  mode: "personal" | "workspace";
}) {
  const [open, setOpen] = useState(false);
  // Only fetch the list when the popover opens (cheap, and keeps the bar quiet).
  const { data: workspaces, isLoading } = api.workspace.list.useQuery(undefined, { enabled: open });

  // The name links "home" for the mode (workspace → its dashboard; personal →
  // /home); the caret opens the switcher. Two affordances, one for each intent.
  const homeHref = mode === "workspace" ? "/dashboard" : "/home";

  return (
    <div className="relative flex items-center">
      {/* Name + caret read as one unit — hovering either highlights both (group),
          but they stay distinct targets: name → dashboard/home, caret → switcher. */}
      <span className="group flex items-center rounded-[var(--radius-md)] hover:bg-[var(--color-surface-subtle)]">
        <Link
          href={homeHref}
          title={`${activeLabel} — go to ${mode === "workspace" ? "dashboard" : "home"}`}
          className="flex max-w-[200px] items-center rounded-l-[var(--radius-md)] py-1 pl-2 pr-1 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]"
        >
          <span className="truncate">{activeLabel}</span>
        </Link>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Switch workspace"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center rounded-r-[var(--radius-md)] py-1 pl-0.5 pr-1.5"
        >
          <ChevronDown className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        </button>
      </span>

      {open ? (
        <>
          {/* click-outside backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] py-1 shadow-[var(--shadow-md)]"
          >
            <Link
              role="menuitem"
              href="/home"
              onClick={() => setOpen(false)}
              aria-current={mode === "personal" ? "page" : undefined}
              className="flex items-center gap-2 px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
            >
              <Home className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
              <span className="flex-1">Home</span>
              <span className="text-[var(--color-text-muted)]">All workspaces</span>
              {mode === "personal" ? <Check className="size-3.5 text-[var(--color-primary)]" aria-hidden /> : null}
            </Link>

            <div className="my-1 border-t border-[var(--color-border-subtle)]" />

            {isLoading ? (
              <p className="px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
            ) : (workspaces ?? []).length === 0 ? (
              <p className="px-3 py-2 text-[length:var(--text-small)] text-[var(--color-text-muted)]">No workspaces.</p>
            ) : (
              (workspaces ?? []).map((w) => {
                const isCurrent = mode === "workspace" && w.name === activeLabel;
                return (
                  <form key={w.id} action={switchWorkspaceAction.bind(null, w.id)}>
                    <button
                      type="submit"
                      role="menuitem"
                      aria-current={isCurrent ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-small)] hover:bg-[var(--color-surface-subtle)]",
                        isCurrent ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate" title={w.name}>
                        {w.name}
                      </span>
                      <span className="shrink-0 text-[var(--color-text-muted)]">{w.role}</span>
                      {isCurrent ? <Check className="size-3.5 shrink-0 text-[var(--color-primary)]" aria-hidden /> : null}
                    </button>
                  </form>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
