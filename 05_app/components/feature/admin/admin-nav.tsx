"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Admin section nav (platform-foundation; full Admin destination arrives with
 * the Analytics + Admin handoff). Centralized link bar across the env-allowlisted
 * /admin/* pages.
 */
const SECTIONS: { label: string; href: Route; exact?: boolean }[] = [
  { label: "Overview", href: "/admin" as Route, exact: true },
  { label: "Workspaces", href: "/admin/workspaces" as Route },
  { label: "Users", href: "/admin/users" as Route },
  { label: "Feedback", href: "/admin/feedback" as Route },
  { label: "Announcements", href: "/admin/announcements" as Route },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-1">
      {SECTIONS.map((s) => {
        const active = s.exact ? pathname === s.href : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-md)] px-2.5 py-1 text-[length:var(--text-small)] font-medium",
              active
                ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary-text-on-subtle)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
