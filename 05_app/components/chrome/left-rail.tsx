"use client";

import {
  Activity,
  Boxes,
  FlaskConical,
  Library,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Left rail — the workspace-global destinations (IA v0.3, studies-destination
 * wireframe). Studies is live; the rest are deferred V1.5 surfaces, shown but
 * inert so the rail reads complete without linking to routes that don't exist.
 */
type Destination = {
  label: string;
  icon: LucideIcon;
  href?: Route; // present = live; absent = deferred (inert)
};

const DESTINATIONS: Destination[] = [
  { label: "Studies", icon: FlaskConical, href: "/studies" },
  { label: "Library", icon: Library },
  { label: "Frameworks", icon: Boxes },
  { label: "Participants", icon: Users },
  { label: "Activity", icon: Activity },
  { label: "Team", icon: UsersRound },
  { label: "Settings", icon: Settings },
];

export function LeftRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="flex w-[155px] shrink-0 flex-col gap-1 self-start rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-2"
    >
      {DESTINATIONS.map((d) => {
        const Icon = d.icon;
        const active = d.href ? pathname.startsWith(d.href) : false;
        const className = cn(
          "flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[length:var(--text-body)]",
          active
            ? "bg-[var(--color-primary-subtle)] font-medium text-[var(--color-primary-text-on-subtle)]"
            : d.href
              ? "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
              : "cursor-default text-[var(--color-text-muted)] opacity-60",
        );
        const inner = (
          <>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{d.label}</span>
          </>
        );
        return d.href ? (
          <Link
            key={d.label}
            href={d.href}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {inner}
          </Link>
        ) : (
          <span
            key={d.label}
            aria-disabled="true"
            title="Coming soon"
            className={className}
          >
            {inner}
          </span>
        );
      })}
    </nav>
  );
}
