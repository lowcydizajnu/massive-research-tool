import type { ReactNode } from "react";

import { PersonalTabs } from "@/components/chrome/personal-tabs";
import { DashboardGrid } from "@/components/feature/dashboard/dashboard-grid";
import { LiveRefresh } from "@/components/feature/live-refresh";
import {
  FollowsFeedWidget,
  MentionsWidget,
  NotificationsWidget,
  QuickActionsWidget,
  RecentStudiesWidget,
  RecruitingWidget,
  SavedStudiesWidget,
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
      api.follows.feed(),
      api.notifications.list(),
      api.saved.list(),
    ]),
  ]);
  const [active, workspaces, recent, recruiting, stats, follows, notifications, saved] = settled;
  const notifs = notifications.status === "fulfilled" ? notifications.value : [];

  const activeId = active.status === "fulfilled" ? active.value.id : null;
  const studyCount = stats.status === "fulfilled" ? stats.value.studiesAuthored : 0;
  const recruitingCount = recruiting.status === "fulfilled" ? recruiting.value.length : 0;
  const summary = `${studyCount} stud${studyCount === 1 ? "y" : "ies"} · ${recruitingCount} running now`;

  // Per-widget settings (ADR-0045): cap a list to the widget's resolved itemCount.
  const limitFor = (key: string): number | undefined => {
    const v = layout.find((e) => e.widgetKey === key)?.settings?.itemCount;
    return typeof v === "number" ? v : undefined;
  };
  const cap = <T,>(arr: T[], n: number | undefined): T[] => (typeof n === "number" ? arr.slice(0, n) : arr);

  const nodes: Record<string, ReactNode> = {
    welcome: <WelcomeWidget greeting={greeting(new Date().getHours(), user?.displayName ?? "")} summary={summary} />,
    "your-stats": stats.status === "fulfilled" ? <StatsStrip stats={stats.value} /> : <WidgetError title="Your stats" />,
    "recruiting-studies":
      recruiting.status === "fulfilled" ? (
        <RecruitingWidget studies={cap(recruiting.value, limitFor("recruiting-studies"))} />
      ) : (
        <WidgetError title="Your running studies" />
      ),
    "workspaces-card":
      workspaces.status === "fulfilled" ? (
        <WorkspacesWidget workspaces={workspaces.value} activeId={activeId} />
      ) : (
        <WidgetError title="Workspaces" />
      ),
    "recent-studies":
      recent.status === "fulfilled" ? (
        <RecentStudiesWidget studies={cap(recent.value, limitFor("recent-studies"))} />
      ) : (
        <WidgetError title="Your recent studies" />
      ),
    "quick-actions": <QuickActionsWidget />,
    "saved-studies":
      saved.status === "fulfilled" ? (
        <SavedStudiesWidget studies={cap(saved.value, limitFor("saved-studies") ?? 6)} />
      ) : (
        <WidgetError title="Saved studies" />
      ),
    "follows-feed":
      follows.status === "fulfilled" ? (
        <FollowsFeedWidget items={cap(follows.value, limitFor("follows-feed") ?? 6)} />
      ) : (
        <WidgetError title="Following" />
      ),
    notifications:
      notifications.status === "fulfilled" ? (
        <NotificationsWidget items={cap(notifs, limitFor("notifications") ?? 6)} />
      ) : (
        <WidgetError title="Notifications" />
      ),
    "mentions-inbox":
      notifications.status === "fulfilled" ? (
        <MentionsWidget items={cap(notifs.filter((n) => n.type === "mention"), limitFor("mentions-inbox") ?? 6)} />
      ) : (
        <WidgetError title="Mentions" />
      ),
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <LiveRefresh />
      <DashboardGrid kind="user" layout={layout} nodes={nodes} headerLeft={<PersonalTabs />} />
    </main>
  );
}
