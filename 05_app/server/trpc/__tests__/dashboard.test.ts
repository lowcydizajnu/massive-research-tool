/**
 * dashboardRouter tests (ADR-0045 / N5.1) — per-user layout overrides + the
 * admin "house default", over a real migrated PGlite DB via a direct caller.
 */
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/server/db/schema");
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./server/db/migrations" });
  return { db, schema };
});

vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  activityEvent,
  condition,
  dashboardLayout,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  user,
  workspace,
  workspaceDashboardDefault,
} from "@/server/db/schema";
import {
  USER_DASHBOARD_DEFAULT_LAYOUT,
  WORKSPACE_DASHBOARD_DEFAULT_LAYOUT,
} from "@/lib/dashboard/widget-registry";
import { resolveOpenRecruitment } from "@/server/runtime/participant";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(externalId: string): AuthUser {
  return {
    id: externalId,
    email: `${externalId}@example.com`,
    displayName: externalId,
    avatarUrl: null,
    hasCompletedOnboarding: true,
  };
}

async function seedUserWithWorkspace(externalId: string, wsName: string) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

/** Add an existing-or-new user to a workspace with a given role. */
async function addMember(workspaceId: string, externalId: string, role: "admin" | "editor" | "viewer") {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  await db.insert(member).values({ workspaceId, userId: u.id, role, status: "active" });
  return u;
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Break the experiment <-> experiment_version circular FKs before deleting versions.
  await db.update(experiment).set({ currentVersionId: null, forkOfVersionId: null, forkOfExperimentId: null });
  // Children first (FK order), then the layout/tenancy tables.
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(activityEvent);
  await db.delete(dashboardLayout);
  await db.delete(workspaceDashboardDefault);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("dashboard.getLayout / saveLayout / resetLayout — user dashboard", () => {
  it("returns the code default for a fresh user", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const layout = await caller.dashboard.getLayout({ kind: "user" });
    expect(layout.map((w) => w.widgetKey)).toEqual(USER_DASHBOARD_DEFAULT_LAYOUT);
  });

  it("save → get round-trips the custom order + settings; reset falls back to default", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });

    await caller.dashboard.saveLayout({
      kind: "user",
      widgets: [
        { widgetKey: "quick-actions" },
        { widgetKey: "recent-studies", settings: { itemCount: 5 } },
      ],
    });
    const saved = await caller.dashboard.getLayout({ kind: "user" });
    expect(saved).toEqual([
      { widgetKey: "quick-actions", settings: undefined },
      { widgetKey: "recent-studies", settings: { itemCount: 5 } },
    ]);

    await caller.dashboard.resetLayout({ kind: "user" });
    const afterReset = await caller.dashboard.getLayout({ kind: "user" });
    expect(afterReset.map((w) => w.widgetKey)).toEqual(USER_DASHBOARD_DEFAULT_LAYOUT);
  });

  it("saveLayout upserts a single row (saving twice updates, not duplicates)", async () => {
    const { user: u } = await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    await caller.dashboard.saveLayout({ kind: "user", widgets: [{ widgetKey: "welcome" }] });
    await caller.dashboard.saveLayout({ kind: "user", widgets: [{ widgetKey: "your-stats" }] });

    const rows = await db
      .select()
      .from(dashboardLayout)
      .where(and(eq(dashboardLayout.userId, u.id), eq(dashboardLayout.dashboardKind, "user")));
    expect(rows).toHaveLength(1);
    const latest = await caller.dashboard.getLayout({ kind: "user" });
    expect(latest.map((w) => w.widgetKey)).toEqual(["your-stats"]);
  });
});

