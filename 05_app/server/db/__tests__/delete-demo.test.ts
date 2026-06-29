import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// Same pglite + migrate mock as seed-misinfo-starter.test.ts: an in-memory
// Postgres with the real migrations applied, swapped in for the app DB client.
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

import { db } from "@/server/db/client";
import { deleteDemoContent } from "@/server/db/delete-demo";
import {
  condition,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";
import { seedDemoWorkspace } from "../../../scripts/seed-demo-workspace";

const OWNER_EMAIL = "owner@example.com";
const DEMO_EXTERNAL_IDS = ["demo-sofia", "demo-maya"];

/** Stand up the owner user + their workspace (the seeder requires both to exist). */
async function seedOwnerAndWorkspace() {
  const [owner] = await db
    .insert(user)
    .values({ externalId: "owner-clerk-id", email: OWNER_EMAIL, displayName: "Owner" })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: "Owner Workspace", slug: "owner-ws", ownerId: owner.id })
    .returning();
  return { owner, ws };
}

/**
 * Create a NON-demo study (is_demo=false) with a full response chain + a real
 * (non-demo) teammate in the same workspace, to prove the delete is targeted and
 * leaves real data untouched.
 */
async function seedRealContent(ownerId: string, workspaceId: string) {
  // A real teammate (NOT a demo external_id).
  const [realUser] = await db
    .insert(user)
    .values({ externalId: "real-teammate", email: "real@example.com", displayName: "Real Teammate" })
    .returning();
  const [realMember] = await db
    .insert(member)
    .values({ workspaceId, userId: realUser.id, role: "editor", status: "active", isDemo: false })
    .returning();

  const experimentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(experiment).values({
    id: experimentId,
    tenantId: workspaceId,
    ownerId,
    title: "Real study (must survive)",
    isDemo: false,
  });
  await db.insert(experimentVersion).values({
    id: versionId,
    experimentId,
    createdBy: ownerId,
    versionNumber: 1,
    kind: "published",
    name: "v1",
    definitionSnapshot: { blocks: [] },
    moduleVersionLocks: [],
  });
  await db.update(experiment).set({ currentVersionId: versionId }).where(eq(experiment.id, experimentId));

  const recId = "REAL_REC_SESSION";
  const condId = "REAL_CONDITION";
  const respId = "REAL_RESPONSE";
  await db.insert(recruitmentSession).values({ id: recId, experimentVersionId: versionId, status: "open" });
  await db.insert(condition).values({ id: condId, experimentVersionId: versionId, slug: "control", name: "Control", position: 0 });
  await db.insert(response).values({
    id: respId,
    recruitmentSessionId: recId,
    experimentVersionId: versionId,
    conditionId: condId,
    mode: "run",
    status: "completed",
    completedAt: new Date(),
  });
  await db.insert(responseItem).values({
    id: "REAL_RESPONSE_ITEM",
    responseId: respId,
    blockInstanceId: "real-block",
    blockPosition: 0,
    moduleSource: "core",
    moduleKey: "likert-7",
    moduleVersion: "1.0.0",
    answer: { value: 5 },
  });

  return { realUser, realMember, experimentId, versionId, respId };
}

describe("deleteDemoContent", () => {
  it("hard-deletes only demo content, leaves real content intact, is idempotent", async () => {
    const { owner, ws } = await seedOwnerAndWorkspace();
    const real = await seedRealContent(owner.id, ws.id);

    // Seed the real curated demo content via the production seeder.
    await seedDemoWorkspace(OWNER_EMAIL);

    // --- preconditions: demo content exists ---
    const demoStudiesBefore = await db
      .select({ id: experiment.id })
      .from(experiment)
      .where(and(eq(experiment.tenantId, ws.id), eq(experiment.isDemo, true)));
    expect(demoStudiesBefore.length).toBeGreaterThan(0);

    const demoUsersBefore = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.externalId, DEMO_EXTERNAL_IDS));
    expect(demoUsersBefore).toHaveLength(2);

    const demoMembersBefore = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.isDemo, true));
    expect(demoMembersBefore.length).toBeGreaterThan(0);

    // --- act ---
    const counts = await deleteDemoContent(OWNER_EMAIL);

    // --- demo content is gone ---
    const demoStudiesAfter = await db
      .select({ id: experiment.id })
      .from(experiment)
      .where(eq(experiment.isDemo, true));
    expect(demoStudiesAfter).toHaveLength(0);

    const demoUsersAfter = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.externalId, DEMO_EXTERNAL_IDS));
    expect(demoUsersAfter).toHaveLength(0);

    const demoMembersAfter = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.isDemo, true));
    expect(demoMembersAfter).toHaveLength(0);

    // No orphaned demo versions / responses remain (the chain is fully cleared).
    const allExperiments = await db.select({ id: experiment.id }).from(experiment);
    // Only the real study survives (the system-starter seeder is not run here).
    expect(allExperiments.map((e) => e.id)).toEqual([real.experimentId]);

    // --- real content survives untouched ---
    const [realExp] = await db.select().from(experiment).where(eq(experiment.id, real.experimentId));
    expect(realExp).toBeDefined();
    expect(realExp.isDemo).toBe(false);

    const [realResp] = await db.select().from(response).where(eq(response.id, real.respId));
    expect(realResp).toBeDefined();

    const [realItem] = await db
      .select()
      .from(responseItem)
      .where(eq(responseItem.responseId, real.respId));
    expect(realItem).toBeDefined();

    const [realMemberAfter] = await db.select().from(member).where(eq(member.id, real.realMember.id));
    expect(realMemberAfter).toBeDefined();
    expect(realMemberAfter.isDemo).toBe(false);

    const [realUserAfter] = await db.select().from(user).where(eq(user.id, real.realUser.id));
    expect(realUserAfter).toBeDefined();

    // The owner themselves is never deleted.
    const [ownerAfter] = await db.select().from(user).where(eq(user.id, owner.id));
    expect(ownerAfter).toBeDefined();

    // --- counts are sane ---
    expect(counts.workspaces).toBe(1);
    expect(counts.studies).toBe(demoStudiesBefore.length);
    expect(counts.members).toBe(demoMembersBefore.length);
    expect(counts.users).toBe(2);

    // --- idempotent: a second run is a no-op (all zeros) ---
    const second = await deleteDemoContent(OWNER_EMAIL);
    expect(second).toEqual({ workspaces: 1, studies: 0, members: 0, users: 0 });

    // Real content still there after the second run.
    expect(await db.select().from(experiment).where(eq(experiment.id, real.experimentId))).toHaveLength(1);
  });

  it("returns all-zero for an unknown owner email", async () => {
    const counts = await deleteDemoContent("nobody@example.com");
    expect(counts).toEqual({ workspaces: 0, studies: 0, members: 0, users: 0 });
  });
});
