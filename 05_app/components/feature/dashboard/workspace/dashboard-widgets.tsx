import type { Route } from "next";
import Link from "next/link";

import { PaginatedList } from "@/components/feature/dashboard/paginated-list";

import type {
  WorkspaceActivityItem,
  WorkspaceDashboardStats,
  WorkspaceRecentStudy,
  WorkspaceRecruitingStudy,
} from "@/server/trpc/routers/workspace";

/**
 * Workspace-dashboard (`/dashboard`) widgets (V1.13.0 Stream B,
 * workspace-dashboard.md). Server components rendered from the page's parallel
 * fetch; each is self-contained for per-widget error isolation. Studies are in
 * the active workspace, so links are plain (no workspace switch). Tokens only.
 * (Card/Empty/WidgetError are intentionally local — small, and kept off the
 * freshly-deployed personal widgets file.)
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

export function WorkspaceHeader({ name, stats }: { name: string; stats: WorkspaceDashboardStats }) {
  const items = [
    { label: "Studies", value: stats.totalStudies },
    { label: "Recruiting", value: stats.recruiting },
    { label: "Responses this week", value: stats.responsesThisWeek },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-serif text-[length:var(--text-display)] font-medium text-[var(--color-text-primary)]">
        {name}
      </h1>
      <div className="grid grid-cols-3 gap-3">
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
    </section>
  );
}

export function ActiveRecruitmentWidget({ studies }: { studies: WorkspaceRecruitingStudy[] }) {
  return (
    <Card title="Active recruitment">
      {studies.length === 0 ? (
        <Empty>No studies are recruiting right now.</Empty>
      ) : (
        <PaginatedList>
          {studies.map((s) => (
            <li key={s.studyId}>
              <Link
                href={`/studies/${s.studyId}/run` as Route}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 hover:bg-[var(--color-surface-subtle)]"
              >
                <span className="min-w-0 truncate text-[length:var(--text-body)] text-[var(--color-text-primary)]">
                  {s.title}
                </span>
                <span className="shrink-0 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
                  {s.currentN}
                  {s.targetN ? ` / ${s.targetN}` : ""} responses
                </span>
              </Link>
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}

export function RecentlyEditedWidget({ studies }: { studies: WorkspaceRecentStudy[] }) {
  return (
    <Card title="Recently edited">
      {studies.length === 0 ? (
        <Empty>No studies yet.</Empty>
      ) : (
        <PaginatedList>
          {studies.map((s) => (
            <li key={s.studyId}>
              <Link
                href={`/studies/${s.studyId}/build` as Route}
                className="block truncate rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]"
              >
                {s.title}
              </Link>
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  preregister_complete: "Preregistered",
  osf_push_complete: "OSF push complete",
  review_request: "Review requested",
  fork_created: "Replicated",
  comment_added: "New comment",
  mention: "Mention",
};

function activityLabel(type: string): string {
  return ACTIVITY_LABEL[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function RecentActivityWidget({ items }: { items: WorkspaceActivityItem[] }) {
  return (
    <Card title="Recent activity">
      {items.length === 0 ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <PaginatedList>
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-1 py-1.5 text-[length:var(--text-small)]"
            >
              <span className="min-w-0 truncate text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-text-primary)]">{activityLabel(a.type)}</span>
                {a.studyTitle ? ` · ${a.studyTitle}` : ""}
              </span>
            </li>
          ))}
        </PaginatedList>
      )}
    </Card>
  );
}
