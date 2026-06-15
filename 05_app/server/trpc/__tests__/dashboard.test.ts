/**
 * dashboardRouter tests (ADR-0045 / N5.1) — per-user layout overrides + the
 * admin "house default", over a real migrated PGlite DB via a direct caller.
 */
import { and, eq } from "drizzle-orm";
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
import { dashboardLayout, member, user, workspace, workspaceDashboardDefault } from "@/server/db/schema";
import {
  USER_DASHBOARD_DEFAULT_LAYOUT,
  WORKSPACE_DASHBOARD_DEFAULT_LAYOUT,
} from "@/lib/dashboard/widget-registry";
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
});
