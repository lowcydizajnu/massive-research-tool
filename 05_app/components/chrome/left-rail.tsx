"use client";

import {
  Activity,
  Boxes,
  Compass,
  FlaskConical,
  LayoutDashboard,
  Library,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { api } from "@/lib/trpc/react";
import { LIVE_POLL_MS, useVisibleInterval } from "@/lib/use-visible-interval";
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
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" as Route },
  { label: "Studies", icon: FlaskConical, href: "/studies" },
  { label: "Library", icon: Library, href: "/library" as Route },
  { label: "Frameworks", icon: Boxes, href: "/frameworks" as Route },
  { label: "Browse", icon: Compass, href: "/browse" as Route },
  { label: "Participants", icon: Users },
  { label: "Activity", icon: Activity, href: "/activity" as Route },
  { label: "Team", icon: UsersRound, href: "/team" as Route },
  { label: "Settings", icon: Settings, href: "/settings/account" },
];

export function LeftRail() {
  const pathname = usePathname();
  // The Activity rail item carries the unread badge (IA v0.3 — no bell). Polls
  // while the tab is visible so the badge updates without a page refresh.
  const { data: unread } = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: useVisibleInterval(LIVE_POLL_MS),
    refetchOnWindowFocus: true,
  });

  return (
    <nav
      aria-label="Workspace"
      className="flex w-full flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-2"
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
        const showBadge = d.label === "Activity" && !!unread && unread > 0;
        const inner = (
          <>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{d.label}</span>
            {showBadge ? (
              <span
                className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[length:var(--text-small)] font-medium leading-tight text-white"
                aria-label={`${unread} unread`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
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
