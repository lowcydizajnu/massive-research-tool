/**
 * Shared recruitment reconciliation (ADR-0050) — webhook + polling entry points.
 * Over a real migrated PGlite DB; the provider adapter is mocked so we control
 * what listSubmissions/getStudy return and which tokens "own" the study.
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

vi.mock("@/server/adapters/recruitment", async (orig) => {
  const actual = await orig<typeof import("@/server/adapters/recruitment")>();
  return { ...actual, getRecruitmentAdapter: vi.fn() };
});

import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import { InvalidProviderTokenError, getRecruitmentAdapter, type RecruitmentAdapter } from "@/server/adapters/recruitment";
import { encryptSecret } from "@/server/crypto/tokens";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  member,
  providerSubmission,
  recruitmentProviderConnection,
  recruitmentSession,
  user,
  workspace,
} from "@/server/db/schema";
import { pollProviderStatus, reconcileByProviderStudyId } from "@/server/recruitment/reconcile";

function fakeAdapter(over: Partial<RecruitmentAdapter> = {}): RecruitmentAdapter {
  return {
    validateToken: vi.fn().mockResolvedValue({ providerUserId: "u1" }),
    disconnect: vi.fn(),
    createStudy: vi.fn(),
    publishStudy: vi.fn(),
    pauseStudy: vi.fn(),
    closeStudy: vi.fn(),
    getStudy: vi.fn().mockResolvedValue({ state: "active", placesTaken: 0, totalPlaces: 0 }),
    listSubmissions: vi.fn().mockResolvedValue([]),
    approveSubmission: vi.fn(),
    rejectSubmission: vi.fn(),
    sendBonus: vi.fn(),
    createWebhookSecret: vi.fn().mockResolvedValue({ secret: "whsec" }),
    listWebhookEventTypes: vi.fn().mockResolvedValue(["study.status.change"]),
    createWebhookSubscription: vi.fn().mockResolvedValue({ subscriptionId: "sub1", confirmationToken: "tok" }),
    confirmWebhookSubscription: vi.fn().mockResolvedValue(undefined),
    deleteWebhookSubscription: vi.fn().mockResolvedValue(undefined),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    ...over,
  };
}

async function seedWsWithConnection() {
  const [u] = await db.insert(user).values({ externalId: "u", email: "u@e.com", displayName: "u" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  await db.insert(recruitmentProviderConnection).values({
    id: ulid(),
    workspaceId: ws.id,
    userId: u.id,
    provider: "prolific",
    accessToken: encryptSecret("PAT-TOKEN"),
    status: "active",
    providerUserId: "u1",
  });
  return { u, ws };
}

async function seedProviderStudy(
  ws: { id: string },
  owner: { id: string },
  providerStudyId: string,
  state: "active" | "paused" | "completed" = "active",
) {
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
        status: state === "active" ? "live" : "stopped",
        state,
        eligibility: { country: [], language: [] },
        reward: { amount: 1.5, currency: "GBP" },
      },
    },
  });
  return { experimentId: exp.id as string, sessionId };
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(providerSubmission);
  await db.delete(recruitmentSession);
  await db.delete(recruitmentProviderConnection);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("reconcileByProviderStudyId (webhook entry)", () => {
  it("returns found:false when no open session carries that provider study", async () => {
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter());
    const r = await reconcileByProviderStudyId("prolific", "does-not-exist");
    expect(r).toEqual({ found: false, reconciled: false });
  });

  it("finds the study, upserts submissions, and persists the reconciled status", async () => {
    const { u, ws } = await seedWsWithConnection();
    const { experimentId, sessionId } = await seedProviderStudy(ws, u, "PW1", "active");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({
        listSubmissions: vi.fn().mockResolvedValue([
          { submissionId: "s1", externalPid: "pid1", status: "approved", startedAt: new Date(), completedAt: new Date() },
        ]),
        getStudy: vi.fn().mockResolvedValue({ state: "completed", placesTaken: 1, totalPlaces: 1 }),
      }),
    );

    const r = await reconcileByProviderStudyId("prolific", "PW1");
    expect(r).toEqual({ found: true, reconciled: true });

    const subs = await db.select().from(providerSubmission).where(eq(providerSubmission.experimentId, experimentId));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ externalPid: "pid1", status: "approved" });

    const [row] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, sessionId));
    const provider = (row.metadata as { provider: { status: string; state: string } }).provider;
    expect(provider).toMatchObject({ status: "stopped", state: "completed" }); // completed → not "live"
  });

  it("skips a token that can't see the study (InvalidProviderTokenError) and falls through", async () => {
    const { u, ws } = await seedWsWithConnection();
    await seedProviderStudy(ws, u, "PW2", "active");
    vi.mocked(getRecruitmentAdapter).mockReturnValue(
      fakeAdapter({ listSubmissions: vi.fn().mockRejectedValue(new InvalidProviderTokenError()) }),
    );
    // Only one (failing) token → found but not reconciled; no throw.
    const r = await reconcileByProviderStudyId("prolific", "PW2");
    expect(r).toEqual({ found: true, reconciled: false });
  });
});

describe("pollProviderStatus (cron safety-net)", () => {
  it("reconciles still-recruiting studies and skips completed ones", async () => {
    const { u, ws } = await seedWsWithConnection();
    await seedProviderStudy(ws, u, "PA", "active");
    await seedProviderStudy(ws, u, "PB", "paused");
    await seedProviderStudy(ws, u, "PC", "completed"); // should be skipped
    const getStudy = vi.fn().mockResolvedValue({ state: "active", placesTaken: 0, totalPlaces: 10 });
    vi.mocked(getRecruitmentAdapter).mockReturnValue(fakeAdapter({ getStudy }));

    const res = await pollProviderStatus();
    expect(res).toEqual({ scanned: 2, reconciled: 2 }); // active + paused only
    expect(getStudy).toHaveBeenCalledTimes(2);
  });
});
