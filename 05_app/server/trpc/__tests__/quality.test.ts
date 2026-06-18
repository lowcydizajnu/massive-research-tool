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

// Provider money operations (ADR-0052): mock the adapter so approve/reject/bonus
// never hit Prolific. Real classes (errors) stay; only the three calls are spied.
const adapterSpies = vi.hoisted(() => ({
  approveSubmission: vi.fn(async () => {}),
  rejectSubmission: vi.fn(async () => {}),
  sendBonus: vi.fn(async () => {}),
}));
vi.mock("@/server/adapters/recruitment", async () => {
  const actual = await vi.importActual<typeof import("@/server/adapters/recruitment")>("@/server/adapters/recruitment");
  return { ...actual, getRecruitmentAdapter: () => adapterSpies };
});

import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  condition,
  experiment,
  experimentVersion,
  member,
  payoutRecord,
  providerSubmission,
  qualityFlag,
  recruitmentProviderConnection,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";
import { detectFlagsAllWorkspaces } from "@/server/recruitment/quality";
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

async function seedStudyGraph(ws: { id: string }, owner: { id: string }, title = "Study", blocks: unknown[] = []) {
  const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: owner.id, title }).returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({ experimentId: exp.id, versionNumber: 1, kind: "preregistered", name: "v1", definitionSnapshot: { blocks }, moduleVersionLocks: {}, createdBy: owner.id })
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

async function seedSubmission(
  ws: { id: string },
  g: { experimentId: string; sessionId: string },
  pid: string,
  opts: { rewardCents?: number; currency?: string } = {},
) {
  const id = ulid();
  await db.insert(providerSubmission).values({
    id, workspaceId: ws.id, experimentId: g.experimentId, recruitmentSessionId: g.sessionId,
    provider: "prolific", providerStudyId: "P1", submissionId: `sub_${pid}`, externalPid: pid, status: "submitted",
    rewardAmountCents: opts.rewardCents ?? 150, currency: opts.currency ?? "GBP",
  });
  return id;
}

