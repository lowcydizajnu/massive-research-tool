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
  activityEvent,
  adminViewAsLog,
  condition,
  experiment,
  experimentVersion,
  member,
  notification,
  qualityFlag,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";
import { startViewAs } from "@/app/actions/view-as";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

// startViewAs reads cookies + the REAL caller. Mock both so it runs headless.
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k) } : undefined),
    set: (k: string, v: string) => void cookieJar.set(k, v),
    delete: (k: string) => void cookieJar.delete(k),
  }),
}));
const currentDbUser = vi.hoisted(() => ({ value: null as { id: string; isAdmin: boolean } | null }));
vi.mock("@/server/auth/current-db-user", () => ({
  getCurrentDbUser: async () => currentDbUser.value,
}));

const createCaller = createCallerFactory(appRouter);
function authUser(ext: string): AuthUser {
  return { id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true };
}
async function seedUser(ext: string, isAdmin = false): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext, isAdmin }).returning();
  return u.id;
}

/** A workspace owned by `userId`, with `userId` as an active owner member. */
async function seedWorkspace(userId: string, slug: string, supportAccessEnabled = true): Promise<string> {
  const [ws] = await db
    .insert(workspace)
    .values({ name: slug, slug, ownerId: userId, supportAccessEnabled })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId, role: "owner", status: "active" });
  return ws.id;
}

