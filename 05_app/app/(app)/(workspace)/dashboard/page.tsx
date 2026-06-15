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
 * V1.13.0 Stream B). The team overview a member lands on when entering a
 * workspace; Studies stays a sibling destination. Parallel fetch with per-widget
 * error isolation (allSettled). `items-start` so cards size to content. Fixed
 * default layout; customization is Stream F.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardPage() {
  const api = await getServerApi();
  const [active, stats, recruiting, recent, activity] = await Promise.allSettled([
    api.workspace.active(),
    api.workspace.dashboardStats(),
    api.workspace.activeRecruitment(),
    api.workspace.recentlyEdited({ limit: 30 }),
    api.workspace.recentActivity({ limit: 30 }),
  ]);
  const name = active.status === "fulfilled" ? active.value.name : "Workspace";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {stats.status === "fulfilled" ? (
        <WorkspaceHeader name={name} stats={stats.value} />
      ) : (
        <WidgetError title={name} />
      )}

      {/* CSS multi-column (masonry) so cards pack to content without gaps. */}
      <div className="columns-1 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {recruiting.status === "fulfilled" ? (
          <ActiveRecruitmentWidget studies={recruiting.value} />
        ) : (
          <WidgetError title="Active recruitment" />
        )}
        {recent.status === "fulfilled" ? (
          <RecentlyEditedWidget studies={recent.value} />
        ) : (
          <WidgetError title="Recently edited" />
        )}
        {activity.status === "fulfilled" ? (
          <RecentActivityWidget items={activity.value} />
        ) : (
          <WidgetError title="Recent activity" />
        )}
      </div>
    </main>
  );
}
