/**
 * Auto-approval sweep (ADR-0053) over a real migrated PGlite DB with a mocked
 * provider adapter. Verifies clean+aged submissions auto-approve (system-decided
 * payout), while flagged / too-recent / disabled-workspace ones do not.
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

const approveSubmission = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/server/adapters/recruitment", async () => {
  const actual = await vi.importActual<typeof import("@/server/adapters/recruitment")>("@/server/adapters/recruitment");
  return { ...actual, getRecruitmentAdapter: () => ({ approveSubmission }) };
});

import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  experiment,
  payoutRecord,
  providerSubmission,
  qualityFlag,
  recruitmentProviderConnection,
  user,
  workspace,
  workspaceAutoApprovalPolicy,
} from "@/server/db/schema";
import { autoApproveEligible } from "@/server/recruitment/auto-approve";

const HOUR = 60 * 60 * 1000;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(payoutRecord);
  await db.delete(qualityFlag);
  await db.delete(providerSubmission);
  await db.delete(workspaceAutoApprovalPolicy);
  await db.delete(recruitmentProviderConnection);
  await db.delete(experiment);
  await db.delete(workspace);
  await db.delete(user);
});

async function seed(opts: { enabled: boolean; connected?: boolean }) {
  const [u] = await db.insert(user).values({ externalId: "u", email: "u@e.com", displayName: "u" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "Study" }).returning();
  if (opts.connected !== false) {
    await db.insert(recruitmentProviderConnection).values({
      id: ulid(), workspaceId: ws.id, userId: u.id, provider: "prolific", accessToken: encryptSecret("tok"), status: "active",
    });
  }
  await db.insert(workspaceAutoApprovalPolicy).values({ workspaceId: ws.id, enabled: opts.enabled, minAgeHours: 24 });
  return { u, ws, exp };
}

async function seedSub(ws: { id: string }, exp: { id: string }, pid: string, completedHoursAgo: number, now: number) {
  const id = ulid();
  await db.insert(providerSubmission).values({
    id, workspaceId: ws.id, experimentId: exp.id, provider: "prolific", providerStudyId: "P1",
    submissionId: `sub_${pid}`, externalPid: pid, status: "submitted",
    completedAt: new Date(now - completedHoursAgo * HOUR), rewardAmountCents: 200, currency: "GBP",
  });
  return id;
}

describe("autoApproveEligible (ADR-0053)", () => {
  it("approves a clean + aged submission: provider called, system payout written, status stamped", async () => {
    const now = Date.now();
    const { ws, exp } = await seed({ enabled: true });
    const subId = await seedSub(ws, exp, "clean", 48, now);
    const r = await autoApproveEligible(now);
    expect(r).toMatchObject({ workspaces: 1, approved: 1 });
    expect(approveSubmission).toHaveBeenCalledOnce();
    const [p] = await db.select().from(payoutRecord).where(eq(payoutRecord.providerSubmissionId, subId));
    expect(p).toMatchObject({ kind: "reward", amountCents: 200, decidedByUserId: null });
    const [sub] = await db.select().from(providerSubmission).where(eq(providerSubmission.id, subId));
    expect(sub.status).toBe("approved");
  });

  it("never approves a submission with an OPEN flag", async () => {
    const now = Date.now();
    const { ws, exp } = await seed({ enabled: true });
    const subId = await seedSub(ws, exp, "flagged", 48, now);
    await db.insert(qualityFlag).values({
      id: ulid(), workspaceId: ws.id, experimentId: exp.id, providerSubmissionId: subId,
      flagKind: "fast_completion", severity: "medium", autoDetected: true,
    });
    const r = await autoApproveEligible(now);
    expect(r.approved).toBe(0);
    expect(approveSubmission).not.toHaveBeenCalled();
  });

  it("does not approve a submission younger than minAgeHours", async () => {
    const now = Date.now();
    const { ws, exp } = await seed({ enabled: true });
    await seedSub(ws, exp, "fresh", 1, now); // 1h < 24h
    const r = await autoApproveEligible(now);
    expect(r.approved).toBe(0);
  });

  it("does nothing when the workspace has not opted in", async () => {
    const now = Date.now();
    const { ws, exp } = await seed({ enabled: false });
    await seedSub(ws, exp, "clean", 48, now);
    const r = await autoApproveEligible(now);
    expect(r).toMatchObject({ workspaces: 0, approved: 0 });
    expect(approveSubmission).not.toHaveBeenCalled();
  });

  it("is idempotent — a second run approves nothing new", async () => {
    const now = Date.now();
    const { ws, exp } = await seed({ enabled: true });
    await seedSub(ws, exp, "clean", 48, now);
    await autoApproveEligible(now);
    const r2 = await autoApproveEligible(now);
    expect(r2.approved).toBe(0); // already 'approved', no longer 'submitted'
    expect(await db.select().from(payoutRecord)).toHaveLength(1);
  });
});
