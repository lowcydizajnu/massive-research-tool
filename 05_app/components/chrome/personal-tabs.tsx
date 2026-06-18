"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Home (personal-mode) top tabs (ADR-0055). The global layer is cross-workspace:
 * Home (your dashboard across workspaces) + Browse (discover + replicate public
 * studies). Browse lives here, not in the workspace rail, because it's global.
 */
const TABS: { label: string; href: Route }[] = [
  { label: "Home", href: "/home" as Route },
  { label: "Browse", href: "/browse" as Route },
];

export function PersonalTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Home sections" className="flex items-center gap-1 border-b border-[var(--color-border-subtle)] px-3">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[length:var(--text-small)] font-medium",
              active
                ? "border-[var(--color-primary)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
