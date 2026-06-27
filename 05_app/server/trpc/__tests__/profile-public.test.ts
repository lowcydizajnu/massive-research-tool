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
import { experiment, experimentVersion, user, workspace } from "@/server/db/schema";
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
async function seedUser(ext: string): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  return u.id;
}

beforeEach(async () => {
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(workspace);
  await db.delete(user);
});

describe("public profile (EE2, ADR-0077)", () => {
  it("enabling the profile requires a handle, then persists", async () => {
    await seedUser("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.profile.updatePublic({ publicProfileEnabled: true })).rejects.toThrow(/handle/i);
    const res = await caller.profile.updatePublic({ handle: "Hanna Lab", publicProfileEnabled: true, bio: "Hi" });
    expect(res.handle).toBe("hanna-lab"); // normalized
    const own = await caller.profile.getPublic();
    expect(own).toMatchObject({ handle: "hanna-lab", publicProfileEnabled: true, bio: "Hi" });
  });

  it("rejects reserved + taken handles", async () => {
    await seedUser("hanna");
    await seedUser("mallory");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const mallory = createCaller({ authUser: authUser("mallory") });
    await expect(hanna.profile.updatePublic({ handle: "admin" })).rejects.toThrow(/reserved/i);
    await hanna.profile.updatePublic({ handle: "lab-one", publicProfileEnabled: true });
    await expect(mallory.profile.updatePublic({ handle: "lab-one" })).rejects.toThrow(/taken/i);
    expect(await mallory.profile.checkHandleAvailable({ handle: "lab-one" })).toMatchObject({ available: false });
    // The owner's own handle reads as available (so re-saving doesn't conflict).
    expect(await hanna.profile.checkHandleAvailable({ handle: "lab-one" })).toMatchObject({ available: true });
  });

  it("publicByHandle returns null when disabled, profile + public studies when enabled", async () => {
    const uid = await seedUser("hanna");
    const anon = createCaller({ authUser: null });
    const hanna = createCaller({ authUser: authUser("hanna") });

    await hanna.profile.updatePublic({ handle: "hanna-lab" }); // handle set but not enabled
    expect(await anon.profile.publicByHandle({ handle: "hanna-lab" })).toBeNull();

    await hanna.profile.updatePublic({ publicProfileEnabled: true });
    // A public, frozen study owned by Hanna (in her workspace).
    const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: uid }).returning();
    const [exp] = await db
      .insert(experiment)
      .values({ tenantId: ws.id, ownerId: uid, title: "Headlines study", forkableBy: "public" })
      .returning();
    await db.insert(experimentVersion).values({
      experimentId: exp.id,
      versionNumber: 1,
      kind: "published",
      name: "v1",
      definitionSnapshot: { blocks: [] },
      moduleVersionLocks: {},
      createdBy: uid,
    });

    const profile = await anon.profile.publicByHandle({ handle: "hanna-lab" });
    expect(profile).not.toBeNull();
    expect(profile!.displayName).toBe("hanna");
    expect(profile!.studies.map((s) => s.title)).toEqual(["Headlines study"]);
  });
});
