/**
 * teamRouter tests (V1.14 T1.1 / ADR-0046) — members list (soft-delete filter +
 * computed last-active) + pending invitations, over a real migrated PGlite DB.
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

function authUser(externalId: string): AuthUser {
  return {
    id: externalId,
    email: `${externalId}@example.com`,
    displayName: externalId,
    avatarUrl: null,
    hasCompletedOnboarding: true,
  };
}

async function seedUser(externalId: string) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  return u;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(activityEvent);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("team.list / listInvitations", () => {
  it("lists active members (excludes soft-removed by default; includeRemoved surfaces them) with last-active", async () => {
    const owner = await seedUser("ext_owner");
    const [ws] = await db
      .insert(workspace)
      .values({ name: "Lab", slug: "lab", ownerId: owner.id })
      .returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: owner.id, role: "owner", status: "active" });

    const editor = await seedUser("ext_editor");
    await db.insert(member).values({ workspaceId: ws.id, userId: editor.id, role: "editor", status: "active" });
    // an activity event for the editor in this workspace → lastActiveAt set
    await db.insert(activityEvent).values({
      id: ulid(),
      type: "fork",
      workspaceId: ws.id,
      actorUserId: editor.id,
      targetType: "study",
      targetId: "s1",
    });

    const removed = await seedUser("ext_removed");
    await db.insert(member).values({
      workspaceId: ws.id,
      userId: removed.id,
      role: "viewer",
      status: "active",
      removedAt: new Date(),
      removedByUserId: owner.id,
    });

    const caller = createCaller({ authUser: authUser("ext_owner") });

    const active = await caller.team.list();
    expect(active).toHaveLength(2); // owner + editor; the soft-removed viewer is excluded
    expect(active.map((m) => m.role).sort()).toEqual(["editor", "owner"]);
    const ed = active.find((m) => m.role === "editor")!;
    expect(ed.email).toBe("ext_editor@example.com");
    expect(ed.lastActiveAt).not.toBeNull();
    const ow = active.find((m) => m.role === "owner")!;
    expect(ow.lastActiveAt).toBeNull(); // no activity events

    const all = await caller.team.list({ includeRemoved: true });
    expect(all).toHaveLength(3);
    expect(all.find((m) => m.userId === removed.id)?.removedAt).not.toBeNull();
  });

  it("listInvitations returns pending invites with age + inviter, excludes active members", async () => {
    const owner = await seedUser("ext_owner");
    const [ws] = await db
      .insert(workspace)
      .values({ name: "Lab", slug: "lab", ownerId: owner.id })
      .returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: owner.id, role: "owner", status: "active" });

    await db.insert(member).values({
      workspaceId: ws.id,
      userId: null,
      role: "editor",
      status: "invited",
      invitedEmail: "newpostdoc@lab.edu",
      invitedBy: owner.id,
    });

    const caller = createCaller({ authUser: authUser("ext_owner") });
    const invites = await caller.team.listInvitations();
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({
      email: "newpostdoc@lab.edu",
      role: "editor",
      invitedByName: "ext_owner",
    });
    expect(invites[0].ageDays).toBeGreaterThanOrEqual(0);

    // the invited row is not an active member (only the owner is)
    expect(await caller.team.list()).toHaveLength(1);
  });
});
