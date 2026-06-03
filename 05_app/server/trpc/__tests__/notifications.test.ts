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

// Run the fan-out INLINE when emit() enqueues it — so this exercises the whole
// live chain (trigger → emit → activity_event → fanout → notification rows),
// not just the enqueue call. email.digest is the no-op stub branch.
vi.mock("@/server/adapters/jobs", () => {
  const enqueue = vi.fn(async (topic: string, data: unknown) => {
    if (topic === "notification.fanout") {
      const { runNotificationFanout } = await import("@/server/jobs/notification-fanout");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await runNotificationFanout(data as any);
    }
  });
  return { jobs: { enqueue } };
});

import type { AuthUser } from "@/server/adapters/auth";
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

describe("notifications (Activity · Yours)", () => {
  it("a comment by a teammate notifies the study author, who reads it via the router", async () => {
    const { user: hanna, workspace: ws } = await seedOwner("hanna", "Lab");
    await addMember(ws.id, "maya");
    const hannaCaller = createCaller({ authUser: authUser("hanna") });
    const mayaCaller = createCaller({ authUser: authUser("maya") });
    const { id: studyId } = await hannaCaller.studies.create({ kind: "blank", title: "S" });

    // Maya comments on Hanna's study → comment_on_your_study fans out to Hanna.
    await mayaCaller.comments.create({
      experimentId: studyId,
      targetType: "study",
      targetId: studyId,
      bodyMd: "Looks great",
    });

    const yours = await hannaCaller.notifications.list();
    expect(yours).toHaveLength(1);
    expect(yours[0]).toMatchObject({ type: "comment_on_your_study", actorName: "maya", targetId: studyId });
    expect(yours[0].readAt).toBeNull();
    expect(await hannaCaller.notifications.unreadCount()).toBe(1);

    // The actor (Maya) is not a recipient of her own action.
    expect(await mayaCaller.notifications.list()).toHaveLength(0);
    expect(hanna.id).toBeTruthy();
  });

  it("markRead / markAllRead clear the unread count and are scoped to the caller", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    await addMember(ws.id, "maya");
    const hannaCaller = createCaller({ authUser: authUser("hanna") });
    const mayaCaller = createCaller({ authUser: authUser("maya") });
    const { id: studyId } = await hannaCaller.studies.create({ kind: "blank", title: "S" });
    await mayaCaller.comments.create({ experimentId: studyId, targetType: "study", targetId: studyId, bodyMd: "one" });
    await mayaCaller.comments.create({ experimentId: studyId, targetType: "study", targetId: studyId, bodyMd: "two" });

    const before = await hannaCaller.notifications.list();
    expect(before.length).toBeGreaterThanOrEqual(1);
    expect(await hannaCaller.notifications.unreadCount()).toBe(before.length);

    // Maya marking-all-read does nothing to Hanna's notifications (per-user scope).
    await mayaCaller.notifications.markAllRead();
    expect(await hannaCaller.notifications.unreadCount()).toBe(before.length);

    await hannaCaller.notifications.markRead({ id: before[0].id });
    expect(await hannaCaller.notifications.unreadCount()).toBe(before.length - 1);

    await hannaCaller.notifications.markAllRead();
    expect(await hannaCaller.notifications.unreadCount()).toBe(0);
  });

  it("saveAsNamed emits a Follows-only event — activity_event written, no notification", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const hannaCaller = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await hannaCaller.studies.create({ kind: "blank", title: "S" });

    await hannaCaller.studies.saveAsNamed({ studyId, name: "Pilot v1" });

    const events = await db.select().from(activityEvent).where(eq(activityEvent.type, "new_named_version"));
    expect(events).toHaveLength(1);
    expect(events[0].relatedStudyId).toBe(studyId);
    // Follows-only: no notification rows, so Yours stays empty.
    expect(await hannaCaller.notifications.list()).toHaveLength(0);
    expect(ws.id).toBeTruthy();
  });
});
