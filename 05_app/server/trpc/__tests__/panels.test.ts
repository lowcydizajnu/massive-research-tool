/**
 * panelsRouter (V1.15 P3 / ADR-0051) over a real migrated PGlite DB. Panels are
 * workspace-scoped cohorts keyed by opaque external_pid; members are bulk-added
 * from a study's provider_submission rows by status. Idempotent + tenant-scoped.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  member,
  panel,
  panelMember,
  providerSubmission,
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

async function seedWs(ext: string, slug: string, role: "owner" | "viewer" = "owner") {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: slug, slug, ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role, status: "active" });
  return { u, ws };
}

/** A study in `ws` with provider submissions of the given (pid,status) pairs. */
async function seedStudyWithSubmissions(ws: { id: string }, owner: { id: string }, subs: [string, string][]) {
  const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: owner.id, title: "Study" }).returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({ experimentId: exp.id, versionNumber: 1, kind: "preregistered", name: "v1", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: owner.id })
    .returning();
  const sessionId = ulid();
  await db.insert(recruitmentSession).values({ id: sessionId, experimentVersionId: ver.id, status: "open", metadata: {} });
  for (const [pid, status] of subs) {
    await db.insert(providerSubmission).values({
      id: ulid(),
      workspaceId: ws.id,
      experimentId: exp.id,
      recruitmentSessionId: sessionId,
      provider: "prolific",
      providerStudyId: "P1",
      submissionId: ulid(),
      externalPid: pid,
      status,
    });
  }
  return { experimentId: exp.id as string };
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(panelMember);
  await db.delete(panel);
  await db.delete(providerSubmission);
  await db.delete(recruitmentSession);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("panels.create + list", () => {
  it("creates a workspace-scoped panel and lists it with a zero member count", async () => {
    await seedWs("u", "lab");
    const caller = createCaller({ authUser: authUser("u") });
    const { id } = await caller.panels.create({ name: "Wave 1", description: "completers" });
    const list = await caller.panels.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "Wave 1", description: "completers", memberCount: 0 });
  });

  it("blocks a viewer from creating (writeProcedure)", async () => {
    await seedWs("u", "lab", "viewer");
    const caller = createCaller({ authUser: authUser("u") });
    await expect(caller.panels.create({ name: "X" })).rejects.toThrow();
  });
});

describe("panels.addMembersFromStudy", () => {
  it("adds 'completed' submissions (approved + submitted), idempotently, and reflects in counts", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const { experimentId } = await seedStudyWithSubmissions(ws, u, [
      ["pid-a", "approved"],
      ["pid-b", "submitted"],
      ["pid-c", "started"], // excluded by "completed"
      ["pid-d", "rejected"], // excluded
    ]);
    const caller = createCaller({ authUser: authUser("u") });
    const { id } = await caller.panels.create({ name: "Completers" });

    const r1 = await caller.panels.addMembersFromStudy({ panelId: id, studyId: experimentId, statuses: "completed" });
    expect(r1).toEqual({ added: 2, alreadyPresent: 0 });

    // Idempotent: re-adding the same study adds nothing new.
    const r2 = await caller.panels.addMembersFromStudy({ panelId: id, studyId: experimentId, statuses: "completed" });
    expect(r2).toEqual({ added: 0, alreadyPresent: 2 });

    const detail = await caller.panels.get({ panelId: id });
    expect(detail.members.map((m) => m.externalPid).sort()).toEqual(["pid-a", "pid-b"]);
    expect(detail.members[0].sourceStudyTitle).toBe("Study");
    expect((await caller.panels.list())[0].memberCount).toBe(2);
  });

  it("'all' includes every status; 'approved' only the approved", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const { experimentId } = await seedStudyWithSubmissions(ws, u, [
      ["pid-a", "approved"],
      ["pid-b", "submitted"],
      ["pid-c", "timed-out"],
    ]);
    const caller = createCaller({ authUser: authUser("u") });
    const approved = await caller.panels.create({ name: "Approved" });
    expect((await caller.panels.addMembersFromStudy({ panelId: approved.id, studyId: experimentId, statuses: "approved" })).added).toBe(1);
    const all = await caller.panels.create({ name: "All" });
    expect((await caller.panels.addMembersFromStudy({ panelId: all.id, studyId: experimentId, statuses: "all" })).added).toBe(3);
  });
});

describe("panels.removeMember + delete + tenancy", () => {
  it("removes a member and deletes a panel (members cascade)", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const { experimentId } = await seedStudyWithSubmissions(ws, u, [["pid-a", "approved"], ["pid-b", "approved"]]);
    const caller = createCaller({ authUser: authUser("u") });
    const { id } = await caller.panels.create({ name: "P" });
    await caller.panels.addMembersFromStudy({ panelId: id, studyId: experimentId, statuses: "approved" });

    await caller.panels.removeMember({ panelId: id, externalPid: "pid-a" });
    expect((await caller.panels.get({ panelId: id })).members.map((m) => m.externalPid)).toEqual(["pid-b"]);

    await caller.panels.delete({ panelId: id });
    expect(await caller.panels.list()).toHaveLength(0);
    expect(await db.select().from(panelMember)).toHaveLength(0); // cascaded
  });

  it("a panel in another workspace is NOT_FOUND for this caller", async () => {
    const a = await seedWs("a", "lab-a");
    await seedWs("b", "lab-b");
    const callerA = createCaller({ authUser: authUser("a") });
    const callerB = createCaller({ authUser: authUser("b") });
    const { id } = await callerA.panels.create({ name: "A's panel" });
    void a;
    await expect(callerB.panels.get({ panelId: id })).rejects.toThrow(/not found/i);
    await expect(callerB.panels.delete({ panelId: id })).rejects.toThrow(/not found/i);
  });
});

describe("panels.eligibleStudies", () => {
  it("lists only studies with provider submissions, with counts", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const { experimentId } = await seedStudyWithSubmissions(ws, u, [["p1", "approved"], ["p2", "submitted"]]);
    const caller = createCaller({ authUser: authUser("u") });
    const studies = await caller.panels.eligibleStudies();
    expect(studies).toHaveLength(1);
    expect(studies[0]).toMatchObject({ studyId: experimentId, title: "Study", submissionCount: 2 });
  });
});
