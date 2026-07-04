/**
 * workspaceRouter — activity-filter prefs (V1.14 T4 / ADR-0046). recentActivity
 * honors workspace.activity_filter_kinds; updateActivityFilter is owner/admin.
 */
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

import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  activityEvent,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  user,
  workspace,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const authUser = (ext: string): AuthUser => ({
  id: ext,
  email: `${ext}@e.com`,
  displayName: ext,
  avatarUrl: null,
  hasCompletedOnboarding: true,
});

async function seedWs(role: "owner" | "admin" | "editor" | "viewer" = "owner") {
  const [u] = await db.insert(user).values({ externalId: "u", email: "u@e.com", displayName: "u" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role, status: "active" });
  // Two events: one study-activity (fork), one member-management (member_removed).
  for (const type of ["fork", "member_removed"]) {
    await db.insert(activityEvent).values({
      id: ulid(),
      type,
      workspaceId: ws.id,
      actorUserId: u.id,
      targetType: type === "fork" ? "study" : "member",
      targetId: "x",
    });
  }
  return ws;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.update(experiment).set({ currentVersionId: null });
  // FK order: recruitment → version → experiment → activity/member → workspace → user.
  await db.delete(recruitmentSession);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(activityEvent);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("workspace.create", () => {
  it("creates a workspace owned by the caller and lists it", async () => {
    const ws = await seedWs("owner");
    expect(ws.id).toBeTruthy();
    const caller = createCaller({ authUser: authUser("u") });

    const { id } = await caller.workspace.create({ name: "My Second Lab" });
    const rows = await caller.workspace.list();
    const created = rows.find((w) => w.id === id);
    expect(created).toBeTruthy();
    expect(created!.name).toBe("My Second Lab");
    expect(created!.slug).toBe("my-second-lab");
    expect(created!.role).toBe("owner");
    expect(created!.studyCount).toBe(0);
  });

  it("de-duplicates slugs across workspaces", async () => {
    await seedWs("owner"); // existing slug "lab"
    const caller = createCaller({ authUser: authUser("u") });
    const { id } = await caller.workspace.create({ name: "Lab" });
    const created = (await caller.workspace.list()).find((w) => w.id === id);
    expect(created!.slug).toBe("lab-2");
  });
});

describe("workspace activity filter", () => {
  it("recentActivity shows all kinds by default, hides the configured ones", async () => {
    await seedWs("owner");
    const caller = createCaller({ authUser: authUser("u") });

    expect((await caller.workspace.recentActivity({ limit: 10 })).map((a) => a.type).sort()).toEqual([
      "fork",
      "member_removed",
    ]);

    await caller.workspace.updateActivityFilter({ hiddenKinds: ["member_removed"] });
    expect((await caller.workspace.active()).activityFilterKinds).toEqual(["member_removed"]);
    expect((await caller.workspace.recentActivity({ limit: 10 })).map((a) => a.type)).toEqual(["fork"]);
  });

  it("only owners/admins can change the filter", async () => {
    await seedWs("editor");
    const editor = createCaller({ authUser: authUser("u") });
    await expect(editor.workspace.updateActivityFilter({ hiddenKinds: ["fork"] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("workspace archive & restore (ADR-0090)", () => {
  it("owner archives the active workspace (even their last) → hidden from list; unarchive restores it", async () => {
    const ws = await seedWs("owner");
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.externalId, "u"));
    await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "S1" });
    const caller = createCaller({ authUser: authUser("u") });

    expect((await caller.workspace.list()).some((w) => w.id === ws.id)).toBe(true);

    // Archiving the ONLY workspace is allowed — Home catches you (no last-workspace block).
    await caller.workspace.archive();

    expect((await caller.workspace.list()).some((w) => w.id === ws.id)).toBe(false);
    const archived = await caller.workspace.listArchived();
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({ id: ws.id, name: "Lab", studyCount: 1 });

    await caller.workspace.unarchive({ workspaceId: ws.id });
    expect((await caller.workspace.list()).some((w) => w.id === ws.id)).toBe(true);
    expect(await caller.workspace.listArchived()).toHaveLength(0);
  });

  it("blocks archive while a study is recruiting, and names it", async () => {
    const ws = await seedWs("owner");
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.externalId, "u"));
    const [exp] = await db
      .insert(experiment)
      .values({ tenantId: ws.id, ownerId: u.id, title: "Live Study" })
      .returning();
    const [ver] = await db
      .insert(experimentVersion)
      .values({
        experimentId: exp.id,
        versionNumber: 1,
        kind: "published",
        name: "v1",
        definitionSnapshot: { blocks: [] },
        moduleVersionLocks: {},
        createdBy: u.id,
      })
      .returning();
    await db.insert(recruitmentSession).values({ id: "rs-live", experimentVersionId: ver.id, status: "open" });

    const caller = createCaller({ authUser: authUser("u") });
    await expect(caller.workspace.archive()).rejects.toThrow(/Live Study/);
    expect((await caller.workspace.archiveBlockers()).recruitingStudies.map((s) => s.title)).toEqual([
      "Live Study",
    ]);
    // Not archived — still in the list.
    expect((await caller.workspace.list()).some((w) => w.id === ws.id)).toBe(true);
  });

  it("only the owner can archive or restore", async () => {
    const [owner] = await db
      .insert(user)
      .values({ externalId: "owner", email: "o@e.com", displayName: "o" })
      .returning();
    const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: owner.id }).returning();
    const [ed] = await db.insert(user).values({ externalId: "ed", email: "e@e.com", displayName: "e" }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: ed.id, role: "editor", status: "active" });

    const caller = createCaller({ authUser: authUser("ed") });
    await expect(caller.workspace.archive()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.unarchive({ workspaceId: ws.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("workspace.rename (ADR-0092)", () => {
  it("owner renames — name changes (trimmed), slug stays stable", async () => {
    const ws = await seedWs("owner");
    await createCaller({ authUser: authUser("u") }).workspace.rename({
      workspaceId: ws.id,
      name: "  Misinfo Lab  ",
    });
    const [row] = await db.select().from(workspace).where(eq(workspace.id, ws.id));
    expect(row.name).toBe("Misinfo Lab");
    expect(row.slug).toBe("lab"); // slug is immutable (ADR-0092)
  });

  it("admin can rename; editor cannot; a non-member is NOT_FOUND", async () => {
    const ws = await seedWs("owner"); // owner is user "u"
    const [adm] = await db
      .insert(user)
      .values({ externalId: "adm", email: "adm@e.com", displayName: "adm" })
      .returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: adm.id, role: "admin", status: "active" });
    const [ed] = await db
      .insert(user)
      .values({ externalId: "ed", email: "ed@e.com", displayName: "ed" })
      .returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: ed.id, role: "editor", status: "active" });
    await db.insert(user).values({ externalId: "out", email: "out@e.com", displayName: "out" });

    await createCaller({ authUser: authUser("adm") }).workspace.rename({ workspaceId: ws.id, name: "By Admin" });
    expect((await db.select().from(workspace).where(eq(workspace.id, ws.id)))[0].name).toBe("By Admin");

    await expect(
      createCaller({ authUser: authUser("ed") }).workspace.rename({ workspaceId: ws.id, name: "By Editor" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createCaller({ authUser: authUser("out") }).workspace.rename({ workspaceId: ws.id, name: "By Outsider" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The rejected attempts didn't mutate the name.
    expect((await db.select().from(workspace).where(eq(workspace.id, ws.id)))[0].name).toBe("By Admin");
  });
});
