/**
 * tRPC router tests — workspace scoping + auth/workspace guards.
 *
 * The router is exercised through a directly-constructed caller (no HTTP) over
 * a real migrated PGlite DB. Deterministic, no network.
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

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { experiment, experimentVersion, member, user, workspace } from "@/server/db/schema";
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

async function seedUserWithWorkspace(externalId: string, wsName: string) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id })
    .returning();
  await db.insert(member).values({
    workspaceId: ws.id,
    userId: u.id,
    role: "owner",
    status: "active",
  });
  return { user: u, workspace: ws };
}

beforeEach(async () => {
  // Break the experiment <-> experiment_version circular FK before deleting.
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("studies.list", () => {
  it("returns only the caller's workspace studies (tenant scoping)", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const b = await seedUserWithWorkspace("ext_b", "Beta");
    await db
      .insert(experiment)
      .values({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Alpha Study" });
    await db
      .insert(experiment)
      .values({ tenantId: b.workspace.id, ownerId: b.user.id, title: "Beta Study" });

    const caller = createCaller({ authUser: authUser("ext_a") });
    const studies = await caller.studies.list();

    expect(studies).toHaveLength(1);
    expect(studies[0].title).toBe("Alpha Study");
    expect(studies[0].stage).toBe("draft");
    expect(studies[0].isOwner).toBe(true);
  });

  it("returns an empty list for a fresh workspace", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    expect(await caller.studies.list()).toEqual([]);
  });

  it("excludes archived studies by default and includes them under the archived filter", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await db.insert(experiment).values({
      tenantId: a.workspace.id,
      ownerId: a.user.id,
      title: "Archived Study",
      archivedAt: new Date(),
    });

    const caller = createCaller({ authUser: authUser("ext_a") });
    expect(await caller.studies.list()).toHaveLength(0);
    expect(await caller.studies.list({ filter: "archived" })).toHaveLength(1);
  });
});

describe("studies.create", () => {
  it("creates a blank draft in the caller's workspace and links its first version", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });

    const { id } = await caller.studies.create({ kind: "blank", title: "My Study" });

    const [row] = await db.select().from(experiment).where(eq(experiment.id, id));
    expect(row.title).toBe("My Study");
    expect(row.tenantId).toBe(a.workspace.id);
    expect(row.ownerId).toBe(a.user.id);
    expect(row.currentVersionId).not.toBeNull();

    // It now shows in the list as a draft.
    const studies = await caller.studies.list();
    expect(studies).toHaveLength(1);
    expect(studies[0]).toMatchObject({ id, stage: "draft", isOwner: true });
  });

  it("defaults the title when omitted", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank" });
    const [row] = await db.select().from(experiment).where(eq(experiment.id, id));
    expect(row.title).toBe("Untitled study");
  });

  it("rejects an unauthenticated caller", async () => {
    const caller = createCaller({ authUser: null });
    await expect(caller.studies.create({ kind: "blank" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("workspace.active", () => {
  it("returns the caller's owned workspace", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const ws = await caller.workspace.active();
    expect(ws).toMatchObject({ name: "Alpha", slug: "alpha" });
  });
});

describe("guards", () => {
  it("rejects an unauthenticated caller", async () => {
    const caller = createCaller({ authUser: null });
    await expect(caller.studies.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an authenticated user with no local record", async () => {
    const caller = createCaller({ authUser: authUser("ext_ghost") });
    await expect(caller.studies.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a user with no workspace", async () => {
    await db
      .insert(user)
      .values({ externalId: "ext_lonely", email: "ext_lonely@example.com", displayName: "L" });
    const caller = createCaller({ authUser: authUser("ext_lonely") });
    await expect(caller.studies.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
