import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Read adapters mocked to a controlled "available" result (ADR-0080) — the metrics
// test asserts DB calculations + that external data flows through the cache.
vi.mock("@/server/adapters/insights.posthog", () => ({
  fetchPosthogInsights: vi.fn(async () => ({
    available: true,
    activeUsers: { dau: 3, wau: 9, mau: 20 },
    topEvents: [{ event: "study_created", count: 12 }],
  })),
}));
vi.mock("@/server/adapters/insights.sentry", () => ({
  fetchSentryInsights: vi.fn(async () => ({
    available: true,
    openIssues: 2,
    openIssuesCapped: false,
    events24h: 5,
    topIssues: [{ title: "TypeError", count: 4, permalink: null }],
  })),
}));

import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  adminMetricSnapshot,
  condition,
  emailSettings,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  response,
  user,
  workspace,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
function authUser(ext: string): AuthUser {
  return { id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true };
}
async function seedUser(ext: string, isAdmin = false): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext, isAdmin }).returning();
  return u.id;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(adminMetricSnapshot);
  await db.delete(emailSettings);
  // Break the experiment <-> version FK cycle before dropping versions.
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
  delete process.env.ADMIN_USER_IDS;
});
afterEach(() => {
  delete process.env.ADMIN_USER_IDS;
});

