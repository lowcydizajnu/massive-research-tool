import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ulid } from "ulid";

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
import { experiment, experimentVersion, follow, user, workspace, workspaceTemplate } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const anon = (): { authUser: AuthUser | null } => ({ authUser: null });

async function frozenStudy(opts: {
  tenantId: string;
  ownerId: string;
  title: string;
  forkableBy: "public" | "private" | "link-only";
}): Promise<string> {
  const [exp] = await db
    .insert(experiment)
    .values({ tenantId: opts.tenantId, ownerId: opts.ownerId, title: opts.title, forkableBy: opts.forkableBy })
    .returning();
  await db.insert(experimentVersion).values({
    experimentId: exp.id,
    versionNumber: 1,
    kind: "published",
    name: "v1",
    definitionSnapshot: { blocks: [] },
    moduleVersionLocks: {},
    createdBy: opts.ownerId,
  });
  return exp.id;
}

beforeEach(async () => {
  await db.delete(workspaceTemplate);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(follow);
  await db.delete(workspace);
  await db.delete(user);
});

describe("explore router (EE1.3, ADR-0076)", () => {
  it("featuredTemplates returns only starter + public (non-deleted)", async () => {
    const [u] = await db.insert(user).values({ externalId: "boss", email: "b@e.com", displayName: "Boss" }).returning();
    const [w] = await db.insert(workspace).values({ name: "W", slug: "w", ownerId: u.id }).returning();
    const src = await frozenStudy({ tenantId: w.id, ownerId: u.id, title: "Src", forkableBy: "private" });
    const [ver] = await db
      .select({ id: experimentVersion.id })
      .from(experimentVersion)
      .where(eq(experimentVersion.experimentId, src));
    const base = {
      workspaceId: w.id,
      sourceExperimentId: src,
      sourceVersionId: ver.id,
      createdByUserId: u.id,
    };
    await db.insert(workspaceTemplate).values([
      { id: ulid(), ...base, name: "Starter Public", shareScope: "public", starter: true, useCount: 5 },
      { id: ulid(), ...base, name: "Author Public", shareScope: "public", starter: false, useCount: 9 },
      { id: ulid(), ...base, name: "Starter Private", shareScope: "private", starter: true, useCount: 3 },
    ]);

    const rows = await createCaller(anon()).explore.featuredTemplates({ limit: 6 });
    expect(rows.map((r) => r.name)).toEqual(["Starter Public"]);
  });

  it("communityStudies returns only public studies that have a frozen version", async () => {
    const [u] = await db.insert(user).values({ externalId: "boss", email: "b@e.com", displayName: "Boss" }).returning();
    const [w] = await db.insert(workspace).values({ name: "W", slug: "w", ownerId: u.id }).returning();
    await frozenStudy({ tenantId: w.id, ownerId: u.id, title: "Public Frozen", forkableBy: "public" });
    await frozenStudy({ tenantId: w.id, ownerId: u.id, title: "Private Frozen", forkableBy: "private" });
    // Public but NO frozen version → not discoverable.
    await db.insert(experiment).values({ tenantId: w.id, ownerId: u.id, title: "Public Draft", forkableBy: "public" });

    const rows = await createCaller(anon()).explore.communityStudies({ limit: 9 });
    expect(rows.map((r) => r.title)).toEqual(["Public Frozen"]);
    expect(rows[0].authorName).toBe("Boss");
  });

  it("publicProfiles enriches with counts + affiliation and orders by followers (EE2)", async () => {
    const mk = async (h: string, opts: { pub: boolean; aff?: string; areas?: string[] }) =>
      (
        await db
          .insert(user)
          .values({
            externalId: h,
            email: `${h}@e.com`,
            displayName: h[0].toUpperCase() + h.slice(1),
            handle: h,
            publicProfileEnabled: opts.pub,
            affiliation: opts.aff ?? null,
            researchAreas: opts.areas ?? [],
          })
          .returning()
      )[0];

    const alice = await mk("alice", { pub: true, aff: "Uni A", areas: ["misinformation"] });
    const bob = await mk("bob", { pub: true, aff: "Uni B" });
    await mk("carol", { pub: false, aff: "Uni C" }); // profile disabled → excluded
    const dave = await mk("dave", { pub: true, aff: "Uni D" }); // enabled but no PUBLIC study → excluded
    const f1 = await mk("f1", { pub: false });
    const f2 = await mk("f2", { pub: false });

    const [w] = await db.insert(workspace).values({ name: "W", slug: "w", ownerId: alice.id }).returning();
    await frozenStudy({ tenantId: w.id, ownerId: alice.id, title: "A study", forkableBy: "public" });
    await frozenStudy({ tenantId: w.id, ownerId: bob.id, title: "B study", forkableBy: "public" });
    await frozenStudy({ tenantId: w.id, ownerId: dave.id, title: "D private", forkableBy: "private" });

    // bob has 2 followers, alice has 1 → bob sorts first.
    await db.insert(follow).values([
      { id: ulid(), userId: f1.id, targetType: "author", targetId: bob.id },
      { id: ulid(), userId: f2.id, targetType: "author", targetId: bob.id },
      { id: ulid(), userId: f1.id, targetType: "author", targetId: alice.id },
    ]);

    // limit 48 (> the old max of 24) exercises the /researchers directory page size —
    // an over-max input throws BAD_REQUEST, which crashed /researchers on prod.
    const rows = await createCaller(anon()).explore.publicProfiles({ limit: 48 });
    expect(rows.map((r) => r.handle)).toEqual(["bob", "alice"]); // ordered by followerCount desc
    const b = rows.find((r) => r.handle === "bob")!;
    expect(b.followerCount).toBe(2);
    expect(b.studyCount).toBe(1);
    expect(b.affiliation).toBe("Uni B");
    const a = rows.find((r) => r.handle === "alice")!;
    expect(a.followerCount).toBe(1);
    expect(a.studyCount).toBe(1);
    expect(a.researchAreas).toEqual(["misinformation"]);
  });
});
