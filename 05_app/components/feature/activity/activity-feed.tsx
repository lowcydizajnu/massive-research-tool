"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { NotificationDTO } from "@/server/trpc/routers/notifications";

/**
 * Activity destination (activity-destination.md, ADR-0015). Two sub-streams:
 * Yours (notification table, live) and Follows (activity_event × follow —
 * deferred to PR-3; shows its empty-state here). No bell: opening Yours marks
 * the unread rows read so the rail badge clears (IA v0.3 §Notifications), while
 * the rows still carry this-visit "new" accents from a first-load snapshot.
 */
type Tab = "Yours" | "Follows";

export function ActivityFeed() {
  const [tab, setTab] = useState<Tab>("Yours");

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-6">
      <div className="min-w-0">
        <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
          Activity
        </h1>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          What happened while you were away.
        </p>
      </div>

      <nav
        role="tablist"
        aria-label="Activity streams"
        className="flex w-fit items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)] p-1"
      >
        {(["Yours", "Follows"] as const).map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-[var(--radius-md)] px-3 py-1 text-[length:var(--text-body)]",
                active
                  ? "border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] font-serif font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
              )}
            >
              {t}
            </button>
          );
        })}
      </nav>

      <div role="tabpanel" aria-label={tab}>
        {tab === "Yours" ? <YoursStream /> : <FollowsStream />}
      </div>
    </main>
  );
}

function YoursStream() {
  const utils = api.useUtils();
  const { data, isLoading, isError } = api.notifications.list.useQuery();
  const markAllRead = api.notifications.markAllRead.useMutation({
    onSuccess: () => void utils.notifications.unreadCount.invalidate(),
  });

  // Snapshot which rows were unread on first load (for this-visit accents),
  // then mark-all-read once so the rail badge clears.
  const [wasUnread, setWasUnread] = useState<Set<string>>(new Set());
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || !data) return;
    settled.current = true;
    const unread = data.filter((n) => !n.readAt);
    if (unread.length > 0) {
      setWasUnread(new Set(unread.map((n) => n.id)));
      markAllRead.mutate();
    }
  }, [data, markAllRead]);

  if (isLoading) {
    return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Loading…</p>;
  }
  if (isError) {
    return (
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger-text-on-subtle)]">
        Couldn’t load activity — refresh.
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Empty>
        You’re all caught up — comments, mentions, and replications of your work show up here.
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((n) => (
        <EventRow key={n.id} n={n} fresh={wasUnread.has(n.id)} />
      ))}
    </ul>
  );
}

function FollowsStream() {
  // PR-3 wires activity_event × follow + the + Follow affordances. The tab ships
  // now so the Yours/Follows IA is legible (activity-destination.md).
  return (
    <Empty>
      Follow tags, authors, Frameworks, and studies to build your feed. Following arrives soon.
    </Empty>
  );
}

function EventRow({ n, fresh }: { n: NotificationDTO; fresh: boolean }) {
  const { text, href, doi, doiUrl } = describe(n);
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-[var(--radius-md)] border p-3",
        fresh
          ? "border-l-2 border-l-[var(--color-primary)] border-[var(--color-border-subtle)] bg-[var(--color-primary-subtle)]"
          : "border-[var(--color-border-subtle)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[length:var(--text-body)] text-[var(--color-text-primary)]">
          {fresh ? <span className="sr-only">Unread: </span> : null}
          {href ? (
            <Link href={href} className="hover:underline">
              {text}
            </Link>
          ) : (
            text
          )}
        </p>
        <time className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {relativeTime(n.createdAt)}
        </time>
      </div>
      {doi && doiUrl ? (
        <a
          href={doiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit font-mono text-[length:var(--text-mono)] text-[var(--color-primary)] hover:underline"
        >
          {doi}
        </a>
      ) : null}
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-6">
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{children}</p>
    </div>
  );
}

/**
 * Build a researcher-native verb phrase + a navigation target from a
 * notification (developer-term gate: "replicated", "preregistration", "saved
 * version" — never fork/push/event).
 */
function describe(n: NotificationDTO): {
  text: string;
  href: Route | null;
  doi?: string;
  doiUrl?: string;
} {
  const actor = n.actorName ?? "Someone";
  const p = n.payload ?? {};
  const studyId = typeof p.studyId === "string" ? p.studyId : null;
  const title = typeof p.studyTitle === "string" ? p.studyTitle : null;
  const named = title ? `“${title}”` : "your study";
  const reviewHref = (studyId ? (`/studies/${studyId}/share` as Route) : null);
  const studyHref = (studyId ? (`/studies/${studyId}` as Route) : null);

  switch (n.type) {
    case "comment_on_your_study":
      return { text: `${actor} commented on ${named}`, href: reviewHref };
    case "mention":
      return { text: `${actor} mentioned you${title ? ` on ${named}` : ""}`, href: reviewHref };
    case "comment_resolved":
      return { text: `${actor} resolved a comment on ${named}`, href: reviewHref };
    case "review_request":
      return { text: `${actor} requested your review on ${named}`, href: reviewHref };
    case "fork":
      return { text: `${actor} replicated ${named}`, href: studyHref };
    case "osf_push_complete": {
      const doi = typeof p.doi === "string" ? p.doi : undefined;
      const doiUrl = typeof p.url === "string" ? p.url : undefined;
      return { text: `Your preregistration for ${named} is live`, href: studyHref, doi, doiUrl };
    }
    default:
      return { text: `${actor} updated ${named}`, href: studyHref };
  }
}

/** Compact relative time. No Date.now in module scope — computed per render. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
