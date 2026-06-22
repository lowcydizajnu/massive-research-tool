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

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { experiment, experimentVersion, member, studyPresence, user, workspace } from "@/server/db/schema";
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
  await db.delete(studyPresence);
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("presence (ADR-0060)", () => {
  it("heartbeat then list shows the other collaborator + their block, excluding self", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const mayaCaller = createCaller({ authUser: authUser("maya") });
    const { id: studyId } = await hanna.studies.create({ kind: "blank", title: "S" });

    await hanna.presence.heartbeat({ studyId, blockId: "blk_a" });
    await mayaCaller.presence.heartbeat({ studyId, blockId: "blk_b" });

    // Hanna sees Maya (on blk_b), not herself.
    const seenByHanna = await hanna.presence.list({ studyId });
    expect(seenByHanna).toHaveLength(1);
    expect(seenByHanna[0]).toMatchObject({ userId: maya.id, displayName: "maya", blockId: "blk_b" });

    // Maya sees Hanna (on blk_a).
    const seenByMaya = await mayaCaller.presence.list({ studyId });
    expect(seenByMaya.map((p) => p.userId)).toEqual([
      (await db.select().from(user).where(eq(user.externalId, "hanna")))[0].id,
    ]);
  });

  it("heartbeat upserts (one row per user) and updates the focused block", async () => {
    const { user: owner } = await seedOwner("hanna", "Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await hanna.studies.create({ kind: "blank", title: "S" });

    await hanna.presence.heartbeat({ studyId, blockId: "blk_a" });
    await hanna.presence.heartbeat({ studyId, blockId: "blk_c" });
    const rows = await db
      .select()
      .from(studyPresence)
      .where(and(eq(studyPresence.studyId, studyId), eq(studyPresence.userId, owner.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].blockId).toBe("blk_c");
  });

  it("stale presence drops off the list", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const maya = await addMember(ws.id, "maya");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await hanna.studies.create({ kind: "blank", title: "S" });

    await db.insert(studyPresence).values({
      studyId,
      userId: maya.id,
      blockId: "blk_x",
      updatedAt: new Date(Date.now() - 60_000), // 60s old → past the 15s staleness window
    });
    expect(await hanna.presence.list({ studyId })).toHaveLength(0);
  });

  it("leave clears my presence", async () => {
    const { user: owner } = await seedOwner("hanna", "Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const { id: studyId } = await hanna.studies.create({ kind: "blank", title: "S" });
    await hanna.presence.heartbeat({ studyId, blockId: null });
    await hanna.presence.leave({ studyId });
    expect(
      await db.select().from(studyPresence).where(eq(studyPresence.userId, owner.id)),
    ).toHaveLength(0);
  });

  it("is tenant-scoped: a study outside the workspace is NOT_FOUND", async () => {
    await seedOwner("hanna", "Lab");
    const other = await seedOwner("sofia", "Other");
    const sofia = createCaller({ authUser: authUser("sofia") });
    const { id: otherStudy } = await sofia.studies.create({ kind: "blank", title: "S" });
    const hanna = createCaller({ authUser: authUser("hanna") });
    await expect(hanna.presence.heartbeat({ studyId: otherStudy, blockId: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(other.workspace.id).toBeTruthy();
  });
});
