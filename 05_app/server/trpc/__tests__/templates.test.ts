import { eq } from "drizzle-orm";
import { ulid } from "ulid";
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
  activityEvent,
  comment,
  condition,
  experiment,
  experimentVersion,
  member,
  notification,
  studyPresence,
  user,
  workspace,
  workspaceTemplate,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(ext: string): AuthUser {
  return { id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true };
}

async function seedOwner(ext: string, wsName: string) {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  const [ws] = await db.insert(workspace).values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id }).returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

/** A study with one autosave version whose snapshot carries the given block keys. */
async function seedStudy(workspaceId: string, ownerId: string, blockKeys: string[], title = "Source") {
  const blocks = blockKeys.map((k, i) => ({
    instanceId: `b${i}`,
    source: "core",
    key: k,
    version: "1.0.0",
    config: { prompt: `${k}?`, required: false },
  }));
  const [exp] = await db
    .insert(experiment)
    .values({ tenantId: workspaceId, ownerId, title })
    .returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({
      experimentId: exp.id,
      versionNumber: 0,
      kind: "autosave",
      definitionSnapshot: { blocks },
      moduleVersionLocks: [],
      createdBy: ownerId,
    })
    .returning();
  await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
  return { studyId: exp.id, versionId: ver.id };
}

const eventsOfType = async (type: string) =>
  (await db.select().from(activityEvent)).filter((e) => e.type === type);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(comment);
  await db.delete(studyPresence);
  await db.delete(workspaceTemplate);
  await db.delete(condition);
  // Null every experiment->version FK (currentVersionId + fork lineage) before
  // dropping versions, else the fork_of_version_id FK blocks the delete.
  await db.update(experiment).set({ currentVersionId: null, forkOfVersionId: null, forkOfExperimentId: null });
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("templates.create", () => {
  it("freezes a named version + writes the row; later edits to the source don't change the template", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const { studyId, versionId } = await seedStudy(ws.id, u.id, ["free-text"]);
    const caller = createCaller({ authUser: authUser("hanna") });

    const { id } = await caller.templates.create({ studyId, name: "Trust interview", shareScope: "workspace", tags: ["misinfo"] });

    const [row] = await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, id));
    expect(row.name).toBe("Trust interview");
    expect(row.shareScope).toBe("workspace");
    // The template references a NEW frozen named version, not the autosave tip.
    expect(row.sourceVersionId).not.toBe(versionId);
    const [frozen] = await db.select().from(experimentVersion).where(eq(experimentVersion.id, row.sourceVersionId));
    expect(frozen.kind).toBe("named");

    // Edit the source study's working tip — the template must stay frozen.
    await db
      .update(experimentVersion)
      .set({ definitionSnapshot: { blocks: [{ instanceId: "b0", source: "core", key: "free-text", version: "1.0.0", config: {} }, { instanceId: "b1", source: "core", key: "likert-7", version: "1.0.0", config: {} }] } })
      .where(eq(experimentVersion.id, versionId));

    const got = await caller.templates.get({ templateId: id });
    expect(got.blocks.map((b) => b.key)).toEqual(["free-text"]); // unchanged

    expect((await eventsOfType("template_published")).length).toBe(1);
  });

  it("does not publish a private template; rejects a duplicate name", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const { studyId } = await seedStudy(ws.id, u.id, ["free-text"]);
    const caller = createCaller({ authUser: authUser("hanna") });

    await caller.templates.create({ studyId, name: "Dup", shareScope: "private" });
    expect((await eventsOfType("template_published")).length).toBe(0);

    await expect(caller.templates.create({ studyId, name: "Dup", shareScope: "private" })).rejects.toThrow(/already exists/i);
  });
});

