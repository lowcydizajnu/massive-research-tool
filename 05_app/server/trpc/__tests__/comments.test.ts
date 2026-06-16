import { eq } from "drizzle-orm";
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

// Mock the job adapter so emit()'s fan-out enqueue is observable (and no real
// Inngest send is attempted). activity_event rows are still written for real.
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import type { AuthUser } from "@/server/adapters/auth";
import { jobs } from "@/server/adapters/jobs";
import { db } from "@/server/db/client";
import {
  activityEvent,
  comment,
  experiment,
  experimentVersion,
  member,
  mention,
  notification,
  user,
  workspace,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const enqueue = vi.mocked(jobs.enqueue);

function authUser(externalId: string): AuthUser {
  return { id: externalId, email: `${externalId}@e.com`, displayName: externalId, avatarUrl: null, hasCompletedOnboarding: true };
}

async function seedOwner(ext: string, wsName: string) {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

async function addMember(workspaceId: string, ext: string) {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  await db.insert(member).values({ workspaceId, userId: u.id, role: "editor", status: "active" });
  return u;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(mention);
  await db.delete(comment);
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("comments.create", () => {
  it("posts a comment, inserts mention rows for members, and emits both events", async () => {
    const { user: owner, workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await caller.studies.create({ kind: "blank", title: "S" });

    const { id } = await caller.comments.create({
      experimentId: studyId,
      targetType: "study",
      targetId: studyId,
      bodyMd: "Hey @maya take a look",
      mentionedUserIds: [maya.id],
    });

    const [c] = await db.select().from(comment).where(eq(comment.id, id));
    expect(c.authorUserId).toBe(owner.id);
    expect(c.bodyMd).toContain("@maya");
    const mentions = await db.select().from(mention).where(eq(mention.commentId, id));
    expect(mentions.map((m) => m.mentionedUserId)).toEqual([maya.id]);

    // Two activity_events written (comment_on_your_study + mention); both fanned out.
    const events = await db.select().from(activityEvent);
    expect(events.map((e) => e.type).sort()).toEqual(["comment_on_your_study", "mention"]);
    expect(enqueue).toHaveBeenCalledWith("notification.fanout", expect.any(Object));
    expect(enqueue.mock.calls.filter((c) => c[0] === "notification.fanout")).toHaveLength(2);
  });

  it("ignores @mentions of non-members", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const outsiderWs = await seedOwner("sofia", "Other");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await caller.studies.create({ kind: "blank", title: "S" });

    const { id } = await caller.comments.create({
      experimentId: studyId,
      targetType: "study",
      targetId: studyId,
      bodyMd: "@sofia hi",
      mentionedUserIds: [outsiderWs.user.id], // not a member of Lab
    });
    const mentions = await db.select().from(mention).where(eq(mention.commentId, id));
    expect(mentions).toHaveLength(0);
    // Only the comment_on_your_study event (no mention event with zero valid mentions).
    const events = await db.select().from(activityEvent);
    expect(events.map((e) => e.type)).toEqual(["comment_on_your_study"]);
    expect(ws.id).toBeTruthy();
  });

  it("lets a viewer comment (collaboration is open to all members, not just writers)", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const [viewerU] = await db
      .insert(user)
      .values({ externalId: "val", email: "val@e.com", displayName: "val" })
      .returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: viewerU.id, role: "viewer", status: "active" });
    const owner = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await owner.studies.create({ kind: "blank", title: "S" });

    const viewer = createCaller({ authUser: authUser("val") });
    const { id } = await viewer.comments.create({
      experimentId: studyId,
      targetType: "study",
      targetId: studyId,
      bodyMd: "A viewer's note",
      mentionedUserIds: [],
    });
    const [c] = await db.select().from(comment).where(eq(comment.id, id));
    expect(c.authorUserId).toBe(viewerU.id);
  });
});

describe("comments.list / resolve / update / delete", () => {
  async function setup() {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await caller.studies.create({ kind: "blank", title: "S" });
    return { ws, caller, studyId };
  }

  it("lists comments oldest-first with author + mentions", async () => {
    const { caller, studyId } = await setup();
    await caller.comments.create({ experimentId: studyId, targetType: "study", targetId: studyId, bodyMd: "first" });
    await caller.comments.create({ experimentId: studyId, targetType: "block_instance", targetId: "blk_1", bodyMd: "on a block" });

    const all = await caller.comments.list({ experimentId: studyId });
    expect(all.map((c) => c.bodyMd)).toEqual(["first", "on a block"]);
    expect(all[0].authorName).toBe("hanna");

    const onBlock = await caller.comments.list({ experimentId: studyId, targetType: "block_instance", targetId: "blk_1" });
    expect(onBlock).toHaveLength(1);
  });

  it("resolve marks resolved + emits comment_resolved", async () => {
    const { caller, studyId } = await setup();
    const { id } = await caller.comments.create({ experimentId: studyId, targetType: "study", targetId: studyId, bodyMd: "q" });
    await caller.comments.resolve({ commentId: id, resolved: true });
    const [c] = await db.select().from(comment).where(eq(comment.id, id));
    expect(c.status).toBe("resolved");
    expect(c.resolvedAt).not.toBeNull();
    const events = await db.select().from(activityEvent).where(eq(activityEvent.type, "comment_resolved"));
    expect(events).toHaveLength(1);
  });

  it("update + delete are author-only", async () => {
    const { ws, caller, studyId } = await setup();
    const { id } = await caller.comments.create({ experimentId: studyId, targetType: "study", targetId: studyId, bodyMd: "mine" });

    await caller.comments.update({ commentId: id, bodyMd: "edited" });
    const [c] = await db.select().from(comment).where(eq(comment.id, id));
    expect(c.bodyMd).toBe("edited");
    expect(c.editedAt).not.toBeNull();

    // A different member can't edit/delete someone else's comment.
    const maya = await addMember(ws.id, "maya");
    expect(maya.id).toBeTruthy();
    const mayaCaller = createCaller({ authUser: authUser("maya") });
    await expect(mayaCaller.comments.update({ commentId: id, bodyMd: "hijack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(mayaCaller.comments.delete({ commentId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await caller.comments.delete({ commentId: id });
    expect(await db.select().from(comment).where(eq(comment.id, id))).toHaveLength(0);
  });

  it("is tenant-scoped: a study outside the workspace is NOT_FOUND", async () => {
    const { caller } = await setup();
    await expect(
      caller.comments.list({ experimentId: "11111111-1111-1111-1111-111111111111" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
