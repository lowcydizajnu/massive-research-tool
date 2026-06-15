import type { ReactNode } from "react";

import { DashboardGrid } from "@/components/feature/dashboard/dashboard-grid";
import {
  ActiveRecruitmentWidget,
  RecentActivityWidget,
  RecentlyEditedWidget,
  WidgetError,
  WorkspaceHeader,
} from "@/components/feature/dashboard/workspace/dashboard-widgets";
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
  const [layout, settled] = await Promise.all([
    api.dashboard.getLayout({ kind: "workspace", workspaceId: active.id }),
    Promise.allSettled([
      api.workspace.dashboardStats(),
      api.workspace.activeRecruitment(),
      api.workspace.recentlyEdited({ limit: 30 }),
      api.workspace.recentActivity({ limit: 30 }),
    ]),
  ]);
  const [stats, recruiting, recent, activity] = settled;

  const nodes: Record<string, ReactNode> = {
    "workspace-header":
      stats.status === "fulfilled" ? (
        <WorkspaceHeader name={active.name} stats={stats.value} />
      ) : (
        <WidgetError title={active.name} />
      ),
    "active-recruitment":
      recruiting.status === "fulfilled" ? (
        <ActiveRecruitmentWidget studies={recruiting.value} />
      ) : (
        <WidgetError title="Active recruitment" />
      ),
    "recently-edited":
      recent.status === "fulfilled" ? (
        <RecentlyEditedWidget studies={recent.value} />
      ) : (
        <WidgetError title="Recently edited" />
      ),
    "workspace-activity":
      activity.status === "fulfilled" ? (
        <RecentActivityWidget items={activity.value} />
      ) : (
        <WidgetError title="Recent activity" />
      ),
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <DashboardGrid kind="workspace" workspaceId={active.id} layout={layout} nodes={nodes} />
    </main>
  );
}
