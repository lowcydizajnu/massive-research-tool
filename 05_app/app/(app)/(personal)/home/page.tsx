import {
  QuickActionsWidget,
  RecentStudiesWidget,
  RecruitingWidget,
  StatsStrip,
  WelcomeWidget,
  WidgetError,
  WorkspacesWidget,
} from "@/components/feature/dashboard/personal/home-widgets";
import { auth } from "@/server/adapters/auth";
import { getServerApi } from "@/server/trpc/server";

/**
 * User dashboard — `/home` (personal mode, ADR-0033 / user-dashboard.md). The
 * cross-workspace landing. Fetches each widget's data in parallel and isolates
 * failures (allSettled): one rejected source shows a per-widget error, the rest
 * render. Customization (drag/add/remove) is Stream F; this is the fixed default.
 */
export const dynamic = "force-dynamic";

function greeting(hour: number, name: string): string {
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}.` : `${part}.`;
}

export default async function HomePage() {
  const api = await getServerApi();
  const user = await auth.getCurrentUser();
  const [active, workspaces, recent, recruiting, stats] = await Promise.allSettled([
    api.workspace.active(),
    api.workspace.list(),
    api.me.recentStudies({ limit: 6 }),
    api.me.recruitingStudies(),
    api.me.stats(),
  ]);

  const activeId = active.status === "fulfilled" ? active.value.id : null;
  const studyCount = stats.status === "fulfilled" ? stats.value.studiesAuthored : 0;
  const recruitingCount = recruiting.status === "fulfilled" ? recruiting.value.length : 0;
  const summary = `${studyCount} stud${studyCount === 1 ? "y" : "ies"} · ${recruitingCount} recruiting now`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <WelcomeWidget greeting={greeting(new Date().getHours(), user?.displayName ?? "")} summary={summary} />

      {stats.status === "fulfilled" ? <StatsStrip stats={stats.value} /> : <WidgetError title="Your stats" />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {recruiting.status === "fulfilled" ? (
          <RecruitingWidget studies={recruiting.value} />
        ) : (
          <WidgetError title="Your recruiting studies" />
        )}
        {workspaces.status === "fulfilled" ? (
          <WorkspacesWidget workspaces={workspaces.value} activeId={activeId} />
        ) : (
          <WidgetError title="Workspaces" />
        )}
        {recent.status === "fulfilled" ? (
          <RecentStudiesWidget studies={recent.value} />
        ) : (
          <WidgetError title="Your recent studies" />
        )}
        <QuickActionsWidget />
      </div>
    </main>
  );
}
