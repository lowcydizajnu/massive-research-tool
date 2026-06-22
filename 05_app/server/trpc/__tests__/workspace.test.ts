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

import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { activityEvent, member, user, workspace } from "@/server/db/schema";
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
