import { ArrowRight, FlaskConical } from "lucide-react";
import Link from "next/link";

import { openStudyAction, switchWorkspaceAction } from "@/app/actions/switch-workspace";
import { PaginatedList } from "@/components/feature/dashboard/paginated-list";
import { NewStudyButton } from "@/components/feature/new-study/new-study-button";
import type { MeStats, RecentStudy, RecruitingStudy } from "@/server/trpc/routers/me";
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
