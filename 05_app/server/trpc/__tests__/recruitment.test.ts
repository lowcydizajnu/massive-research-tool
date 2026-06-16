/**
 * recruitmentRouter — provider connections (V1.15 Stream P1 / ADR-0047). Token
 * validated via a mocked adapter; stored encrypted; never returned. Over a real
 * migrated PGlite DB.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// Keep the real error classes + types (the router does `instanceof`); stub only the adapter getter.
vi.mock("@/server/adapters/recruitment", async (orig) => {
  const actual = await orig<typeof import("@/server/adapters/recruitment")>();
  return { ...actual, getRecruitmentAdapter: vi.fn() };
});

import { eq } from "drizzle-orm";

import {
  InvalidProviderTokenError,
  getRecruitmentAdapter,
  type RecruitmentAdapter,
} from "@/server/adapters/recruitment";
import type { AuthUser } from "@/server/adapters/auth";
import { decryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  member,
  providerSubmission,
  recruitmentProviderConnection,
  recruitmentProviderWebhook,
  recruitmentSession,
  user,
  workspace,
} from "@/server/db/schema";
import { ulid } from "ulid";
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

/** A fake adapter whose validateToken behavior the test controls. */
function fakeAdapter(over: Partial<RecruitmentAdapter> = {}): RecruitmentAdapter {
  return {
    validateToken: vi.fn().mockResolvedValue({ providerUserId: "prolific-u1" }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    createStudy: vi.fn(),
    publishStudy: vi.fn(),
    pauseStudy: vi.fn(),
    closeStudy: vi.fn(),
    getStudy: vi.fn().mockResolvedValue({ state: "active", placesTaken: 0, totalPlaces: 0 }),
    listSubmissions: vi.fn(),
    approveSubmission: vi.fn(),
    rejectSubmission: vi.fn(),
    sendBonus: vi.fn(),
    createWebhookSecret: vi.fn().mockResolvedValue({ secret: "whsec" }),
    listWebhookEventTypes: vi.fn().mockResolvedValue(["study.status.change", "submission.status.change"]),
    createWebhookSubscription: vi.fn().mockResolvedValue({ subscriptionId: "sub1", confirmationToken: "tok" }),
    confirmWebhookSubscription: vi.fn().mockResolvedValue(undefined),
    deleteWebhookSubscription: vi.fn().mockResolvedValue(undefined),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    ...over,
  };
}

async function seedWs(role: "owner" | "viewer" = "owner") {
  const [u] = await db.insert(user).values({ externalId: "u", email: "u@e.com", displayName: "u" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role, status: "active" });
  return { u, ws };
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(providerSubmission);
  await db.delete(recruitmentProviderWebhook);
  await db.delete(recruitmentSession);
  await db.delete(recruitmentProviderConnection);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("recruitment.connections", () => {
  it("connect validates the token, stores it encrypted, and list returns status without the token", async () => {
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });

    await expect(caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT-secret" })).resolves.toEqual({
      ok: true,
    });

    const [row] = await db.select().from(recruitmentProviderConnection);
    expect(row.providerUserId).toBe("prolific-u1");
    expect(row.accessToken).not.toContain("PAT-secret"); // encrypted
    expect(decryptSecret(row.accessToken)).toBe("PAT-secret"); // round-trips

    const list = await caller.recruitment.connections.list();
    expect(list).toEqual([
      expect.objectContaining({ provider: "prolific", status: "active", providerUserId: "prolific-u1" }),
    ]);
    expect(JSON.stringify(list)).not.toContain("PAT-secret"); // token never surfaced
  });

  it("a bad token is rejected (BAD_REQUEST) and writes no row", async () => {
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({ validateToken: vi.fn().mockRejectedValue(new InvalidProviderTokenError()) }),
    );
    const caller = createCaller({ authUser: authUser("u") });
    await expect(
      caller.recruitment.connections.connect({ provider: "prolific", accessToken: "nope" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(recruitmentProviderConnection)).toHaveLength(0);
  });

  it("reconnect replaces the stored token in place (no duplicate row)", async () => {
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "first" });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "second" });
    const rows = await db.select().from(recruitmentProviderConnection);
    expect(rows).toHaveLength(1);
    expect(decryptSecret(rows[0].accessToken)).toBe("second");
  });

  it("disconnect deletes the connection", async () => {
    const { ws } = await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "x" });
    await expect(caller.recruitment.connections.disconnect({ provider: "prolific" })).resolves.toEqual({ ok: true });
    expect(
      await db.select().from(recruitmentProviderConnection).where(eq(recruitmentProviderConnection.workspaceId, ws.id)),
    ).toHaveLength(0);
  });

  it("a viewer can't connect (read-only)", async () => {
    await seedWs("viewer");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await expect(
      caller.recruitment.connections.connect({ provider: "prolific", accessToken: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("recruitment.createProviderStudy (P1b bridge)", () => {
  /** A study with a runnable (preregistered) version + an open recruitment session. */
  async function seedRunnableStudy(ws: { id: string }, owner: { id: string }) {
    const [exp] = await db
      .insert(experiment)
      .values({ tenantId: ws.id, ownerId: owner.id, title: "Study" })
      .returning();
    const [ver] = await db
      .insert(experimentVersion)
      .values({ experimentId: exp.id, versionNumber: 1, kind: "preregistered", name: "v1", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: owner.id })
      .returning();
    await db.insert(recruitmentSession).values({ id: ulid(), experimentVersionId: ver.id, status: "open" });
    return exp.id as string;
  }

  it("creates + publishes a provider study, forwards eligibility, and stashes it on the session", async () => {
    const { u, ws } = await seedWs("owner");
    const studyId = await seedRunnableStudy(ws, u);
    const createStudy = vi.fn().mockResolvedValue({ providerStudyId: "P1", providerStudyUrl: "https://prolific/P1" });
    const publishStudy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter({ createStudy, publishStudy }));
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });

    const r = await caller.recruitment.createProviderStudy({
      studyId,
      provider: "prolific",
      title: "T",
      targetN: 50,
      reward: { amount: 1.5, currency: "GBP" },
      eligibility: { country: ["PL"], language: ["pl"] },
    });
    expect(r.providerStudyUrl).toBe("https://prolific/P1");
    expect(createStudy).toHaveBeenCalledWith(expect.objectContaining({ eligibility: { country: ["PL"], language: ["pl"] } }));
    expect(publishStudy).toHaveBeenCalledWith(expect.objectContaining({ providerStudyId: "P1" }));

    const got = await caller.recruitment.getProviderStudy({ studyId });
    expect(got).toMatchObject({ providerStudyId: "P1", status: "live", name: "prolific" });
  });

  it("requires an open recruitment session", async () => {
    const { u, ws } = await seedWs("owner");
    // Runnable version but NO open session.
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "S" }).returning();
    await db
      .insert(experimentVersion)
      .values({ experimentId: exp.id, versionNumber: 1, kind: "preregistered", name: "v1", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: u.id });
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });
    await expect(
      caller.recruitment.createProviderStudy({
        studyId: exp.id,
        provider: "prolific",
        title: "T",
        targetN: 10,
        reward: { amount: 1, currency: "GBP" },
        eligibility: { country: [], language: [] },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("requires a provider connection", async () => {
    const { u, ws } = await seedWs("owner");
    const studyId = await seedRunnableStudy(ws, u);
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await expect(
      caller.recruitment.createProviderStudy({
        studyId,
        provider: "prolific",
        title: "T",
        targetN: 10,
        reward: { amount: 1, currency: "GBP" },
        eligibility: { country: [], language: [] },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("recruitment.openRecruitment.list (Stream P2)", () => {
  /** Runnable study + open session carrying a provider study in metadata. */
  async function seedProviderStudy(ws: { id: string }, owner: { id: string }, providerStudyId = "P1") {
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: owner.id, title: "Study" }).returning();
    const [ver] = await db
      .insert(experimentVersion)
      .values({ experimentId: exp.id, versionNumber: 1, kind: "preregistered", name: "v1", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: owner.id })
      .returning();
    const sessionId = ulid();
    await db.insert(recruitmentSession).values({
      id: sessionId,
      experimentVersionId: ver.id,
      status: "open",
      metadata: {
        provider: {
          name: "prolific",
          providerStudyId,
          providerStudyUrl: `https://app.prolific.com/researcher/studies/${providerStudyId}`,
          status: "live",
          eligibility: { country: [], language: [] },
          reward: { amount: 1.5, currency: "GBP" },
        },
      },
    });
    return { experimentId: exp.id as string, sessionId, providerStudyId };
  }

  it("aggregates stored submission counts per study (no connection → no live reconcile)", async () => {
    const { u, ws } = await seedWs("owner");
    const { experimentId, sessionId, providerStudyId } = await seedProviderStudy(ws, u);
    for (const [submissionId, status] of [["s1", "approved"], ["s2", "approved"], ["s3", "submitted"]] as const) {
      await db.insert(providerSubmission).values({
        id: ulid(),
        workspaceId: ws.id,
        experimentId,
        recruitmentSessionId: sessionId,
        provider: "prolific",
        providerStudyId,
        submissionId,
        externalPid: `pid-${submissionId}`,
        status,
      });
    }
    const caller = createCaller({ authUser: authUser("u") });
    const list = await caller.recruitment.openRecruitment.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ studyId: experimentId, provider: "prolific", providerStatus: "live" });
    expect(list[0].counts).toMatchObject({ approved: 2, submitted: 1, total: 3 });
  });

  it("reconciles live submissions via the adapter when the caller is connected (idempotent upsert)", async () => {
    const { u, ws } = await seedWs("owner");
    const { experimentId } = await seedProviderStudy(ws, u, "P9");
    const listSubmissions = vi.fn().mockResolvedValue([
      { submissionId: "x1", externalPid: "pid1", status: "approved", startedAt: new Date(), completedAt: new Date() },
      { submissionId: "x2", externalPid: "pid2", status: "started", startedAt: new Date() },
    ]);
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter({ listSubmissions }));
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });

    const first = await caller.recruitment.openRecruitment.list();
    expect(first[0].counts).toMatchObject({ approved: 1, started: 1, total: 2 });
    // Idempotent — running again doesn't duplicate rows.
    await caller.recruitment.openRecruitment.list();
    expect(await db.select().from(providerSubmission).where(eq(providerSubmission.experimentId, experimentId))).toHaveLength(2);
  });

  it("forStudy returns null when the study has no provider study attached", async () => {
    await seedWs("owner");
    const caller = createCaller({ authUser: authUser("u") });
    // A random in-workspace study id with no open provider session → null.
    const result = await caller.recruitment.openRecruitment.forStudy({ studyId: "00000000-0000-4000-8000-000000000000" });
    expect(result).toBeNull();
  });

  it("forStudy aggregates this study's stored counts (powers the Run-card progress row)", async () => {
    const { u, ws } = await seedWs("owner");
    const { experimentId, sessionId, providerStudyId } = await seedProviderStudy(ws, u, "PF1");
    for (const [submissionId, status] of [["a", "approved"], ["b", "submitted"], ["c", "started"]] as const) {
      await db.insert(providerSubmission).values({
        id: ulid(),
        workspaceId: ws.id,
        experimentId,
        recruitmentSessionId: sessionId,
        provider: "prolific",
        providerStudyId,
        submissionId,
        externalPid: `pid-${submissionId}`,
        status,
      });
    }
    const caller = createCaller({ authUser: authUser("u") });
    const result = await caller.recruitment.openRecruitment.forStudy({ studyId: experimentId });
    // No connection → no live reconcile; stored status "live" → state "active".
    expect(result).toMatchObject({ state: "active", placesTaken: null, totalPlaces: null });
    expect(result?.counts).toMatchObject({ approved: 1, submitted: 1, started: 1, total: 3 });
  });

  it("forStudy reconciles the live provider status + progress and persists it (live→paused)", async () => {
    const { u, ws } = await seedWs("owner");
    const { experimentId, sessionId } = await seedProviderStudy(ws, u, "PF2");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({
        listSubmissions: vi.fn().mockResolvedValue([]),
        getStudy: vi.fn().mockResolvedValue({ state: "paused", placesTaken: 50, totalPlaces: 50 }),
      }),
    );
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });

    const result = await caller.recruitment.openRecruitment.forStudy({ studyId: experimentId });
    expect(result).toMatchObject({ state: "paused", placesTaken: 50, totalPlaces: 50 });

    // The reconciled status is persisted back: live → stopped, state → paused.
    const [row] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, sessionId));
    const provider = (row.metadata as { provider: { status: string; state: string } }).provider;
    expect(provider).toMatchObject({ status: "stopped", state: "paused" });
  });
});

