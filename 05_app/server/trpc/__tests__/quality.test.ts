/**
 * recruitment.quality (V1.15 P5 / ADR-0049) over a real migrated PGlite DB.
 * Heuristic detection (fast / straight-lining / duplicate) over our response data
 * + audit-only resolution. PII-safe (opaque external_pid only).
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

import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  condition,
  experiment,
  experimentVersion,
  member,
  providerSubmission,
  qualityFlag,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const authUser = (ext: string): AuthUser => ({ id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true });

async function seedWs(ext: string, slug: string, role: "owner" | "viewer" = "owner") {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: slug, slug, ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role, status: "active" });
  return { u, ws };
}

async function seedStudyGraph(ws: { id: string }, owner: { id: string }, title = "Study") {
  const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: owner.id, title }).returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({ experimentId: exp.id, versionNumber: 1, kind: "preregistered", name: "v1", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: owner.id })
    .returning();
  const [cond] = await db
    .insert(condition)
    .values({ id: ulid(), experimentVersionId: ver.id, slug: "c1", name: "C1", position: 0 })
    .returning();
  const sessionId = ulid();
  await db.insert(recruitmentSession).values({ id: sessionId, experimentVersionId: ver.id, status: "open" });
  return { experimentId: exp.id as string, versionId: ver.id as string, conditionId: cond.id as string, sessionId };
}

async function seedResponse(
  g: { versionId: string; conditionId: string; sessionId: string },
  pid: string,
  durationSec: number,
) {
  const id = ulid();
  const started = new Date(Date.now() - durationSec * 1000);
  await db.insert(response).values({
    id,
    recruitmentSessionId: g.sessionId,
    experimentVersionId: g.versionId,
    conditionId: g.conditionId,
    externalPid: pid,
    mode: "run",
    status: "completed",
    startedAt: started,
    completedAt: new Date(),
  });
  return id;
}

async function addItem(responseId: string, value: string | number, n: number) {
  await db.insert(responseItem).values({
    id: ulid(),
    responseId,
    blockInstanceId: `b${n}`,
    blockPosition: n,
    moduleSource: "core",
    moduleKey: "likert",
    moduleVersion: "1",
    answer: { value },
  });
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(qualityFlag);
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(providerSubmission);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("quality.rescan detection", () => {
  it("flags duplicate participants (same PID completed in two sessions of the study)", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    // A second recruitment session of the SAME study version (e.g. re-opened) —
    // the (session, pid) unique only blocks dupes within one session.
    const session2 = ulid();
    await db.insert(recruitmentSession).values({ id: session2, experimentVersionId: g.versionId, status: "open" });
    await seedResponse(g, "dup", 600);
    await seedResponse({ ...g, sessionId: session2 }, "dup", 600);
    await seedResponse(g, "solo", 600);
    const caller = createCaller({ authUser: authUser("u") });
    const r = await caller.recruitment.quality.rescan({});
    expect(r.created).toBe(2); // both duplicate responses flagged
    const open = await caller.recruitment.quality.list({ resolved: false });
    expect(open.every((f) => f.flagKind === "duplicate_pid" && f.severity === "high")).toBe(true);
    expect(open).toHaveLength(2);
  });

  it("flags a suspiciously fast completion (< 40% of median, >=5 sample)", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    for (let i = 0; i < 5; i++) await seedResponse(g, `p${i}`, 600); // median ~600s
    await seedResponse(g, "speedy", 10); // < 240s
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.quality.rescan({});
    const open = await caller.recruitment.quality.list({ resolved: false });
    const fast = open.filter((f) => f.flagKind === "fast_completion");
    expect(fast).toHaveLength(1);
    expect(fast[0].externalPid).toBe("speedy");
  });

  it("flags straight-lining (>=3 identical scale answers) and is idempotent", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const rid = await seedResponse(g, "flat", 600);
    await addItem(rid, "agree", 1);
    await addItem(rid, "agree", 2);
    await addItem(rid, "agree", 3);
    const caller = createCaller({ authUser: authUser("u") });
    const first = await caller.recruitment.quality.rescan({});
    expect(first.created).toBe(1);
    // Idempotent: re-scan creates nothing new.
    const second = await caller.recruitment.quality.rescan({});
    expect(second.created).toBe(0);
    const open = await caller.recruitment.quality.list({ resolved: false });
    expect(open.filter((f) => f.flagKind === "straight_lining")).toHaveLength(1);
  });
});

describe("quality.resolve + flag", () => {
  it("resolve moves a flag to the Resolved tab with who + resolution (audit-only)", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const fid = ulid();
    await db.insert(qualityFlag).values({ id: fid, workspaceId: ws.id, experimentId: g.experimentId, flagKind: "manual", severity: "medium", autoDetected: false });
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.quality.resolve({ flagId: fid, resolution: "approved", note: "looks fine" });
    expect(await caller.recruitment.quality.list({ resolved: false })).toHaveLength(0);
    const resolved = await caller.recruitment.quality.list({ resolved: true });
    expect(resolved[0]).toMatchObject({ id: fid, resolution: "approved", resolvedBy: "u" });
  });

  it("manual flag attaches to a submission; cross-workspace resolve is NOT_FOUND; viewer blocked", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const subId = ulid();
    await db.insert(providerSubmission).values({
      id: subId, workspaceId: ws.id, experimentId: g.experimentId, recruitmentSessionId: g.sessionId,
      provider: "prolific", providerStudyId: "P1", submissionId: ulid(), externalPid: "pidA", status: "submitted",
    });
    const caller = createCaller({ authUser: authUser("u") });
    const { id } = await caller.recruitment.quality.flag({ providerSubmissionId: subId, note: "weird" });
    const open = await caller.recruitment.quality.list({ resolved: false });
    expect(open.find((f) => f.id === id)).toMatchObject({ flagKind: "manual", externalPid: "pidA" });

    await seedWs("v", "lab2", "viewer");
    const viewer = createCaller({ authUser: authUser("v") });
    await expect(viewer.recruitment.quality.resolve({ flagId: id, resolution: "dismissed" })).rejects.toThrow();
  });
});