describe("dashboard — workspace dashboard + admin default", () => {
  it("default → workspace code default; a per-user override beats it", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_owner", "Lab");
    const caller = createCaller({ authUser: authUser("ext_owner") });

    const def = await caller.dashboard.getLayout({ kind: "workspace", workspaceId: ws.id });
    expect(def.map((w) => w.widgetKey)).toEqual(WORKSPACE_DASHBOARD_DEFAULT_LAYOUT);

    await caller.dashboard.saveLayout({
      kind: "workspace",
      workspaceId: ws.id,
      widgets: [{ widgetKey: "workspace-activity" }],
    });
    const mine = await caller.dashboard.getLayout({ kind: "workspace", workspaceId: ws.id });
    expect(mine.map((w) => w.widgetKey)).toEqual(["workspace-activity"]);
  });

  it("an admin default is inherited by a member with no override, but not over their own", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_owner", "Lab");
    await addMember(ws.id, "ext_member", "editor");
    const owner = createCaller({ authUser: authUser("ext_owner") });
    const memberCaller = createCaller({ authUser: authUser("ext_member") });

    // Owner sets the house default.
    await owner.dashboard.setWorkspaceDefault({
      workspaceId: ws.id,
      widgets: [{ widgetKey: "recently-edited" }, { widgetKey: "workspace-header" }],
    });

    // The member (no override) inherits it.
    const inherited = await memberCaller.dashboard.getLayout({ kind: "workspace", workspaceId: ws.id });
    expect(inherited.map((w) => w.widgetKey)).toEqual(["recently-edited", "workspace-header"]);

    // The member's own override wins for them only.
    await memberCaller.dashboard.saveLayout({
      kind: "workspace",
      workspaceId: ws.id,
      widgets: [{ widgetKey: "active-recruitment" }],
    });
    const mine = await memberCaller.dashboard.getLayout({ kind: "workspace", workspaceId: ws.id });
    expect(mine.map((w) => w.widgetKey)).toEqual(["active-recruitment"]);
    // Owner still sees the house default (no personal override of their own).
    const ownerView = await owner.dashboard.getLayout({ kind: "workspace", workspaceId: ws.id });
    expect(ownerView.map((w) => w.widgetKey)).toEqual(["recently-edited", "workspace-header"]);
  });

  it("setWorkspaceDefault is owner/admin-only", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_owner", "Lab");
    await addMember(ws.id, "ext_viewer", "viewer");
    const viewer = createCaller({ authUser: authUser("ext_viewer") });
    await expect(
      viewer.dashboard.setWorkspaceDefault({ workspaceId: ws.id, widgets: [{ widgetKey: "workspace-header" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await addMember(ws.id, "ext_admin", "admin");
    const admin = createCaller({ authUser: authUser("ext_admin") });
    await expect(
      admin.dashboard.setWorkspaceDefault({ workspaceId: ws.id, widgets: [{ widgetKey: "workspace-header" }] }),
    ).resolves.toEqual({ ok: true });
  });

  it("a non-member can't read or write a workspace layout", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_owner", "Lab");
    await seedUserWithWorkspace("ext_outsider", "Other"); // member of a different workspace
    const outsider = createCaller({ authUser: authUser("ext_outsider") });
    await expect(
      outsider.dashboard.getLayout({ kind: "workspace", workspaceId: ws.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      outsider.dashboard.saveLayout({ kind: "workspace", workspaceId: ws.id, widgets: [{ widgetKey: "workspace-header" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("workspace kind requires a workspaceId", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    await expect(caller.dashboard.getLayout({ kind: "workspace" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("canSetWorkspaceDefault is true for owner/admin, false for viewer/non-member", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_owner", "Lab");
    await addMember(ws.id, "ext_admin", "admin");
    await addMember(ws.id, "ext_viewer", "viewer");
    await seedUserWithWorkspace("ext_out", "Other"); // member of a different workspace

    const can = (ext: string) =>
      createCaller({ authUser: authUser(ext) }).dashboard.canSetWorkspaceDefault({ workspaceId: ws.id });
    expect(await can("ext_owner")).toBe(true);
    expect(await can("ext_admin")).toBe(true);
    expect(await can("ext_viewer")).toBe(false);
    expect(await can("ext_out")).toBe(false);
  });
});

describe("dashboard.customData (ADR-0045 amendment — custom data widgets)", () => {
  it("studies metric: own studies (user) / workspace studies; archived + other-tenant excluded", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const b = await seedUserWithWorkspace("ext_b", "Beta");
    await db.insert(experiment).values([
      { tenantId: a.workspace.id, ownerId: a.user.id, title: "A1" },
      { tenantId: a.workspace.id, ownerId: a.user.id, title: "A2" },
      { tenantId: a.workspace.id, ownerId: a.user.id, title: "A-archived", archivedAt: new Date() },
      { tenantId: b.workspace.id, ownerId: b.user.id, title: "B1" }, // other tenant — must not leak
    ]);
    const caller = createCaller({ authUser: authUser("ext_a") });

    expect(await caller.dashboard.customData({ kind: "user", source: "studies" })).toEqual({
      type: "metric",
      label: "Studies",
      value: 2,
    });
    expect(
      await caller.dashboard.customData({ kind: "workspace", workspaceId: a.workspace.id, source: "studies" }),
    ).toMatchObject({ type: "metric", value: 2 });
  });

  it("recent-studies: newest-first list of study links, capped by itemCount", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const now = Date.now();
    const rows = await db
      .insert(experiment)
      .values([
        { tenantId: a.workspace.id, ownerId: a.user.id, title: "Oldest", updatedAt: new Date(now - 3000) },
        { tenantId: a.workspace.id, ownerId: a.user.id, title: "Middle", updatedAt: new Date(now - 2000) },
        { tenantId: a.workspace.id, ownerId: a.user.id, title: "Newest", updatedAt: new Date(now - 1000) },
      ])
      .returning();
    const id = (t: string) => rows.find((r) => r.title === t)!.id;
    const caller = createCaller({ authUser: authUser("ext_a") });

    const res = await caller.dashboard.customData({ kind: "user", source: "recent-studies", itemCount: 2 });
    expect(res).toEqual({
      type: "list",
      label: "Recent studies",
      items: [
        { id: id("Newest"), text: "Newest", href: `/studies/${id("Newest")}/build` },
        { id: id("Middle"), text: "Middle", href: `/studies/${id("Middle")}/build` },
      ],
    });
  });

  it("responses metric honours the date range; preview + incomplete excluded", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const HOUR = 3_600_000;
    const DAY = 24 * HOUR;
    const now = Date.now();

    // A published, recruiting study owned by ext_a.
    const study = await caller.studies.create({ kind: "blank", title: "Recruit" });
    await caller.studies.addCondition({ studyId: study.id, name: "Control" });
    await caller.studies.publish({ studyId: study.id });
    await caller.studies.openRecruitment({ studyId: study.id });
    const open = await resolveOpenRecruitment(study.id);
    const [pub] = await db
      .select()
      .from(experimentVersion)
      .where(and(eq(experimentVersion.experimentId, study.id), eq(experimentVersion.kind, "published")));
    const [cond] = await db.select().from(condition).where(eq(condition.experimentVersionId, pub.id));

    const mkResponse = (over: Record<string, unknown>) =>
      db.insert(response).values({
        id: ulid(),
        recruitmentSessionId: open!.recruitmentSessionId,
        experimentVersionId: pub.id,
        conditionId: cond.id,
        mode: "run",
        status: "completed",
        ...over,
      });
    await mkResponse({ completedAt: new Date(now - 2 * HOUR) }); // within 7d
    await mkResponse({ completedAt: new Date(now - 2 * HOUR) }); // within 7d
    await mkResponse({ completedAt: new Date(now - 10 * DAY) }); // all-time only
    await mkResponse({ mode: "preview", completedAt: new Date(now - HOUR) }); // excluded — preview
    await mkResponse({ status: "started" }); // excluded — incomplete

    expect(
      await caller.dashboard.customData({ kind: "user", source: "responses", dateRange: "7d" }),
    ).toMatchObject({ type: "metric", value: 2 });
    expect(
      await caller.dashboard.customData({ kind: "user", source: "responses", dateRange: "all" }),
    ).toMatchObject({ type: "metric", value: 3 });
  });

  it("recent-activity lists workspace events with study links", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await db.insert(activityEvent).values({
      id: ulid(),
      type: "fork",
      workspaceId: a.workspace.id,
      targetType: "study",
      targetId: "s1",
      relatedStudyId: "s1",
      payload: { studyTitle: "Forked" },
    });
    const caller = createCaller({ authUser: authUser("ext_a") });

    const res = await caller.dashboard.customData({
      kind: "workspace",
      workspaceId: a.workspace.id,
      source: "recent-activity",
      itemCount: 5,
    });
    if (res.type !== "list") throw new Error("expected a list");
    expect(res.items[0]).toMatchObject({ text: expect.stringContaining("fork"), href: "/studies/s1/build" });
  });

  it("rejects an unknown source, a workspace-only source on /home, and a non-member", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_out", "Outsider"); // member of a different workspace
    const caller = createCaller({ authUser: authUser("ext_a") });
    const outsider = createCaller({ authUser: authUser("ext_out") });

    await expect(caller.dashboard.customData({ kind: "user", source: "nope" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // recent-activity is offered on the workspace dashboard only.
    await expect(
      caller.dashboard.customData({ kind: "user", source: "recent-activity" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      outsider.dashboard.customData({ kind: "workspace", workspaceId: a.workspace.id, source: "studies" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
