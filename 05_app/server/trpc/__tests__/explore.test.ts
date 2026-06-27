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
import { experiment, experimentVersion, user, workspace, workspaceTemplate } from "@/server/db/schema";
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
});
