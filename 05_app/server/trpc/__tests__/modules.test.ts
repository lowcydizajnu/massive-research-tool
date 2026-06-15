/**
 * modulesRouter tests (V1.13.0 Stream D enrichment) — modules.versions +
 * modules.usedIn, over a real migrated PGlite DB via a direct caller. The
 * usedIn query relies on jsonb containment (@>) over experiment snapshots.
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

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  experiment,
  experimentVersion,
  member,
  moduleTable,
  moduleVersion,
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

async function seedUserWithWorkspace(externalId: string, wsName: string) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.update(experiment).set({ currentVersionId: null, forkOfVersionId: null, forkOfExperimentId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(moduleVersion);
  await db.delete(moduleTable);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("modules.usedIn", () => {
  it("finds the workspace's studies whose snapshot contains the module, tenant-scoped", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_b", "Beta");
    const a = createCaller({ authUser: authUser("ext_a") });
    const b = createCaller({ authUser: authUser("ext_b") });

    const { id } = await a.studies.create({ kind: "blank", title: "Uses likert" });
    await a.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    // Beta has a study using the same block — must NOT appear for Alpha.
    const other = await b.studies.create({ kind: "blank", title: "Beta likert" });
    await b.studies.addBlock({ studyId: other.id, source: "core", key: "likert-7", version: "1.0.0" });

    const used = await a.modules.usedIn({ source: "core", key: "likert-7" });
    expect(used).toEqual([{ studyId: id, title: "Uses likert" }]);
  });

  it("returns empty for a module no study uses", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const a = createCaller({ authUser: authUser("ext_a") });
    const { id } = await a.studies.create({ kind: "blank", title: "S" });
    await a.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    expect(await a.modules.usedIn({ source: "core", key: "free-text" })).toEqual([]);
  });
});

describe("modules.versions", () => {
  it("returns every version (newest first) with current/breaking/deprecated flags", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const a = createCaller({ authUser: authUser("ext_a") });

    const [mod] = await db
      .insert(moduleTable)
      .values({ source: "core", key: "demo-mod", name: "Demo", description: "", categoryTags: [] })
      .returning();
    await db.insert(moduleVersion).values([
      {
        moduleId: mod.id,
        version: "1.0.0",
        name: "Demo v1",
        schema: {},
        defaultConfig: {},
        changelog: "initial",
        isBreaking: false,
        deprecatedAt: new Date(),
      },
      {
        moduleId: mod.id,
        version: "2.0.0",
        name: "Demo v2",
        schema: {},
        defaultConfig: {},
        changelog: "rewrite",
        isBreaking: true,
      },
    ]);

    const versions = await a.modules.versions({ source: "core", key: "demo-mod" });
    expect(versions.map((v) => v.version)).toEqual(["2.0.0", "1.0.0"]); // newest first
    const v1 = versions.find((v) => v.version === "1.0.0")!;
    const v2 = versions.find((v) => v.version === "2.0.0")!;
    expect(v1.deprecated).toBe(true);
    expect(v2.isBreaking).toBe(true);
    expect(v2.deprecated).toBe(false);
  });

  it("is empty for an unknown module", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const a = createCaller({ authUser: authUser("ext_a") });
    expect(await a.modules.versions({ source: "core", key: "nope" })).toEqual([]);
  });
});