/** A study with one runnable version + condition + one completed response carrying a raw answer. */
async function seedStudyWithResponse(wsId: string, ownerId: string) {
  const [exp] = await db.insert(experiment).values({ tenantId: wsId, ownerId, title: "Study" }).returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({
      experimentId: exp.id,
      versionNumber: 1,
      kind: "preregistered",
      name: "v1",
      definitionSnapshot: { blocks: [{ instanceId: "b1", source: "core", key: "free-text", version: "1", config: { prompt: "Tell us" } }] },
      moduleVersionLocks: {},
      createdBy: ownerId,
    })
    .returning();
  const [cond] = await db
    .insert(condition)
    .values({ id: ulid(), experimentVersionId: ver.id, slug: "c1", name: "C1", position: 0 })
    .returning();
  const sessionId = ulid();
  await db.insert(recruitmentSession).values({ id: sessionId, experimentVersionId: ver.id, status: "open" });
  const rid = ulid();
  await db.insert(response).values({
    id: rid,
    recruitmentSessionId: sessionId,
    experimentVersionId: ver.id,
    conditionId: cond.id,
    externalPid: "PID-SECRET",
    mode: "run",
    status: "completed",
    startedAt: new Date(Date.now() - 60_000),
    completedAt: new Date(),
  });
  await db.insert(responseItem).values({
    id: ulid(),
    responseId: rid,
    blockInstanceId: "b1",
    blockPosition: 1,
    moduleSource: "core",
    moduleKey: "free-text",
    moduleVersion: "1",
    answer: { text: "my private answer" },
  });
  return { studyId: exp.id as string, responseId: rid };
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

beforeEach(async () => {
  vi.clearAllMocks();
  cookieJar.clear();
  currentDbUser.value = null;
  await db.delete(qualityFlag);
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(adminViewAsLog);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
  delete process.env.ADMIN_USER_IDS;
});

describe("view-as (ADR-0075)", () => {
  it("an admin impersonating a researcher reads AS the target and is blocked from mutations", async () => {
    await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const caller = createCaller({ authUser: authUser("boss"), viewAsUserId: hanna });

    // Resolves as the target: viewingAs is set, and isAdmin reflects the TARGET (false).
    expect(await caller.me.viewingAs()).toMatchObject({ targetEmail: "hanna@e.com" });
    expect(await caller.me.isAdmin()).toBe(false);

    // All mutations are blocked while impersonating.
    await expect(caller.announcements.markAllRead()).rejects.toThrow(/read-only/i);
  });

  it("ignores the view-as cookie when the real caller is NOT an admin", async () => {
    const hanna = await seedUser("hanna", false);
    await seedUser("mallory", false);
    const caller = createCaller({ authUser: authUser("mallory"), viewAsUserId: hanna });

    expect(await caller.me.viewingAs()).toBeNull();
    // Not impersonating → mutations work normally.
    await expect(caller.announcements.markAllRead()).resolves.toMatchObject({ ok: true });
  });

  it("does not impersonate when the target is the admin themselves", async () => {
    const boss = await seedUser("boss", true);
    const caller = createCaller({ authUser: authUser("boss"), viewAsUserId: boss });
    expect(await caller.me.viewingAs()).toBeNull();
    expect(await caller.me.isAdmin()).toBe(true);
  });
});

describe("view-as participant-data minimization (ADR-0082)", () => {
  it("hides raw participant responses + the export rows in getResults, but keeps aggregates", async () => {
    await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const wsId = await seedWorkspace(hanna, "hanna-lab");
    const { studyId } = await seedStudyWithResponse(wsId, hanna);

    // Hanna (real) sees her own raw data.
    const own = createCaller({ authUser: authUser("hanna") });
    const ownResults = await own.studies.getResults({ studyId });
    expect(ownResults?.rows).toHaveLength(1);
    expect(ownResults?.rows[0]?.externalPid).toBe("PID-SECRET");
    expect(ownResults?.participantDataHidden).toBeFalsy();

    // Boss impersonating Hanna: aggregate counts survive, row-level data is gone.
    const asBoss = createCaller({ authUser: authUser("boss"), viewAsUserId: hanna });
    const viewed = await asBoss.studies.getResults({ studyId });
    expect(viewed?.participantDataHidden).toBe(true);
    expect(viewed?.rows).toHaveLength(0);
    expect(viewed?.totalCompleted).toBe(1); // aggregate count still visible
    expect(viewed?.conditions[0]?.completed).toBe(1); // per-condition aggregate visible
    // No raw answer leaks anywhere in the payload.
    expect(JSON.stringify(viewed)).not.toContain("my private answer");
    expect(JSON.stringify(viewed)).not.toContain("PID-SECRET");
  });

  it("blocks the flagged-response preview (raw answers) while impersonating", async () => {
    await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const wsId = await seedWorkspace(hanna, "hanna-lab");
    const { studyId, responseId } = await seedStudyWithResponse(wsId, hanna);
    const fid = ulid();
    await db.insert(qualityFlag).values({
      id: fid, workspaceId: wsId, experimentId: studyId, responseId, externalPid: "PID-SECRET",
      flagKind: "fast_completion", severity: "high", autoDetected: true,
    });

    const own = createCaller({ authUser: authUser("hanna") });
    expect((await own.recruitment.quality.responsePreview({ flagId: fid })).items).toHaveLength(1);

    const asBoss = createCaller({ authUser: authUser("boss"), viewAsUserId: hanna });
    const preview = await asBoss.recruitment.quality.responsePreview({ flagId: fid });
    expect(preview.participantDataHidden).toBe(true);
    expect(preview.items).toHaveLength(0);
    expect(JSON.stringify(preview)).not.toContain("my private answer");
  });
});

describe("view-as break-glass reason + transparency (ADR-0082)", () => {
  it("requires a non-empty reason to enter and stores it on the audit log", async () => {
    const boss = await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    currentDbUser.value = { id: boss, isAdmin: true };

    // Empty / whitespace reason is rejected; nothing logged, no cookie set.
    expect(await startViewAs(hanna, "   ")).toMatchObject({ ok: false, error: "reason_required" });
    expect(await db.select().from(adminViewAsLog)).toHaveLength(0);
    expect(cookieJar.get("view_as_user_id")).toBeUndefined();

    // A real reason enters, logs the reason, and sets the cookie.
    expect(await startViewAs(hanna, "Investigating a billing bug")).toMatchObject({ ok: true });
    const log = await db.select().from(adminViewAsLog).where(eq(adminViewAsLog.action, "enter"));
    expect(log).toHaveLength(1);
    expect(log[0].reason).toBe("Investigating a billing bug");
    expect(cookieJar.get("view_as_user_id")).toBe(hanna);
  });

  it("notifies the target researcher (with the reason) when a session starts", async () => {
    const boss = await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    currentDbUser.value = { id: boss, isAdmin: true };

    await startViewAs(hanna, "Helping debug results export");

    // The target sees a notification about the support session, including the reason.
    const target = createCaller({ authUser: authUser("hanna") });
    const notes = await target.notifications.list();
    const support = notes.find((n) => n.type === "admin.support_access");
    expect(support).toBeTruthy();
    expect(support?.payload.reason).toBe("Helping debug results export");
    expect(await target.notifications.unreadCount()).toBeGreaterThan(0);
  });
});

describe("view-as per-workspace support-access setting (ADR-0082)", () => {
  it("excludes a support-access-disabled workspace from the impersonated view", async () => {
    await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const wsId = await seedWorkspace(hanna, "hanna-lab", /* supportAccessEnabled */ false);
    const { studyId } = await seedStudyWithResponse(wsId, hanna);

    // Hanna herself is unaffected — she can read her own workspace's results.
    const own = createCaller({ authUser: authUser("hanna") });
    expect((await own.studies.getResults({ studyId }))?.totalCompleted).toBe(1);
    expect((await own.workspace.active()).supportAccessEnabled).toBe(false);

    // Boss impersonating Hanna is denied at the workspace gate — studies/results hidden.
    const asBoss = createCaller({ authUser: authUser("boss"), viewAsUserId: hanna });
    await expect(asBoss.studies.getResults({ studyId })).rejects.toThrow(/support access/i);
    await expect(asBoss.studies.list()).rejects.toThrow(/support access/i);
  });

  it("still allows the impersonated view when support access is enabled (default)", async () => {
    await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const wsId = await seedWorkspace(hanna, "hanna-lab"); // enabled by default
    await seedStudyWithResponse(wsId, hanna);

    const asBoss = createCaller({ authUser: authUser("boss"), viewAsUserId: hanna });
    // The workspace gate passes; the study list resolves (aggregate/config visible).
    await expect(asBoss.studies.list()).resolves.toBeDefined();
  });
});