describe("templates.useTemplate", () => {
  it("clones the frozen version into a new study + increments use_count + emits template_used", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const { studyId } = await seedStudy(ws.id, u.id, ["free-text", "likert-7"]);
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: templateId } = await caller.templates.create({ studyId, name: "Kit", shareScope: "private" });

    const before = (await db.select().from(experiment)).length;
    const { id: newStudyId } = await caller.templates.useTemplate({ templateId });

    expect((await db.select().from(experiment)).length).toBe(before + 1);
    const [newExp] = await db.select().from(experiment).where(eq(experiment.id, newStudyId));
    expect(newExp.tenantId).toBe(ws.id);
    expect(newExp.ownerId).toBe(u.id);
    // A template clone is a DUPLICATE, not a replication — no fork lineage, so the
    // Builder must NOT show a "Replicating X" banner (bug fix 2026-06-22).
    expect(newExp.forkOfExperimentId).toBeNull();
    expect(newExp.forkOfVersionId).toBeNull();
    const [newVer] = await db.select().from(experimentVersion).where(eq(experimentVersion.id, newExp.currentVersionId!));
    expect((newVer.definitionSnapshot as { blocks: { key: string }[] }).blocks.map((b) => b.key)).toEqual(["free-text", "likert-7"]);

    const [t] = await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, templateId));
    expect(t.useCount).toBe(1);
    expect((await eventsOfType("template_used")).length).toBe(1);
  });
});

describe("templates visibility (cross-workspace)", () => {
  it("private + workspace templates are invisible to another workspace; public is usable", async () => {
    const lab = await seedOwner("hanna", "Lab");
    const other = await seedOwner("omar", "OtherLab");
    const { studyId } = await seedStudy(lab.workspace.id, lab.user.id, ["free-text"]);
    const hanna = createCaller({ authUser: authUser("hanna") });
    const omar = createCaller({ authUser: authUser("omar") });

    const priv = await hanna.templates.create({ studyId, name: "Priv", shareScope: "private" });
    const wsScoped = await hanna.templates.create({ studyId, name: "WsOnly", shareScope: "workspace" });
    const pub = await hanna.templates.create({ studyId, name: "Pub", shareScope: "public" });

    const omarPublic = await omar.templates.list({ scope: "public" });
    const names = omarPublic.map((t) => t.name);
    expect(names).toContain("Pub");
    expect(names).not.toContain("Priv");
    expect(names).not.toContain("WsOnly");

    await expect(omar.templates.get({ templateId: priv.id })).rejects.toThrow();
    await expect(omar.templates.get({ templateId: wsScoped.id })).rejects.toThrow();
    await expect(omar.templates.get({ templateId: pub.id })).resolves.toMatchObject({ name: "Pub", isOwn: false });

    // Omar clones the public template into HIS workspace.
    const { id: omarStudy } = await omar.templates.useTemplate({ templateId: pub.id });
    const [omarExp] = await db.select().from(experiment).where(eq(experiment.id, omarStudy));
    expect(omarExp.tenantId).toBe(other.workspace.id);
  });
});

describe("misinformation starter (ADR-0079)", () => {
  it("a real researcher forks the seeded starter into their workspace", async () => {
    const { seedMisinfoStarter } = await import("@/server/db/seed-misinfo-starter");
    const { STARTER_MISINFO_TEMPLATE_ID } = await import("@/lib/system/starter");
    await seedMisinfoStarter();

    // A real (non-system) researcher in their own workspace.
    const lab = await seedOwner("hanna", "Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });

    // The starter is visible (starter=true) and listed under "starters".
    const starters = await hanna.templates.list({ scope: "starters" });
    expect(starters.map((t) => t.name)).toContain("Misinformation study");

    const { id: newStudyId } = await hanna.templates.useTemplate({
      templateId: STARTER_MISINFO_TEMPLATE_ID,
    });
    const [exp] = await db.select().from(experiment).where(eq(experiment.id, newStudyId));
    expect(exp.tenantId).toBe(lab.workspace.id); // landed in HER workspace
    expect(exp.forkOfExperimentId).toBeNull(); // a duplicate, not a replication

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, exp.currentVersionId!));
    const keys = (ver.definitionSnapshot as { blocks: { key: string }[] }).blocks.map((b) => b.key);
    expect(keys.filter((k) => k === "accuracy-confidence")).toHaveLength(2);
    expect(keys).toContain("share-intention");
  });
});

