"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Participants destination sub-nav (V1.15 / participants-destination.md). Five
 * child routes; the active one is derived from the pathname. Mirrors the Team
 * destination's segmented sub-nav. Connections is live in V1.15.0; the rest are
 * placeholder routes until their streams land.
 */
const TABS: { label: string; href: Route }[] = [
  { label: "Connections", href: "/participants/connections" as Route },
  { label: "Open recruitment", href: "/participants/open-recruitment" as Route },
  { label: "Panels", href: "/participants/panels" as Route },
  { label: "Compensation", href: "/participants/compensation" as Route },
  { label: "Quality", href: "/participants/quality" as Route },
];

export function ParticipantsSubNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Participants"
      className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-1"
    >
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-body)]",
              active
                ? "border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] font-serif font-medium text-[var(--color-primary)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
