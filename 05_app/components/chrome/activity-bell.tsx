"use client";

import { Activity, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { LIVE_POLL_MS, useVisibleInterval } from "@/lib/use-visible-interval";
import type { NotificationDTO } from "@/server/trpc/routers/notifications";

/**
 * Global Activity bell in the top nav (owner request) — a bell with an unread
 * count that opens a slide-out of the caller's notifications ACROSS every
 * workspace (`notifications.*` filter by recipient only, so already
 * cross-workspace). Items are grouped by day and carry PER-ITEM read state:
 * clicking one marks just it read (and navigates); an explicit "Mark all read"
 * clears the rest. Unread items are visually distinct. Complements the ✨
 * What's-new bell (product announcements).
 */
function label(n: NotificationDTO): string {
  const who = n.actorName ?? "Someone";
  const p = n.payload ?? {};
  const title = typeof p.studyTitle === "string" ? `“${p.studyTitle}”` : "your study";
  switch (n.type) {
    case "comment_on_your_study":
      return `${who} commented on ${title}`;
    case "mention":
      return `${who} mentioned you on ${title}`;
    case "comment_resolved":
      return `${who} resolved a comment on ${title}`;
    case "review_request":
      return `${who} requested your review on ${title}`;
    case "fork":
      return `${who} replicated ${title}`;
    case "osf_push_complete":
      return `Your preregistration for ${title} is live`;
    case "osf_registration_withdrawn":
      return `The OSF registration for ${title} was withdrawn`;
    case "playground_assigned":
      return `${who} assigned you a to-do`;
    case "playground_card_added":
      return `${who} added to the Playground`;
    case "admin.support_access":
      return `An administrator opened a read-only support session on your account`;
    default:
      return `${who} updated ${title}`;
  }
}

function hrefFor(n: NotificationDTO): Route | null {
  const p = n.payload ?? {};
  const studyId = typeof p.studyId === "string" ? p.studyId : null;
  if (n.type === "playground_assigned" || n.type === "playground_card_added") return "/playground" as Route;
  return studyId ? (`/studies/${studyId}/build` as Route) : null;
}

function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** "Today" / "Yesterday" / "Earlier" bucket for a timestamp (local time). */
function dayBucket(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

const BUCKET_ORDER = ["Today", "Yesterday", "Earlier"] as const;

export function ActivityBell() {
  const [open, setOpen] = useState(false);
  const unread = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: useVisibleInterval(LIVE_POLL_MS),
    refetchOnWindowFocus: true,
  });
  const list = api.notifications.list.useQuery(undefined, { enabled: open });
  const utils = api.useUtils();
  const refresh = () => {
    void utils.notifications.unreadCount.invalidate();
    void utils.notifications.list.invalidate();
  };
  const markRead = api.notifications.markRead.useMutation({ onSuccess: refresh });
  const markAllRead = api.notifications.markAllRead.useMutation({ onSuccess: refresh });

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const count = unread.data ?? 0;
  const items = list.data ?? [];
  const grouped = BUCKET_ORDER.map((b) => ({ bucket: b, rows: items.filter((n) => dayBucket(n.createdAt) === b) })).filter(
    (g) => g.rows.length > 0,
  );

  const onItemClick = (n: NotificationDTO) => {
    if (!n.readAt) markRead.mutate({ id: n.id });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={count > 0 ? `Activity — ${count} unread` : "Activity"}
        title="Activity"
        onClick={() => setOpen(true)}
        className="relative inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <Activity className="size-4" aria-hidden />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-semibold leading-4 text-[var(--color-primary-contrast,#fff)] ring-2 ring-[var(--color-surface-panel)]">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Activity"
          aria-modal="true"
          className="fixed inset-0 z-[65] flex justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.40)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside className="flex h-full w-full max-w-sm flex-col gap-3 overflow-y-auto bg-[var(--color-surface-canvas)] p-5 shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">Activity</h2>
              <div className="flex items-center gap-2">
                {count > 0 ? (
                  <button
                    type="button"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                    className="text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-60"
                  >
                    Mark all read
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {list.isLoading ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Nothing yet — comments, mentions, reviews, and replications of your studies show up here.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {grouped.map((g) => (
                  <section key={g.bucket} className="flex flex-col gap-1">
                    <h3 className="px-2 text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]">
                      {g.bucket}
                    </h3>
                    <ul className="flex flex-col">
                      {g.rows.map((n) => {
                        const href = hrefFor(n);
                        const body = (
                          <>
                            <span
                              aria-hidden
                              className={cn(
                                "mt-1.5 size-2 shrink-0 rounded-full",
                                n.readAt ? "bg-transparent" : "bg-[var(--color-primary)]",
                              )}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span
                                className={cn(
                                  "truncate text-[length:var(--text-body)]",
                                  n.readAt ? "text-[var(--color-text-secondary)]" : "font-medium text-[var(--color-text-primary)]",
                                )}
                              >
                                {label(n)}
                              </span>
                              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                                {relativeTime(n.createdAt)}
                                {n.workspaceName ? ` · ${n.workspaceName}` : ""}
                              </span>
                            </span>
                          </>
                        );
                        const rowCls = cn(
                          "flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-2",
                          !n.readAt && "bg-[var(--color-primary-subtle)]/40",
                        );
                        return (
                          <li key={n.id}>
                            {href ? (
                              <Link href={href} onClick={() => onItemClick(n)} className={cn(rowCls, "hover:bg-[var(--color-surface-subtle)]")}>
                                {body}
                              </Link>
                            ) : (
                              <button type="button" onClick={() => onItemClick(n)} className={cn(rowCls, "w-full text-left hover:bg-[var(--color-surface-subtle)]")}>
                                {body}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <Link
              href={"/activity" as Route}
              onClick={() => setOpen(false)}
              className="mt-auto text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:underline"
            >
              See all activity →
            </Link>
          </aside>
        </div>
      ) : null}
    </>
  );
}