describe("recruitment.webhook (ADR-0050 one-click connect)", () => {
  const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl;
  });

  it("enable orchestrates secret + subscriptions + confirm, and stores the encrypted secret", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    await seedWs("owner");
    const createWebhookSubscription = vi
      .fn()
      .mockResolvedValueOnce({ subscriptionId: "subA", confirmationToken: "tA" })
      .mockResolvedValueOnce({ subscriptionId: "subB", confirmationToken: "tB" });
    const confirmWebhookSubscription = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({
        createWebhookSecret: vi.fn().mockResolvedValue({ secret: "PROLIFIC-WH-SECRET" }),
        listWebhookEventTypes: vi.fn().mockResolvedValue(["study.status.change", "submission.status.change", "study.published"]),
        createWebhookSubscription,
        confirmWebhookSubscription,
      }),
    );
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });

    const res = await caller.recruitment.webhook.enable({ provider: "prolific" });
    expect(res.connected).toBe(true);
    // Only the two "status" event types are subscribed (not study.published).
    expect(res.eventTypes).toEqual(["study.status.change", "submission.status.change"]);
    expect(confirmWebhookSubscription).toHaveBeenCalledTimes(2);
    // Target URL carries the workspace id so the receiver can find this secret.
    expect(createWebhookSubscription.mock.calls[0][0].targetUrl).toMatch(/\/api\/recruitment\/prolific\/webhook\/[0-9a-f-]+$/);

    const [row] = await db.select().from(recruitmentProviderWebhook);
    expect(row.signingSecret).not.toContain("PROLIFIC-WH-SECRET"); // stored encrypted
    expect(decryptSecret(row.signingSecret)).toBe("PROLIFIC-WH-SECRET");

    // status reflects it; enabling again is idempotent (no duplicate row).
    expect((await caller.recruitment.webhook.status()).connected).toBe(true);
    await caller.recruitment.webhook.enable({ provider: "prolific" });
    expect(await db.select().from(recruitmentProviderWebhook)).toHaveLength(1);
  });

  it("enable refuses without a public https site URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    await seedWs("owner");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });
    await expect(caller.recruitment.webhook.enable({ provider: "prolific" })).rejects.toThrow(/HTTPS/i);
  });

  it("disable tears down provider subscriptions and removes our row", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    await seedWs("owner");
    const deleteWebhookSubscription = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({
        createWebhookSecret: vi.fn().mockResolvedValue({ secret: "s" }),
        listWebhookEventTypes: vi.fn().mockResolvedValue(["study.status.change"]),
        deleteWebhookSubscription,
      }),
    );
    const caller = createCaller({ authUser: authUser("u") });
    await caller.recruitment.connections.connect({ provider: "prolific", accessToken: "PAT" });
    await caller.recruitment.webhook.enable({ provider: "prolific" });

    const res = await caller.recruitment.webhook.disable({ provider: "prolific" });
    expect(res.connected).toBe(false);
    expect(deleteWebhookSubscription).toHaveBeenCalledWith({ accessToken: "PAT", subscriptionId: "sub1" });
    expect(await db.select().from(recruitmentProviderWebhook)).toHaveLength(0);
  });

  it("blocks a viewer from enabling (writeProcedure)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    await seedWs("viewer");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const caller = createCaller({ authUser: authUser("u") });
    await expect(caller.recruitment.webhook.enable({ provider: "prolific" })).rejects.toThrow();
  });
});
