import type { ReactNode } from "react";

import { DashboardGrid } from "@/components/feature/dashboard/dashboard-grid";
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
 * cross-workspace landing. Resolves the customizable layout (ADR-0045) and
 * pre-renders every personal widget into a keyed map; `DashboardGrid` shows the
 * saved order (masonry) and powers edit mode (drag/add/remove). Each widget's
 * data is fetched in parallel and failures are isolated (allSettled) — one
 * rejected source shows a per-widget error, the rest render.
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
  const [layout, settled] = await Promise.all([
    api.dashboard.getLayout({ kind: "user" }),
    Promise.allSettled([
      api.workspace.active(),
      api.workspace.list(),
      api.me.recentStudies({ limit: 30 }),
      api.me.recruitingStudies(),
      api.me.stats(),
    ]),
  ]);
  const [active, workspaces, recent, recruiting, stats] = settled;

  const activeId = active.status === "fulfilled" ? active.value.id : null;
  const studyCount = stats.status === "fulfilled" ? stats.value.studiesAuthored : 0;
  const recruitingCount = recruiting.status === "fulfilled" ? recruiting.value.length : 0;
  const summary = `${studyCount} stud${studyCount === 1 ? "y" : "ies"} · ${recruitingCount} recruiting now`;

  const nodes: Record<string, ReactNode> = {
    welcome: <WelcomeWidget greeting={greeting(new Date().getHours(), user?.displayName ?? "")} summary={summary} />,
    "your-stats": stats.status === "fulfilled" ? <StatsStrip stats={stats.value} /> : <WidgetError title="Your stats" />,
    "recruiting-studies":
      recruiting.status === "fulfilled" ? (
        <RecruitingWidget studies={recruiting.value} />
      ) : (
        <WidgetError title="Your recruiting studies" />
      ),
    "workspaces-card":
      workspaces.status === "fulfilled" ? (
        <WorkspacesWidget workspaces={workspaces.value} activeId={activeId} />
      ) : (
        <WidgetError title="Workspaces" />
      ),
    "recent-studies":
      recent.status === "fulfilled" ? (
        <RecentStudiesWidget studies={recent.value} />
      ) : (
        <WidgetError title="Your recent studies" />
      ),
    "quick-actions": <QuickActionsWidget />,
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <DashboardGrid kind="user" layout={layout} nodes={nodes} />
    </main>
  );
}
