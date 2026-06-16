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

// The team router calls auth.createInvitation (Clerk) — mock the adapter so tests
// exercise the DB-side dedupe/summary without a live provider.
vi.mock("@/server/adapters/auth", () => ({
  auth: {
    createInvitation: vi.fn().mockResolvedValue({ id: "inv_test" }),
    revokePendingInvitationByEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ulid } from "ulid";

import { auth } from "@/server/adapters/auth";

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

describe("team.invite", () => {
  it("sends new invites, dedupes against members + pending + within the batch, flags invalid", async () => {
    const owner = await seedUser("ext_owner");
    const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: owner.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: owner.id, role: "owner", status: "active" });
    // an already-pending invite
    await db.insert(member).values({
      workspaceId: ws.id,
      role: "viewer",
      status: "invited",
      invitedEmail: "pending@lab.edu",
      invitedBy: owner.id,
    });
    const caller = createCaller({ authUser: authUser("ext_owner") });

    const r = await caller.team.invite({
      emails: ["NEW1@lab.edu", "new2@lab.edu", "new1@lab.edu", "pending@lab.edu", "ext_owner@example.com", "nope"],
      role: "editor",
    });
    expect(r).toEqual({ sent: 2, alreadyMember: 1, alreadyInvited: 1, invalid: 1, failed: 0 });
    expect(vi.mocked(auth.createInvitation)).toHaveBeenCalledTimes(2);

    const invites = await caller.team.listInvitations();
    expect(invites.map((i) => i.email).sort()).toEqual(["new1@lab.edu", "new2@lab.edu", "pending@lab.edu"]);

    // re-inviting an existing one no-ops
    const again = await caller.team.invite({ emails: ["new1@lab.edu"], role: "editor" });
    expect(again).toEqual({ sent: 0, alreadyMember: 0, alreadyInvited: 1, invalid: 0, failed: 0 });
  });

  it("gates by role: viewers/editors can't invite; admins can't invite above Editor", async () => {
    const owner = await seedUser("ext_owner");
    const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: owner.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: owner.id, role: "owner", status: "active" });
    const adminU = await seedUser("ext_admin");
    await db.insert(member).values({ workspaceId: ws.id, userId: adminU.id, role: "admin", status: "active" });
    const viewerU = await seedUser("ext_viewer");
    await db.insert(member).values({ workspaceId: ws.id, userId: viewerU.id, role: "viewer", status: "active" });

    const viewer = createCaller({ authUser: authUser("ext_viewer") });
    await expect(viewer.team.invite({ emails: ["x@lab.edu"], role: "viewer" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const admin = createCaller({ authUser: authUser("ext_admin") });
    await expect(admin.team.invite({ emails: ["x@lab.edu"], role: "admin" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // admin inviting an Editor is allowed
    await expect(admin.team.invite({ emails: ["x@lab.edu"], role: "editor" })).resolves.toMatchObject({ sent: 1 });
  });
});

describe("team.revokeInvite / resendInvite", () => {
  async function seedWsWithInvite() {
    const owner = await seedUser("ext_owner");
    const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: owner.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: owner.id, role: "owner", status: "active" });
    const [inv] = await db
      .insert(member)
      .values({ workspaceId: ws.id, role: "editor", status: "invited", invitedEmail: "p@lab.edu", invitedBy: owner.id })
      .returning();
    return { ws, inviteId: inv.id };
  }

  it("revokeInvite deletes the pending row + revokes the Clerk invitation", async () => {
    const { inviteId } = await seedWsWithInvite();
    const caller = createCaller({ authUser: authUser("ext_owner") });
    await expect(caller.team.revokeInvite({ memberId: inviteId })).resolves.toEqual({ ok: true });
    expect(vi.mocked(auth.revokePendingInvitationByEmail)).toHaveBeenCalledWith("p@lab.edu");
    expect(await caller.team.listInvitations()).toHaveLength(0);
  });

  it("resendInvite revokes then re-sends + resets age; keeps the row", async () => {
    const { inviteId } = await seedWsWithInvite();
    const caller = createCaller({ authUser: authUser("ext_owner") });
    await expect(caller.team.resendInvite({ memberId: inviteId })).resolves.toEqual({ ok: true });
    expect(vi.mocked(auth.revokePendingInvitationByEmail)).toHaveBeenCalledWith("p@lab.edu");
    expect(vi.mocked(auth.createInvitation)).toHaveBeenCalled();
    const invites = await caller.team.listInvitations();
    expect(invites).toHaveLength(1);
    expect(invites[0].ageDays).toBe(0);
  });

  it("a viewer can't revoke", async () => {
    const { ws, inviteId } = await seedWsWithInvite();
    const v = await seedUser("ext_viewer");
    await db.insert(member).values({ workspaceId: ws.id, userId: v.id, role: "viewer", status: "active" });
    const viewer = createCaller({ authUser: authUser("ext_viewer") });
    await expect(viewer.team.revokeInvite({ memberId: inviteId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
