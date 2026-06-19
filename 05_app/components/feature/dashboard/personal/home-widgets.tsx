import type { Route } from "next";
import { ArrowRight, BookmarkCheck, FlaskConical } from "lucide-react";
import Link from "next/link";

import { openStudyAction, switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { PaginatedList } from "@/components/feature/dashboard/paginated-list";
import { NewStudyButton } from "@/components/feature/new-study/new-study-button";
import type { FollowsFeedItem } from "@/server/trpc/routers/follows";
import type { SavedStudy } from "@/server/trpc/routers/saved";
import type { MeStats, RecentStudy, RecruitingStudy } from "@/server/trpc/routers/me";
import type { NotificationDTO } from "@/server/trpc/routers/notifications";
import type { WorkspaceListItem } from "@/server/trpc/routers/workspace";

/**
 * User-dashboard (`/home`) widgets (V1.13.0 Stream A, user-dashboard.md). Server
 * components rendered from the page's parallel fetch; each is self-contained so
 * the page can render the others if one data source fails. Tokens only.
 */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

export function WidgetError({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-5">
      <h2 className="font-serif text-[17px] font-medium text-[var(--color-text-primary)]">{title}</h2>
      <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-danger)]">
        Couldn’t load this section. Refresh to try again.
      </p>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{children}</p>;
}

export function WelcomeWidget({ greeting, summary }: { greeting: string; summary: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        {greeting}
      </h1>
      <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{summary}</p>
    </section>
  );
}

