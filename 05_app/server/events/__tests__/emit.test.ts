import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic PGlite db (no DB mocks, per the QA determinism rule).
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

// The job adapter is mocked so emit()/fanout's enqueue is observable (and so a
// real Inngest send isn't attempted in tests).
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import { jobs } from "@/server/adapters/jobs";
import { db } from "@/server/db/client";
import { activityEvent, comment, experiment, member, notification, user, workspace } from "@/server/db/schema";
import { emit } from "@/server/events/emit";
import { resolveRecipients } from "@/server/events/recipients";
import { runNotificationFanout } from "@/server/jobs/notification-fanout";

const enqueue = vi.mocked(jobs.enqueue);

async function seedUser(ext: string): Promise<string> {
  const [u] = await db
    .insert(user)
    .values({ externalId: ext, email: `${ext}@e.com`, displayName: ext })
    .returning();
  return u.id;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(comment);
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("emit()", () => {
  it("writes an activity_event and enqueues notification.fanout", async () => {
    const actor = await seedUser("actor");
    const { sourceEventId } = await emit({
      type: "fork",
      actorUserId: actor,
      targetType: "study",
      targetId: "study-1",
      related: { studyId: "study-1", authorUserId: actor, tagSlugs: ["misinformation"] },
    });

    const [ev] = await db.select().from(activityEvent).where(eq(activityEvent.id, sourceEventId));
    expect(ev.type).toBe("fork");
    expect(ev.relatedTagSlugs).toEqual(["misinformation"]);
    expect(enqueue).toHaveBeenCalledWith("notification.fanout", {
      sourceEventId,
      input: expect.objectContaining({ type: "fork" }),
    });
  });
});

describe("resolveRecipients()", () => {
  it("mention → the mentioned users, excluding the actor", async () => {
    const [actor, m1, m2] = [await seedUser("a"), await seedUser("m1"), await seedUser("m2")];
    const r = await resolveRecipients({
      type: "mention",
      actorUserId: actor,
      targetType: "comment",
      targetId: "c1",
      data: { mentionedUserIds: [m1, m2, actor] },
    });
    expect(r.sort()).toEqual([m1, m2].sort());
  });

  it("comment_on_your_study → study author + earlier commenters, minus actor", async () => {
    const author = await seedUser("author");
    const earlier = await seedUser("earlier");
    const actor = await seedUser("commenter");
    const [ws] = await db.insert(workspace).values({ name: "W", slug: "w", ownerId: author }).returning();
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: author, title: "S" }).returning();
    // An earlier comment on the same target by `earlier`.
    await db.insert(comment).values({
      id: ulid(), workspaceId: ws.id, targetType: "study", targetId: exp.id,
      experimentId: exp.id, authorUserId: earlier, bodyMd: "hi",
    });

    const r = await resolveRecipients({
      type: "comment_on_your_study",
      actorUserId: actor,
      targetType: "study",
      targetId: exp.id,
      related: { studyId: exp.id },
    });
    expect(r.sort()).toEqual([author, earlier].sort());
  });

  it("preregister_complete → no notification recipients (Follows-only)", async () => {
    expect(
      await resolveRecipients({ type: "preregister_complete", targetType: "study", targetId: "s" }),
    ).toEqual([]);
  });
});

describe("runNotificationFanout()", () => {
  it("inserts one notification per recipient and is idempotent on re-run", async () => {
    const actor = await seedUser("actor");
    const m1 = await seedUser("m1");
    const sourceEventId = ulid();
    const data = {
      sourceEventId,
      input: {
        type: "mention" as const,
        actorUserId: actor,
        targetType: "comment",
        targetId: "c1",
        data: { mentionedUserIds: [m1] },
      },
    };

    await runNotificationFanout(data);
    await runNotificationFanout(data); // re-fire (Inngest retry) → no duplicate

    const rows = await db.select().from(notification).where(eq(notification.recipientUserId, m1));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "mention", sourceEventId, actorUserId: actor });
    // The digest stub was enqueued with the recipients.
    expect(enqueue).toHaveBeenCalledWith("email.digest", { sourceEventId, recipientUserIds: [m1] });
  });

  it("inserts nothing for a Follows-only event", async () => {
    await runNotificationFanout({
      sourceEventId: ulid(),
      input: { type: "preregister_complete", targetType: "study", targetId: "s" },
    });
    expect(await db.select().from(notification)).toHaveLength(0);
  });
});