describe("adminProcedure gate (ADR-0075)", () => {
  it("forbids a non-admin (no column, no env)", async () => {
    await seedUser("hanna", false);
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.admin.overview()).rejects.toThrow();
  });

  it("allows via the user.is_admin column (no env allow-list)", async () => {
    const uid = await seedUser("boss", true);
    await db.insert(workspace).values({ name: "W", slug: "w", ownerId: uid });
    const caller = createCaller({ authUser: authUser("boss") });
    const o = await caller.admin.overview();
    expect(o.workspaces).toBe(1);
    expect(o.users).toBe(1);
    expect(typeof o.monthlyAiCostUsd).toBe("number");
  });

  it("allows via the ADMIN_USER_IDS env fallback (column still false)", async () => {
    await seedUser("owner", false);
    process.env.ADMIN_USER_IDS = "owner";
    const caller = createCaller({ authUser: authUser("owner") });
    const o = await caller.admin.overview();
    expect(o.users).toBe(1);
  });

  it("workspaces + users census return for an admin and are forbidden otherwise", async () => {
    const boss = await seedUser("boss", true);
    await db.insert(workspace).values({ name: "W", slug: "w", ownerId: boss });
    await seedUser("hanna", false);

    const admin = createCaller({ authUser: authUser("boss") });
    const ws = await admin.admin.workspaces();
    const users = await admin.admin.users();
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ name: "W", slug: "w" });
    expect(users.length).toBeGreaterThanOrEqual(2);

    const nonAdmin = createCaller({ authUser: authUser("hanna") });
    await expect(nonAdmin.admin.workspaces()).rejects.toThrow();
    await expect(nonAdmin.admin.users()).rejects.toThrow();
  });

  it("workspaces census reports real member + study counts (regression: all-zeroes)", async () => {
    const boss = await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const mallory = await seedUser("mallory", false);
    const [w] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: boss }).returning();
    // Two active members + one soft-removed (should NOT count) + two studies.
    await db.insert(member).values([
      { workspaceId: w.id, userId: boss, role: "owner", status: "active" },
      { workspaceId: w.id, userId: hanna, role: "editor", status: "active" },
      { workspaceId: w.id, userId: mallory, role: "viewer", status: "active", removedAt: new Date() },
    ]);
    await db.insert(experiment).values([
      { tenantId: w.id, ownerId: boss, title: "Study A" },
      { tenantId: w.id, ownerId: boss, title: "Study B" },
    ]);

    const [row] = await createCaller({ authUser: authUser("boss") }).admin.workspaces();
    expect(row.memberCount).toBe(2); // soft-removed excluded
    expect(row.studyCount).toBe(2);
  });

  it("census excludes app-owned system rows (ADR-0079)", async () => {
    const boss = await seedUser("boss", true);
    await db.insert(workspace).values({ name: "Real", slug: "real", ownerId: boss });
    // A system account: user + workspace + a study, all is_system / system-owned.
    const [sys] = await db
      .insert(user)
      .values({ externalId: "sys", email: "sys@e.com", displayName: "Sys", isSystem: true })
      .returning();
    const [sysWs] = await db
      .insert(workspace)
      .values({ name: "Starters", slug: "starters", ownerId: sys.id, isSystem: true })
      .returning();
    await db.insert(experiment).values({ tenantId: sysWs.id, ownerId: sys.id, title: "Starter study" });

    const admin = createCaller({ authUser: authUser("boss") });
    const o = await admin.admin.overview();
    expect(o.workspaces).toBe(1); // system workspace excluded
    expect(o.users).toBe(1); // system user excluded
    expect(o.studies).toBe(0); // system-owned study excluded

    const ws = await admin.admin.workspaces();
    expect(ws.map((w) => w.slug)).toEqual(["real"]);
    const users = await admin.admin.users();
    expect(users.map((u) => u.email)).not.toContain("sys@e.com");
  });

  it("metrics: DB metrics fresh + system rows excluded + external via cache (ADR-0080)", async () => {
    const boss = await seedUser("boss", true);
    const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: boss }).returning();

    // A published study (with an open recruitment + one completed response) + a draft.
    const mkStudy = async (kind: "published" | "autosave") => {
      const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: boss, title: kind }).returning();
      const [ver] = await db
        .insert(experimentVersion)
        .values({
          experimentId: exp.id,
          createdBy: boss,
          versionNumber: kind === "published" ? 1 : 0,
          kind,
          name: kind === "published" ? "v1" : null,
          definitionSnapshot: { blocks: [] },
          moduleVersionLocks: [],
        })
        .returning();
      await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
      return { exp, ver };
    };
    const pub = await mkStudy("published");
    await mkStudy("autosave");

    const recId = ulid();
    await db.insert(recruitmentSession).values({ id: recId, experimentVersionId: pub.ver.id, status: "open" });
    const condId = ulid();
    await db.insert(condition).values({ id: condId, experimentVersionId: pub.ver.id, slug: "control", name: "Control", position: 0 });
    await db.insert(response).values({
      id: ulid(),
      recruitmentSessionId: recId,
      experimentVersionId: pub.ver.id,
      conditionId: condId,
      mode: "run",
      status: "completed",
    });

    // A system account + its study — must NOT count toward the census.
    const [sys] = await db
      .insert(user)
      .values({ externalId: "sys", email: "sys@e.com", displayName: "Sys", isSystem: true })
      .returning();
    const [sysWs] = await db
      .insert(workspace)
      .values({ name: "Starters", slug: "starters", ownerId: sys.id, isSystem: true })
      .returning();
    await db.insert(experiment).values({ tenantId: sysWs.id, ownerId: sys.id, title: "Starter" });

    const m = await createCaller({ authUser: authUser("boss") }).admin.metrics();

    expect(m.growth.totalUsers).toBe(1); // system user excluded
    expect(m.growth.new30d).toBe(1);
    expect(m.research.studiesTotal).toBe(2); // system study excluded
    expect(m.research.stages).toEqual({ draft: 1, preregistered: 0, published: 1 });
    expect(m.research.runningStudies).toBe(1);
    expect(m.research.responsesTotal).toBe(1);

    // External metrics flow through the mocked adapters + the snapshot cache.
    expect(m.posthog.data.available).toBe(true);
    if (m.posthog.data.available) expect(m.posthog.data.activeUsers.mau).toBe(20);
    expect(m.sentry.data.available).toBe(true);
    if (m.sentry.data.available) expect(m.sentry.data.openIssues).toBe(2);

    const snaps = await db.select().from(adminMetricSnapshot);
    expect(snaps.map((s) => s.key).sort()).toEqual(["posthog", "sentry"]);
  });

  it("email settings: defaults OFF, admin updates them, non-admin is forbidden (ADR-0081)", async () => {
    await seedUser("boss", true);
    await seedUser("hanna", false);
    const admin = createCaller({ authUser: authUser("boss") });

    const initial = await admin.admin.emailSettings();
    expect(initial.digestEnabled).toBe(false);
    expect(initial.nudgeEnabled).toBe(false);

    const updated = await admin.admin.updateEmailSettings({ digestEnabled: true, digestHourUtc: 13 });
    expect(updated.digestEnabled).toBe(true);
    expect(updated.digestHourUtc).toBe(13);

    // Test-send reports not-configured in the test env (no RESEND_API_KEY) — no throw.
    const test = await admin.admin.sendTestEmail({ kind: "digest" });
    expect(test.ok).toBe(false);

    const nonAdmin = createCaller({ authUser: authUser("hanna") });
    await expect(nonAdmin.admin.emailSettings()).rejects.toThrow();
    await expect(nonAdmin.admin.updateEmailSettings({ digestEnabled: false })).rejects.toThrow();
  });

  it("me.isAdmin reflects the gate", async () => {
    await seedUser("boss", true);
    await seedUser("hanna", false);
    expect(await createCaller({ authUser: authUser("boss") }).me.isAdmin()).toBe(true);
    expect(await createCaller({ authUser: authUser("hanna") }).me.isAdmin()).toBe(false);
  });
});
