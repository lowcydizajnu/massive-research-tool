import type { ReactNode } from "react";

import { DashboardGrid } from "@/components/feature/dashboard/dashboard-grid";
import { GettingStartedCard } from "@/components/feature/onboarding/getting-started-card";
import { LiveRefresh } from "@/components/feature/live-refresh";
import {
  ActiveRecruitmentWidget,
  RecentActivityWidget,
  RecentForksWidget,
  RecentlyEditedWidget,
  TopTagsWidget,
  WidgetError,
  WorkspaceHeader,
} from "@/components/feature/dashboard/workspace/dashboard-widgets";
import { auth } from "@/server/adapters/auth";
import { getServerApi } from "@/server/trpc/server";

/**
 * Workspace dashboard — `/dashboard` (workspace mode, workspace-dashboard.md /
 * V1.13.0 Stream B). The team overview a member lands on; Studies stays a
 * sibling destination. Resolves the customizable layout (ADR-0045), pre-renders
 * every workspace widget into a keyed map, and hands the saved order to
 * `DashboardGrid` (masonry in view; drag/add/remove in edit). Parallel fetch
 * with per-widget error isolation (allSettled).
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardPage() {
  const api = await getServerApi();
  const active = await api.workspace.active(); // the workspace the layout + widgets are scoped to
  const [layout, canSetDefault, settled] = await Promise.all([
    api.dashboard.getLayout({ kind: "workspace", workspaceId: active.id }),
    api.dashboard.canSetWorkspaceDefault({ workspaceId: active.id }),
    Promise.allSettled([
      api.workspace.dashboardStats(),
      api.workspace.activeRecruitment(),
      api.workspace.recentlyEdited({ limit: 30 }),
      api.workspace.recentActivity({ limit: 30 }),
      api.workspace.topTags(),
      api.workspace.recentForks({ limit: 20 }),
    ]),
  ]);
  const [stats, recruiting, recent, activity, topTags, recentForks] = settled;
  // The getting-started card is pinned above the grid on both dashboards (ADR-0045
  // am.); a failure just hides it. `dismissed` is resolved server-side (no client
  // flash) from the same identity. On the workspace dashboard the study/team steps
  // are scoped to THIS workspace (owner 2026-07-03) — pass its id.
  const [gettingStarted, currentUser] = await Promise.all([
    api.me.gettingStarted({ workspaceId: active.id }).catch(() => null),
    auth.getCurrentUser(),
  ]);

  // Per-widget settings (ADR-0045): cap a list to the widget's resolved itemCount.
  const limitFor = (key: string): number | undefined => {
    const v = layout.find((e) => e.widgetKey === key)?.settings?.itemCount;
    return typeof v === "number" ? v : undefined;
  };
  const cap = <T,>(arr: T[], n: number | undefined): T[] => (typeof n === "number" ? arr.slice(0, n) : arr);

  // The header's KPI count is its own widget setting (Off / 3 / 4 / 5).
  const headerKpiCount = (() => {
    const v = layout.find((e) => e.widgetKey === "workspace-header")?.settings?.kpiCount;
    return typeof v === "number" ? v : 3;
  })();

  const nodes: Record<string, ReactNode> = {
    "workspace-header":
      stats.status === "fulfilled" ? (
        <WorkspaceHeader name={active.name} stats={stats.value} kpiCount={headerKpiCount} />
      ) : (
        <WidgetError title={active.name} />
      ),
    "active-recruitment":
      recruiting.status === "fulfilled" ? (
        <ActiveRecruitmentWidget studies={cap(recruiting.value, limitFor("active-recruitment"))} />
      ) : (
        <WidgetError title="Running studies" />
      ),
    "recently-edited":
      recent.status === "fulfilled" ? (
        <RecentlyEditedWidget studies={cap(recent.value, limitFor("recently-edited"))} />
      ) : (
        <WidgetError title="Recently edited" />
      ),
    "workspace-activity":
      activity.status === "fulfilled" ? (
        <RecentActivityWidget items={cap(activity.value, limitFor("workspace-activity"))} />
      ) : (
        <WidgetError title="Recent activity" />
      ),
    "top-tags":
      topTags.status === "fulfilled" ? (
        <TopTagsWidget tags={topTags.value} />
      ) : (
        <WidgetError title="Top tags" />
      ),
    "recent-forks":
      recentForks.status === "fulfilled" ? (
        <RecentForksWidget items={cap(recentForks.value, limitFor("recent-forks"))} />
      ) : (
        <WidgetError title="Recent replications" />
      ),
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <LiveRefresh />
      {gettingStarted ? (
        <GettingStartedCard state={gettingStarted} dismissed={currentUser?.dismissedGettingStarted ?? false} />
      ) : null}
      <DashboardGrid
        kind="workspace"
        workspaceId={active.id}
        layout={layout}
        nodes={nodes}
        canSetWorkspaceDefault={canSetDefault}
      />
    </main>
  );
}
