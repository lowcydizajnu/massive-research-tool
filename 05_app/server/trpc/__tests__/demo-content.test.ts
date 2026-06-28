/**
 * Honest demo-content toggle (ADR-0023). `workspace.show_demo_content` HIDES (never
 * deletes) seeded demo studies (experiment.is_demo) + demo teammates (member.is_demo)
 * from researcher-facing surfaces when OFF, and reveals them when ON. Admin platform
 * metrics ALWAYS exclude demo (no toggle). Exercised through a real migrated PGlite DB.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));
// Admin metrics read external insight adapters — stub them to an available shape.
vi.mock("@/server/adapters/insights.posthog", () => ({
  fetchPosthogInsights: vi.fn(async () => ({ available: false, error: "no key" })),
}));
vi.mock("@/server/adapters/insights.sentry", () => ({
  fetchSentryInsights: vi.fn(async () => ({ available: false, error: "no key" })),
}));

import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  activityEvent,
  adminMetricSnapshot,
  condition,
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

function authUser(externalId: string): AuthUser {
  return {
    id: externalId,
    email: `${externalId}@example.com`,
    displayName: externalId,
    avatarUrl: null,
    hasCompletedOnboarding: true,
  };
}

async function seedUserWithWorkspace(externalId: string, wsName: string, isAdmin = false) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId, isAdmin })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

/** Insert a study (+ a runnable version) in a workspace; returns ids. */
async function seedStudy(opts: {
  tenantId: string;
  ownerId: string;
  title: string;
  isDemo?: boolean;
}) {
  const [exp] = await db
    .insert(experiment)
    .values({
      tenantId: opts.tenantId,
      ownerId: opts.ownerId,
      title: opts.title,
      isDemo: opts.isDemo ?? false,
    })
    .returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({
      experimentId: exp.id,
      versionNumber: 1,
      kind: "published",
      name: "v1",
      definitionSnapshot: { blocks: [] },
      moduleVersionLocks: [],
      createdBy: opts.ownerId,
    })
    .returning();
  await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
  return { exp, ver };
}

/** Set the workspace's demo toggle directly (mirrors workspace.setShowDemoContent). */
async function setShowDemo(workspaceId: string, show: boolean) {
  await db.update(workspace).set({ showDemoContent: show }).where(eq(workspace.id, workspaceId));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(adminMetricSnapshot);
  await db.delete(activityEvent);
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("demo toggle — researcher-facing studies list", () => {
  it("hides demo studies when OFF and shows them when ON", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Real Study" });
    await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Demo Study", isDemo: true });

    const caller = createCaller({ authUser: authUser("ext_a") });

    // Default OFF (show_demo_content defaults false) — only the real study.
    const off = await caller.studies.list();
    expect(off.map((s) => s.title)).toEqual(["Real Study"]);

    await setShowDemo(a.workspace.id, true);
    const on = await caller.studies.list();
    expect(on.map((s) => s.title).sort()).toEqual(["Demo Study", "Real Study"]);
  });
});

describe("demo toggle — workspace dashboard stats", () => {
  it("excludes demo studies from totalStudies when OFF, includes when ON", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Real" });
    await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Demo", isDemo: true });

    const caller = createCaller({ authUser: authUser("ext_a") });

    const off = await caller.workspace.dashboardStats();
    expect(off.totalStudies).toBe(1);

    await setShowDemo(a.workspace.id, true);
    const on = await caller.workspace.dashboardStats();
    expect(on.totalStudies).toBe(2);
  });
});

describe("demo toggle — me.recentStudies (cross-workspace)", () => {
  it("keeps a demo study only if ITS workspace shows demo content", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Real" });
    await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Demo", isDemo: true });

    const caller = createCaller({ authUser: authUser("ext_a") });

    const off = await caller.me.recentStudies({ limit: 10 });
    expect(off.map((s) => s.title)).toEqual(["Real"]);

    await setShowDemo(a.workspace.id, true);
    const on = await caller.me.recentStudies({ limit: 10 });
    expect(on.map((s) => s.title).sort()).toEqual(["Demo", "Real"]);
  });
});

describe("demo toggle — team.list", () => {
  it("hides demo members when OFF and shows them when ON", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const [maya] = await db
      .insert(user)
      .values({ externalId: "seed-maya", email: "maya@seed.local", displayName: "Maya" })
      .returning();
    await db
      .insert(member)
      .values({ workspaceId: a.workspace.id, userId: maya.id, role: "editor", status: "active", isDemo: true });

    const caller = createCaller({ authUser: authUser("ext_a") });

    const off = await caller.team.list();
    expect(off.map((m) => m.displayName).sort()).toEqual(["ext_a"]); // demo Maya hidden

    await setShowDemo(a.workspace.id, true);
    const on = await caller.team.list();
    expect(on.map((m) => m.displayName).sort()).toEqual(["Maya", "ext_a"]);
  });
});

describe("demo toggle — admin metrics ALWAYS exclude demo (no toggle)", () => {
  it("excludes demo studies + their responses regardless of the workspace toggle", async () => {
    const a = await seedUserWithWorkspace("boss", "Alpha", /* isAdmin */ true);
    const real = await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Real" });
    const demo = await seedStudy({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Demo", isDemo: true });

    // One completed run response on EACH study.
    for (const s of [real, demo]) {
      const recId = ulid();
      await db.insert(recruitmentSession).values({ id: recId, experimentVersionId: s.ver.id, status: "open" });
      const condId = ulid();
      await db
        .insert(condition)
        .values({ id: condId, experimentVersionId: s.ver.id, slug: "control", name: "Control", position: 0 });
      await db.insert(response).values({
        id: ulid(),
        recruitmentSessionId: recId,
        experimentVersionId: s.ver.id,
        conditionId: condId,
        mode: "run",
        status: "completed",
      });
    }

    const caller = createCaller({ authUser: authUser("boss") });

    // Toggle ON — admin metrics must STILL exclude demo (platform-health numbers).
    await setShowDemo(a.workspace.id, true);
    const m = await caller.admin.metrics();
    expect(m.research.studiesTotal).toBe(1); // demo study excluded
    expect(m.research.responsesTotal).toBe(1); // demo response excluded
    expect(m.research.runningStudies).toBe(1); // demo recruiting study excluded
    expect(m.research.stages).toEqual({ draft: 0, preregistered: 0, published: 1 });

    // overview.studies count also excludes demo.
    const o = await caller.admin.overview();
    expect(o.studies).toBe(1);
  });
});