describe("deleting a template's source study", () => {
  it("succeeds and removes the template (FK cleanup — bug fix 2026-06-22)", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const { studyId } = await seedStudy(ws.id, u.id, ["free-text"]);
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: templateId } = await caller.templates.create({ studyId, name: "From-source", shareScope: "workspace" });

    // Before the fix, the workspace_template FK blocked this delete. Now the
    // template opt-in (deleteTemplates) removes it in one move (ADR-0083).
    await expect(
      caller.studies.deleteStudy({ studyId, confirmTitle: "Source", deleteTemplates: true }),
    ).resolves.toMatchObject({ templates: 1 });
    expect((await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, templateId)))).toHaveLength(0);
    expect((await db.select().from(experiment).where(eq(experiment.id, studyId)))).toHaveLength(0);
  });
});

describe("deleting a template CLONE that has legacy fork lineage", () => {
  it("succeeds (the clone was created before the duplicate fix and still carries forkOf*)", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const { studyId: sourceId } = await seedStudy(ws.id, u.id, ["free-text"], "ChitChat");
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: templateId } = await caller.templates.create({ studyId: sourceId, name: "ChitChat", shareScope: "workspace" });
    const [tpl] = await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, templateId));

    // Simulate a PRE-FIX clone: useTemplate used to set forkOf* to the source.
    const [clone] = await db
      .insert(experiment)
      .values({
        tenantId: ws.id,
        ownerId: u.id,
        title: "ChitChat",
        forkOfExperimentId: tpl.sourceExperimentId,
        forkOfVersionId: tpl.sourceVersionId,
      })
      .returning();
    const [cv] = await db
      .insert(experimentVersion)
      .values({ experimentId: clone.id, versionNumber: 0, kind: "autosave", definitionSnapshot: { blocks: [] }, moduleVersionLocks: [], createdBy: u.id })
      .returning();
    await db.update(experiment).set({ currentVersionId: cv.id }).where(eq(experiment.id, clone.id));
    // The actual blocker: a live-cooperation presence row (you're viewing it) +
    // a block-instance comment both FK-reference the study with no on-delete.
    await db.insert(studyPresence).values({ studyId: clone.id, userId: u.id, blockId: null });
    await db.insert(comment).values({ id: ulid(), workspaceId: ws.id, targetType: "block_instance", targetId: "b0", experimentId: clone.id, authorUserId: u.id, bodyMd: "note" });

    await expect(
      caller.studies.deleteStudy({ studyId: clone.id, confirmTitle: "ChitChat" }),
    ).resolves.toMatchObject({ versions: 1 });
    expect((await db.select().from(experiment).where(eq(experiment.id, clone.id)))).toHaveLength(0);
    // The source + its template are untouched by deleting the clone.
    expect((await db.select().from(experiment).where(eq(experiment.id, sourceId)))).toHaveLength(1);
  });
});

describe("templates.delete", () => {
  it("soft-deletes (hidden + get NOT_FOUND) but leaves cloned studies intact", async () => {
    const { workspace: ws, user: u } = await seedOwner("hanna", "Lab");
    const { studyId } = await seedStudy(ws.id, u.id, ["free-text"]);
    const caller = createCaller({ authUser: authUser("hanna") });
    const { id: templateId } = await caller.templates.create({ studyId, name: "Temp", shareScope: "workspace" });
    const { id: cloned } = await caller.templates.useTemplate({ templateId });

    await caller.templates.delete({ templateId });

    expect((await caller.templates.list({ scope: "workspace" })).map((t) => t.id)).not.toContain(templateId);
    await expect(caller.templates.get({ templateId })).rejects.toThrow();
    // The study cloned from it survives.
    const [stillThere] = await db.select().from(experiment).where(eq(experiment.id, cloned));
    expect(stillThere).toBeTruthy();
  });
});
