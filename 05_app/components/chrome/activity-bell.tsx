"use client";

import { Activity, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { LIVE_POLL_MS, useVisibleInterval } from "@/lib/use-visible-interval";
import type { NotificationDTO } from "@/server/trpc/routers/notifications";

/**
 * Global Activity bell in the top nav (owner request) — a bell with an unread
 * dot that opens a slide-out of the caller's recent notifications ACROSS every
 * workspace (`notifications.*` filters by recipient only, so it's already
 * cross-workspace). Opening marks everything read, so the "seen" state is
 * consistent everywhere — mirrors the ✨ What's-new bell. "See all activity"
 * links to the full destination.
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

export function ActivityBell() {
  const [open, setOpen] = useState(false);
  const unread = api.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: useVisibleInterval(LIVE_POLL_MS),
    refetchOnWindowFocus: true,
  });
  const list = api.notifications.list.useQuery(undefined, { enabled: open });
  const utils = api.useUtils();
  const markAllRead = api.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.unreadCount.invalidate(),
  });

  // Opening the panel marks everything read (seen-state is cross-workspace).
  useEffect(() => {
    if (open && (unread.data ?? 0) > 0) markAllRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          <span
            aria-hidden
            className="absolute right-1 top-1 size-2 rounded-full bg-[var(--color-primary)] ring-2 ring-[var(--color-surface-panel)]"
          />
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
          <aside className="flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-[var(--color-surface-canvas)] p-5 shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">Activity</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {list.isLoading ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>
            ) : (list.data?.length ?? 0) === 0 ? (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Nothing yet — comments, mentions, reviews, and replications of your studies show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {list.data!.slice(0, 20).map((n) => {
                  const href = hrefFor(n);
                  const body = (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">{label(n)}</span>
                      <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{relativeTime(n.createdAt)}</span>
                    </span>
                  );
                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-2 hover:bg-[var(--color-surface-subtle)]"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-2">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
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