async function seedConnection(ws: { id: string }, u: { id: string }) {
  await db.insert(recruitmentProviderConnection).values({
    id: ulid(), workspaceId: ws.id, userId: u.id, provider: "prolific",
    accessToken: encryptSecret("prolific-token"), status: "active",
  });
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

/** Insert a response item with an explicit block instance id / module / answer shape. */
async function addRawItem(responseId: string, blockInstanceId: string, moduleKey: string, answer: unknown, n: number) {
  await db.insert(responseItem).values({
    id: ulid(),
    responseId,
    blockInstanceId,
    blockPosition: n,
    moduleSource: "core",
    moduleKey,
    moduleVersion: "1",
    answer: answer as Record<string, unknown>,
  });
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(qualityFlag);
  await db.delete(payoutRecord);
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(recruitmentProviderConnection);
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

describe("quality detection — amendment 1 rules", () => {
  it("flags a suspiciously slow completion (> 3x median)", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    for (let i = 0; i < 5; i++) await seedResponse(g, `p${i}`, 600); // median ~600s
    await seedResponse(g, "slowpoke", 3000); // > 1800
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.quality.rescan({});
    const slow = (await caller.recruitment.quality.list({ resolved: false })).filter((f) => f.flagKind === "slow_completion");
    expect(slow).toHaveLength(1);
    expect(slow[0]).toMatchObject({ externalPid: "slowpoke", severity: "low" });
  });

  it("flags a failed attention check against the version's correctAnswer", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const block = { instanceId: "ac1", source: "core", key: "attention-check", version: "1.0.0", config: { correctAnswer: "Strongly agree" } };
    const g = await seedStudyGraph(ws, u, "Study", [block]);
    const pass = await seedResponse(g, "honest", 600);
    await addRawItem(pass, "ac1", "attention-check", { selected: ["Strongly agree"] }, 1);
    const fail = await seedResponse(g, "inattentive", 600);
    await addRawItem(fail, "ac1", "attention-check", { selected: ["Neutral"] }, 1);
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.quality.rescan({});
    const ac = (await caller.recruitment.quality.list({ resolved: false })).filter((f) => f.flagKind === "attention_check");
    expect(ac).toHaveLength(1);
    expect(ac[0]).toMatchObject({ externalPid: "inattentive", severity: "high" });
  });

  it("flags spam free-text (URL) but not normal prose", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const spam = await seedResponse(g, "spammer", 600);
    await addRawItem(spam, "ft1", "free-text", { text: "visit http://buy-now.example" }, 1);
    const clean = await seedResponse(g, "genuine", 600);
    await addRawItem(clean, "ft1", "free-text", { text: "I found the task clear and engaging." }, 1);
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.quality.rescan({});
    const spamFlags = (await caller.recruitment.quality.list({ resolved: false })).filter((f) => f.flagKind === "spam_text");
    expect(spamFlags).toHaveLength(1);
    expect(spamFlags[0].externalPid).toBe("spammer");
  });

  it("background sweep flags across every workspace, idempotently", async () => {
    const a = await seedWs("a", "lab-a");
    const ga = await seedStudyGraph(a.ws, a.u);
    const session2 = ulid();
    await db.insert(recruitmentSession).values({ id: session2, experimentVersionId: ga.versionId, status: "open" });
    await seedResponse(ga, "dup", 600);
    await seedResponse({ ...ga, sessionId: session2 }, "dup", 600); // duplicate across sessions
    const b = await seedWs("b", "lab-b");
    const gb = await seedStudyGraph(b.ws, b.u);
    const r = await seedResponse(gb, "flat", 600);
    await addItem(r, "agree", 1);
    await addItem(r, "agree", 2);
    await addItem(r, "agree", 3);

    const first = await detectFlagsAllWorkspaces();
    expect(first.workspaces).toBe(2);
    expect(first.created).toBe(3); // 2 duplicate + 1 straight-lining
    const second = await detectFlagsAllWorkspaces();
    expect(second.created).toBe(0); // idempotent
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

describe("quality money actions (ADR-0052)", () => {
  async function seedLinkedFlag(opts: { rewardCents?: number } = {}) {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const subId = await seedSubmission(ws, g, "pidA", opts);
    const fid = ulid();
    await db.insert(qualityFlag).values({
      id: fid, workspaceId: ws.id, experimentId: g.experimentId, providerSubmissionId: subId,
      externalPid: "pidA", flagKind: "manual", severity: "medium", autoDetected: false,
    });
    return { u, ws, g, subId, fid };
  }

  it("approve calls the provider, writes a reward payout, and stamps the submission", async () => {
    const { ws, subId, fid } = await seedLinkedFlag({ rewardCents: 250 });
    await seedConnection(ws, (await db.select().from(user).limit(1))[0]);
    const caller = createCaller({ authUser: authUser("u") });

    const r = await caller.recruitment.quality.resolve({ flagId: fid, resolution: "approved" });
    expect(r.appliedOnProvider).toBe(true);
    expect(adapterSpies.approveSubmission).toHaveBeenCalledOnce();

    const payouts = await db.select().from(payoutRecord).where(eq(payoutRecord.providerSubmissionId, subId));
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ kind: "reward", amountCents: 250, currency: "GBP" });
    const [sub] = await db.select().from(providerSubmission).where(eq(providerSubmission.id, subId));
    expect(sub.status).toBe("approved");
    expect(sub.decidedByUserId).not.toBeNull();
  });

  it("reject requires a reason and calls the provider with it", async () => {
    const { ws, subId, fid } = await seedLinkedFlag();
    await seedConnection(ws, (await db.select().from(user).limit(1))[0]);
    const caller = createCaller({ authUser: authUser("u") });

    await expect(caller.recruitment.quality.resolve({ flagId: fid, resolution: "rejected" })).rejects.toThrow(/reason/i);
    expect(adapterSpies.rejectSubmission).not.toHaveBeenCalled();

    await caller.recruitment.quality.resolve({ flagId: fid, resolution: "rejected", note: "failed attention check" });
    expect(adapterSpies.rejectSubmission).toHaveBeenCalledWith(expect.objectContaining({ reason: "failed attention check" }));
    const [sub] = await db.select().from(providerSubmission).where(eq(providerSubmission.id, subId));
    expect(sub.status).toBe("rejected");
    expect(await db.select().from(payoutRecord)).toHaveLength(0);
  });

  it("approve without a connection records the decision audit-only (no provider call)", async () => {
    const { fid } = await seedLinkedFlag();
    const caller = createCaller({ authUser: authUser("u") });
    const r = await caller.recruitment.quality.resolve({ flagId: fid, resolution: "approved" });
    expect(r.appliedOnProvider).toBe(false);
    expect(adapterSpies.approveSubmission).not.toHaveBeenCalled();
    expect(await db.select().from(payoutRecord)).toHaveLength(0);
    expect(await caller.recruitment.quality.list({ resolved: true })).toHaveLength(1);
  });

  it("bonus calls the provider and writes a bonus payout in major units", async () => {
    const { ws, subId, fid } = await seedLinkedFlag();
    await seedConnection(ws, (await db.select().from(user).limit(1))[0]);
    const caller = createCaller({ authUser: authUser("u") });

    await caller.recruitment.quality.bonus({ flagId: fid, amountMajor: 1.5, reason: "thorough answers" });
    expect(adapterSpies.sendBonus).toHaveBeenCalledWith(expect.objectContaining({ amount: 1.5, reason: "thorough answers" }));
    const payouts = await db.select().from(payoutRecord).where(eq(payoutRecord.providerSubmissionId, subId));
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ kind: "bonus", amountCents: 150 });
  });

  it("bulkResolve approves many: provider called per linked flag, payouts written, summary returned", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    await seedConnection(ws, (await db.select().from(user).limit(1))[0]);
    const fids: string[] = [];
    for (const pid of ["pidA", "pidB"]) {
      const subId = await seedSubmission(ws, g, pid, { rewardCents: 200 });
      const fid = ulid();
      await db.insert(qualityFlag).values({
        id: fid, workspaceId: ws.id, experimentId: g.experimentId, providerSubmissionId: subId,
        externalPid: pid, flagKind: "fast_completion", severity: "medium", autoDetected: true,
      });
      fids.push(fid);
    }
    const caller = createCaller({ authUser: authUser("u") });
    const r = await caller.recruitment.quality.bulkResolve({ flagIds: fids, resolution: "approved" });
    expect(r).toMatchObject({ resolved: 2, appliedOnProvider: 2 });
    expect(r.failed).toHaveLength(0);
    expect(adapterSpies.approveSubmission).toHaveBeenCalledTimes(2);
    expect(await db.select().from(payoutRecord)).toHaveLength(2);
    expect(await caller.recruitment.quality.list({ resolved: false })).toHaveLength(0);
  });

  it("bulkResolve reject requires a shared reason", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const fid = ulid();
    await db.insert(qualityFlag).values({ id: fid, workspaceId: ws.id, experimentId: g.experimentId, flagKind: "manual", severity: "medium", autoDetected: false });
    const caller = createCaller({ authUser: authUser("u") });
    await expect(caller.recruitment.quality.bulkResolve({ flagIds: [fid], resolution: "rejected" })).rejects.toThrow(/reason/i);
  });

  it("bonus on a flag with no linked submission is PRECONDITION_FAILED", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const fid = ulid();
    await db.insert(qualityFlag).values({ id: fid, workspaceId: ws.id, experimentId: g.experimentId, flagKind: "manual", severity: "medium", autoDetected: false });
    const caller = createCaller({ authUser: authUser("u") });
    await expect(caller.recruitment.quality.bonus({ flagId: fid, amountMajor: 1, reason: "x" })).rejects.toThrow();
    expect(adapterSpies.sendBonus).not.toHaveBeenCalled();
  });

  it("responsePreview returns the participant's answers + duration", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const g = await seedStudyGraph(ws, u);
    const rid = await seedResponse(g, "pidA", 42);
    await addItem(rid, "strongly agree", 1);
    await addItem(rid, 7, 2);
    const fid = ulid();
    await db.insert(qualityFlag).values({ id: fid, workspaceId: ws.id, experimentId: g.experimentId, responseId: rid, externalPid: "pidA", flagKind: "fast_completion", severity: "high", autoDetected: true });
    const caller = createCaller({ authUser: authUser("u") });

    const preview = await caller.recruitment.quality.responsePreview({ flagId: fid });
    expect(preview.responseId).toBe(rid);
    expect(preview.durationSec).toBe(42);
    expect(preview.items).toHaveLength(2);
    expect(preview.items[0].answer).toMatchObject({ value: "strongly agree" });
  });
});
