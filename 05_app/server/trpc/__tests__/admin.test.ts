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

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { experiment, member, user, workspace } from "@/server/db/schema";
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

  it("me.isAdmin reflects the gate", async () => {
    await seedUser("boss", true);
    await seedUser("hanna", false);
    expect(await createCaller({ authUser: authUser("boss") }).me.isAdmin()).toBe(true);
    expect(await createCaller({ authUser: authUser("hanna") }).me.isAdmin()).toBe(false);
  });
});
