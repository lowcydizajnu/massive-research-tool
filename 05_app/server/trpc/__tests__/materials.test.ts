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
import { experiment, experimentVersion, member, user, workspace, workspaceMaterial } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const authUser = (ext: string): AuthUser => ({ id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true });

async function seedOwner(ext: string, wsName: string) {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

const uploadInput = (ws: string, over: Record<string, unknown> = {}) => ({
  key: `ws/${ws}/materials/${Math.abs(Math.sin(Object.keys(over).length + 1) * 1e9) | 0}.png`,
  kind: "image" as const,
  name: "Stimulus",
  mimeType: "image/png",
  sizeBytes: 1234,
  ...over,
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(workspaceMaterial);
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("materials.upload / list", () => {
  it("registers an asset in the workspace namespace and lists it", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });

    const { id } = await caller.materials.upload({ ...uploadInput(ws.id), name: "News headline", tags: ["misinfo"] });
    const rows = await caller.materials.list({});
    expect(rows.map((r) => r.id)).toContain(id);
    expect(rows[0].uploadedByName).toBe("hanna");
    expect(rows[0].kind).toBe("image");
  });

  it("rejects a key outside the caller's workspace namespace", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(
      caller.materials.upload({ ...uploadInput(ws.id), key: "ws/some-other-workspace/materials/x.png" }),
    ).rejects.toThrow(/this workspace/i);
  });

  it("filters by kind", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.materials.upload({ ...uploadInput(ws.id), key: `ws/${ws.id}/materials/a.png`, kind: "image" });
    await caller.materials.upload({ ...uploadInput(ws.id), key: `ws/${ws.id}/materials/b.mp3`, kind: "audio", name: "Clip", mimeType: "audio/mpeg" });
    expect((await caller.materials.list({ kind: "audio" })).map((r) => r.name)).toEqual(["Clip"]);
  });
});

describe("materials visibility + delete", () => {
  it("is workspace-scoped (another workspace can't see or get it)", async () => {
    const lab = await seedOwner("hanna", "Lab");
    await seedOwner("omar", "OtherLab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const omar = createCaller({ authUser: authUser("omar") });

    const { id } = await hanna.materials.upload(uploadInput(lab.workspace.id));
    expect(await omar.materials.list({})).toHaveLength(0);
    await expect(omar.materials.get({ materialId: id })).rejects.toThrow();
  });

  it("soft-deletes (hidden from list, get NOT_FOUND)", async () => {
    const { workspace: ws } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id } = await caller.materials.upload(uploadInput(ws.id));
    await caller.materials.delete({ materialId: id });
    expect(await caller.materials.list({})).toHaveLength(0);
    await expect(caller.materials.get({ materialId: id })).rejects.toThrow();
  });
});

describe("materials.usage", () => {
  it("reports studies whose current version references the material's R2 key", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const caller = createCaller({ authUser: authUser("hanna") });
    const key = `ws/${ws.id}/materials/stim.png`;
    const { id } = await caller.materials.upload({ ...uploadInput(ws.id), key });

    // A study whose snapshot embeds the key (as a block media field would).
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "Uses it" }).returning();
    const [ver] = await db
      .insert(experimentVersion)
      .values({
        experimentId: exp.id,
        versionNumber: 0,
        kind: "autosave",
        definitionSnapshot: { blocks: [{ instanceId: "b1", source: "core", key: "image-stimulus", version: "1.0.0", config: { mediaKey: key } }] },
        moduleVersionLocks: [],
        createdBy: u.id,
      })
      .returning();
    await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));

    const usage = await caller.materials.usage({ materialId: id });
    expect(usage.map((s) => s.title)).toEqual(["Uses it"]);
  });
});
