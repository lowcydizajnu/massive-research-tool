/**
 * recruitment.compensation (V1.15 P4 / ADR-0048) over a real migrated PGlite DB.
 * Read-only spend mirror grouped BY CURRENCY (no blending); owner/admin-only budget.
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
import { experiment, member, payoutRecord, user, workspace, workspacePayoutBudget } from "@/server/db/schema";
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

async function seedStudy(ws: { id: string }, owner: { id: string }, title: string) {
  const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: owner.id, title }).returning();
  return exp.id as string;
}

async function addPayout(ws: string, exp: string, kind: "reward" | "bonus", cents: number, currency: string, decidedAt: Date) {
  await db.insert(payoutRecord).values({ id: ulid(), workspaceId: ws, experimentId: exp, kind, amountCents: cents, currency, decidedAt });
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(payoutRecord);
  await db.delete(workspacePayoutBudget);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("compensation.summary", () => {
  it("aggregates per currency (never blended) with last-30d + avg", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const exp = await seedStudy(ws, u, "S");
    const now = new Date();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await addPayout(ws.id, exp, "reward", 150, "GBP", now);
    await addPayout(ws.id, exp, "reward", 150, "GBP", now);
    await addPayout(ws.id, exp, "reward", 150, "GBP", old); // not in last 30
    await addPayout(ws.id, exp, "reward", 200, "USD", now);

    const caller = createCaller({ authUser: authUser("u") });
    const s = await caller.recruitment.compensation.summary();
    const gbp = s.currencies.find((c) => c.currency === "GBP")!;
    const usd = s.currencies.find((c) => c.currency === "USD")!;
    expect(gbp).toMatchObject({ allTimeCents: 450, last30Cents: 300, participantsPaid: 3, avgCents: 150 });
    expect(usd).toMatchObject({ allTimeCents: 200, participantsPaid: 1 });
    expect(s.budget).toBeNull();
  });
});

describe("compensation.byStudy + recentPayouts", () => {
  it("splits reward vs bonus per study and lists recent payouts with titles", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const exp = await seedStudy(ws, u, "Platformy");
    await addPayout(ws.id, exp, "reward", 100, "GBP", new Date());
    await addPayout(ws.id, exp, "bonus", 50, "GBP", new Date());

    const caller = createCaller({ authUser: authUser("u") });
    const byStudy = await caller.recruitment.compensation.byStudy();
    expect(byStudy[0]).toMatchObject({ title: "Platformy", currency: "GBP", participantsPaid: 1, rewardCents: 100, bonusCents: 50, totalCents: 150 });
    const recent = await caller.recruitment.compensation.recentPayouts();
    expect(recent).toHaveLength(2);
    expect(recent.every((p) => p.studyTitle === "Platformy")).toBe(true);
    expect(recent.every((p) => p.decidedBy === null)).toBe(true); // reconciled on provider
  });
});

describe("compensation.setBudget", () => {
  it("owner sets a budget; summary reflects this-month spend + over flags", async () => {
    const { u, ws } = await seedWs("u", "lab");
    const exp = await seedStudy(ws, u, "S");
    await addPayout(ws.id, exp, "reward", 9000, "GBP", new Date()); // £90 this month
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.compensation.setBudget({ monthlyLimitCents: 10000, currency: "GBP", alertThresholdPct: 80 });
    const s = await caller.recruitment.compensation.summary();
    expect(s.budget).toMatchObject({ monthlyLimitCents: 10000, currency: "GBP", thisMonthCents: 9000, overLimit: false, overThreshold: true });
  });

  it("clears the budget when monthlyLimitCents is null", async () => {
    const { u, ws } = await seedWs("u", "lab");
    void ws;
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.compensation.setBudget({ monthlyLimitCents: 5000, currency: "GBP", alertThresholdPct: 100 });
    await caller.recruitment.compensation.setBudget({ monthlyLimitCents: null, currency: "GBP", alertThresholdPct: 100 });
    expect((await caller.recruitment.compensation.summary()).budget).toBeNull();
  });

  it("blocks a viewer (writeProcedure) and a non-owner/admin", async () => {
    await seedWs("v", "lab2", "viewer");
    const caller = createCaller({ authUser: authUser("v") });
    await expect(
      caller.recruitment.compensation.setBudget({ monthlyLimitCents: 5000, currency: "GBP", alertThresholdPct: 100 }),
    ).rejects.toThrow();
  });
});