export function StatsStrip({ stats }: { stats: MeStats }) {
  const items: { label: string; value: number }[] = [
    { label: "Studies", value: stats.studiesAuthored },
    { label: "Replications", value: stats.replicationsReceived },
    { label: "Followers", value: stats.followers },
    { label: "Participants", value: stats.totalParticipants },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((i) => (
        <div
          key={i.label}
          className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-canvas)] p-4"
        >
          <span className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
            {i.value}
          </span>
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkspacesWidget({
  workspaces,
  activeId,
}: {
  workspaces: WorkspaceListItem[];
  activeId: string | null;
}) {
  return (
    <Card title="Workspaces">
      {workspaces.length === 0 ? (
        <Empty>You’re not in any workspaces yet.</Empty>
      ) : (
        <PaginatedList>
          {workspaces.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  {w.name}
                </div>
                <div className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {w.role} · {w.studyCount} stud{w.studyCount === 1 ? "y" : "ies"}
                </div>
              </div>
              {w.id === activeId ? (
                <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  Active
                </span>
              ) : (
                <form action={switchWorkspaceAction.bind(null, w.id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2.5 py-1 text-[length:var(--text-small)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                  >
                    Switch to
                  </button>
                </form>
              )}
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}

export function RecruitingWidget({ studies }: { studies: RecruitingStudy[] }) {
  return (
    <Card title="Your running studies">
      {studies.length === 0 ? (
        <Empty>No studies are running right now.</Empty>
      ) : (
        <PaginatedList>
          {studies.map((s) => (
            <li key={s.studyId}>
              <form action={openStudyAction.bind(null, s.workspaceId, s.studyId, "run")}>
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-left hover:bg-[var(--color-surface-subtle)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                      {s.title}
                    </span>
                    <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      {s.workspaceName}
                    </span>
                  </span>
                  <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                    {s.currentN}
                    {s.targetN ? ` / ${s.targetN}` : ""} responses
                  </span>
                </button>
              </form>
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}

export function RecentStudiesWidget({ studies }: { studies: RecentStudy[] }) {
  return (
    <Card title="Your recent studies">
      {studies.length === 0 ? (
        <Empty>No studies yet — start one below.</Empty>
      ) : (
        <PaginatedList>
          {studies.map((s) => (
            <li key={s.studyId}>
              <form action={openStudyAction.bind(null, s.workspaceId, s.studyId, "build")}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-left hover:bg-[var(--color-surface-subtle)]"
                >
                  <FlaskConical className="size-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                    {s.title}
                  </span>
                  <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {s.workspaceName}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}

export function QuickActionsWidget() {
  return (
    <Card title="Quick actions">
      <div className="flex flex-wrap items-center gap-2">
        <NewStudyButton variant="topbar" />
        <Link
          href="/activity"
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-1.5 text-[length:var(--text-body-emphasis)] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
        >
          Activity <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

/* ---------- deferred widgets (V1.13.0) — opt-in via Customize ---------- */

/** Compact relative time. No Date.now in module scope — computed per render. */
function relTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function FeedRow({ text, href, when }: { text: string; href: Route | null; when: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-1 py-1 text-[length:var(--text-small)]">
      <span className="min-w-0 truncate text-[var(--color-text-secondary)]">
        {href ? (
          <Link href={href} className="text-[var(--color-text-primary)] hover:underline">
            {text}
          </Link>
        ) : (
          text
        )}
      </span>
      <time className="shrink-0 text-[var(--color-text-muted)]">{relTime(when)}</time>
    </li>
  );
}

function ActivityLink() {
  return (
    <Link
      href="/activity"
      className="mt-1 inline-flex w-fit items-center gap-1 text-[length:var(--text-small)] font-medium text-[var(--color-primary)] hover:opacity-90"
    >
      All activity <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

function notifText(n: NotificationDTO): string {
  const actor = n.actorName ?? "Someone";
  const title = typeof n.payload?.studyTitle === "string" ? `“${n.payload.studyTitle}”` : "your study";
  switch (n.type) {
    case "mention":
      return `${actor} mentioned you`;
    case "comment_on_your_study":
      return `${actor} commented on ${title}`;
    case "comment_resolved":
      return `${actor} resolved a comment on ${title}`;
    case "review_request":
      return `${actor} requested your review on ${title}`;
    case "fork":
      return `${actor} replicated ${title}`;
    case "osf_push_complete":
      return `Your preregistration for ${title} is live`;
    default:
      return `${actor} updated ${title}`;
  }
}

function notifHref(n: NotificationDTO): Route | null {
  const studyId = typeof n.payload?.studyId === "string" ? n.payload.studyId : null;
  if (!studyId) return null;
  const stage = n.type === "fork" || n.type === "osf_push_complete" ? "build" : "share";
  return `/studies/${studyId}/${stage}` as Route;
}

export function NotificationsWidget({ items }: { items: NotificationDTO[] }) {
  return (
    <Card title="Notifications">
      {items.length === 0 ? (
        <Empty>You’re all caught up.</Empty>
      ) : (
        <ul className="flex flex-col">
          {items.map((n) => (
            <FeedRow key={n.id} text={notifText(n)} href={notifHref(n)} when={n.createdAt} />
          ))}
        </ul>
      )}
      <ActivityLink />
    </Card>
  );
}

export function MentionsWidget({ items }: { items: NotificationDTO[] }) {
  return (
    <Card title="Mentions">
      {items.length === 0 ? (
        <Empty>No mentions yet — when a teammate @-mentions you, it shows here.</Empty>
      ) : (
        <ul className="flex flex-col">
          {items.map((n) => (
            <FeedRow key={n.id} text={notifText(n)} href={notifHref(n)} when={n.createdAt} />
          ))}
        </ul>
      )}
      <ActivityLink />
    </Card>
  );
}

function followText(f: FollowsFeedItem): string {
  const actor = f.actorName ?? "Someone";
  const title = f.studyTitle ? `“${f.studyTitle}”` : "a study";
  switch (f.type) {
    case "preregister_complete":
      return `${actor} preregistered ${title}`;
    case "new_named_version":
      return `${actor} saved a new version of ${title}`;
    case "study_finished":
      return `${actor} finished ${title}`;
    case "fork":
      return `${actor} replicated ${title}`;
    case "osf_push_complete":
      return `${title}'s OSF registration is live`;
    default:
      return `${actor} updated ${title}`;
  }
}

export function SavedStudiesWidget({ studies }: { studies: SavedStudy[] }) {
  return (
    <Card title="Saved studies">
      {studies.length === 0 ? (
        <Empty>Nothing saved yet — bookmark a study from Browse to keep it here.</Empty>
      ) : (
        <PaginatedList>
          {studies.map((s) => (
            <li key={s.studyId}>
              <Link
                href={`/browse/${s.studyId}` as Route}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-left hover:bg-[var(--color-surface-subtle)]"
              >
                <BookmarkCheck className="size-3.5 shrink-0 text-[var(--color-primary)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">{s.title}</span>
                {s.finishedAt ? (
                  <span className="shrink-0 rounded-full bg-[var(--color-success-subtle)] px-1.5 py-0.5 text-[length:var(--text-small)] text-[var(--color-success-text-on-subtle)]">Finished</span>
                ) : null}
              </Link>
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}

export function FollowsFeedWidget({ items }: { items: FollowsFeedItem[] }) {
  return (
    <Card title="Following">
      {items.length === 0 ? (
        <Empty>
          Follow a tag, author, framework, or study (look for <strong className="font-medium">+ Follow</strong>) to
          see their updates here.
        </Empty>
      ) : (
        <ul className="flex flex-col">
          {items.map((f) => (
            <FeedRow
              key={f.id}
              text={followText(f)}
              href={f.studyId ? (`/studies/${f.studyId}/build` as Route) : null}
              when={f.createdAt}
            />
          ))}
        </ul>
      )}
      <ActivityLink />
    </Card>
  );
}
