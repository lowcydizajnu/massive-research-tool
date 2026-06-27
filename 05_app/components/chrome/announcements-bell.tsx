"use client";

import { Sparkles, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/react";
import { renderCommentMarkdown } from "@/lib/comment-markdown";
import { LIVE_POLL_MS, useVisibleInterval } from "@/lib/use-visible-interval";

/**
 * In-app "what's new" widget (platform-foundation PF4, ADR-0072). A ✨ button in
 * the TopBar with an unread dot; clicking opens a right slide-out panel of
 * announcements (newest first) and marks everything read (sets the user's
 * last_seen timestamp). Body is sanitized markdown (ADR-0015 allowlist).
 */
export function AnnouncementsBell() {
  const [open, setOpen] = useState(false);
  const unread = api.announcements.unreadCount.useQuery(undefined, {
    refetchInterval: useVisibleInterval(LIVE_POLL_MS),
    refetchOnWindowFocus: true,
  });
  const list = api.announcements.list.useQuery(undefined, { enabled: open });
  const utils = api.useUtils();
  const markAllRead = api.announcements.markAllRead.useMutation({
    onSuccess: () => utils.announcements.unreadCount.invalidate(),
  });

  // Opening the panel marks everything read.
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
  const fmt = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <button
        type="button"
        aria-label={count > 0 ? `What's new — ${count} unread` : "What's new"}
        title="What's new"
        onClick={() => setOpen(true)}
        className="relative inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
      >
        <Sparkles className="size-4" aria-hidden />
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
          aria-label="What's new"
          aria-modal="true"
          className="fixed inset-0 z-[65] flex justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.40)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside className="flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-[var(--color-surface-canvas)] p-5 shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[length:var(--text-heading-2)] font-medium text-[var(--color-ink-deep)]">
                What&rsquo;s new
              </h2>
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
                No announcements yet — product updates will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {list.data!.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 border-b border-[var(--color-border-subtle)] pb-4 last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-primary)]">
                        {a.title}
                      </h3>
                      <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                        {fmt(a.publishedAt)}
                      </span>
                    </div>
                    <div
                      className="text-[length:var(--text-small)] leading-relaxed text-[var(--color-text-secondary)] [&_a]:text-[var(--color-primary)] [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: renderCommentMarkdown(a.body) }}
                    />
                    {a.learnMoreUrl ? (
                      <Link
                        href={a.learnMoreUrl as Route}
                        target="_blank"
                        className="mt-1 text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
                      >
                        Learn more →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}
