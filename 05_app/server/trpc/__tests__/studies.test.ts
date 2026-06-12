/**
 * tRPC router tests — workspace scoping + auth/workspace guards.
 *
 * The router is exercised through a directly-constructed caller (no HTTP) over
 * a real migrated PGlite DB. Deterministic, no network.
 */
import { and, eq } from "drizzle-orm";
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

// Background-job enqueue is mocked so preregister doesn't reach Inngest.
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));

import { ulid } from "ulid";

import type { AuthUser } from "@/server/adapters/auth";
import { jobs } from "@/server/adapters/jobs";
import { db } from "@/server/db/client";
import {
  activityEvent,
  condition,
  experiment,
  experimentVersion,
  member,
  notification,
  recruitmentSession,
  registry,
  registryConnection,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";
import {
  recordAnswer,
  resolveOpenRecruitment,
  startResponse,
} from "@/server/runtime/participant";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);
const enqueue = vi.mocked(jobs.enqueue);

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
  vi.clearAllMocks();
  // Break the experiment <-> experiment_version circular FKs (current tip +
  // fork lineage) before deleting versions.
  await db
    .update(experiment)
    .set({ currentVersionId: null, forkOfVersionId: null, forkOfExperimentId: null });
  // Event tables FK to workspace/user — clear them before their parents.
  await db.delete(notification);
  await db.delete(activityEvent);
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(registryConnection);
  await db.delete(registry);
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

  it("creates a study from a framework with its starter blocks copied in", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });

    const frameworks = await caller.frameworks.list();
    expect(frameworks.length).toBeGreaterThan(0);
    const misinfo = frameworks.find((f) => f.key === "misinformation")!;
    expect(misinfo.blockCount).toBe(2);

    const { id } = await caller.studies.create({
      kind: "framework",
      frameworkKey: "misinformation",
    });
    const detail = await caller.studies.get({ id });
    expect(detail.blocks).toHaveLength(2);
    expect(detail.blocks.map((b) => b.key).sort()).toEqual(["likert-7", "social-post"]);
    // Each block has a fresh ULID instanceId (not shared with the framework def).
    expect(new Set(detail.blocks.map((b) => b.instanceId)).size).toBe(2);
    // The pre-worded manipulation check arrives complete; the stimulus needs setup.
    const likert = detail.blocks.find((b) => b.key === "likert-7")!;
    expect(likert.complete).toBe(true);
  });

  it("rejects an unknown framework", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    await expect(
      caller.studies.create({ kind: "framework", frameworkKey: "nope" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("studies.get", () => {
  it("returns a study in the caller's workspace", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Source cues" });

    const detail = await caller.studies.get({ id });
    expect(detail).toMatchObject({
      id,
      title: "Source cues",
      stage: "draft",
      versionNumber: 0, // autosave is the unnumbered Draft (ADR-0012 amendment)
      ownerName: "ext_a",
      blocks: [],
    });
  });

  it("is NOT_FOUND for a study in another workspace (tenant scoping)", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_b", "Beta");
    const [other] = await db
      .insert(experiment)
      .values({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Alpha only" })
      .returning();

    const callerB = createCaller({ authUser: authUser("ext_b") });
    await expect(callerB.studies.get({ id: other.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("studies.updateTitle", () => {
  it("renames a study in the caller's workspace", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Old" });

    const res = await caller.studies.updateTitle({ id, title: "New title" });
    expect(res).toEqual({ id, title: "New title" });

    const [row] = await db.select().from(experiment).where(eq(experiment.id, id));
    expect(row.title).toBe("New title");
  });

  it("is NOT_FOUND for a study in another workspace", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_b", "Beta");
    const [other] = await db
      .insert(experiment)
      .values({ tenantId: a.workspace.id, ownerId: a.user.id, title: "Alpha only" })
      .returning();
    const callerB = createCaller({ authUser: authUser("ext_b") });
    await expect(
      callerB.studies.updateTitle({ id: other.id, title: "hijack" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("studies block editing", () => {
  it("adds, configures (validity flips complete), and removes a block", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    const { instanceId } = await caller.studies.addBlock({
      studyId: id,
      source: "core",
      key: "social-post",
      version: "1.0.0",
    });
    let detail = await caller.studies.get({ id });
    expect(detail.blocks).toHaveLength(1);
    expect(detail.blocks[0]).toMatchObject({
      instanceId,
      name: "Social post",
      ref: "core/social-post@1.0.0",
      complete: false, // headline empty
    });

    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId,
      config: { headline: "Breaking", body: "", source: "", imageUrl: "", shareCountVisible: false },
    });
    detail = await caller.studies.get({ id });
    expect(detail.blocks[0].complete).toBe(true);
    expect(detail.blocks[0].config.headline).toBe("Breaking");

    await caller.studies.removeBlock({ studyId: id, instanceId });
    detail = await caller.studies.get({ id });
    expect(detail.blocks).toHaveLength(0);
  });

  it("rejects an unknown module", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank" });
    await expect(
      caller.studies.addBlock({ studyId: id, source: "core", key: "nope", version: "1.0.0" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects block config that fails the module schema", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank" });
    const { instanceId } = await caller.studies.addBlock({
      studyId: id,
      source: "core",
      key: "likert-7",
      version: "1.0.0",
    });
    await expect(
      caller.studies.updateBlockConfig({
        studyId: id,
        instanceId,
        config: { prompt: "Q", leftAnchor: "a", rightAnchor: "b", required: "yes" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("studies.saveAsNamed", () => {
  it("snapshots the working tip into a named version and leaves the autosave", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "social-post", version: "1.0.0" });

    const res = await caller.studies.saveAsNamed({ studyId: id, name: "v1 for review" });
    expect(res).toMatchObject({ name: "v1 for review" });
    // First conscious save on a fresh study is v1 (autosave is the unnumbered Draft).
    expect(res.versionNumber).toBe(1);

    // The working tip (autosave) is still what studies.get reads, with its block.
    const detail = await caller.studies.get({ id });
    expect(detail.stage).toBe("draft");
    expect(detail.blocks).toHaveLength(1);
  });

  it("rejects a duplicate label within the study", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank" });
    await caller.studies.saveAsNamed({ studyId: id, name: "v1" });
    await expect(
      caller.studies.saveAsNamed({ studyId: id, name: "v1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("studies.preregister", () => {
  it("freezes a preregistered version and parks as no_credentials with no push when disconnected", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "social-post", version: "1.0.0" });

    const res = await caller.studies.preregister({ studyId: id });
    expect(res.pushStatus).toBe("no_credentials");

    const [pre] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.kind, "preregistered"));
    expect(pre.experimentId).toBe(id);
    expect(pre.registryPushStatus).toBe("no_credentials");
    // Scoped to registry.push — preregister also enqueues notification.fanout (emit).
    expect(enqueue.mock.calls.filter((c) => c[0] === "registry.push")).toHaveLength(0);

    // The working tip is still the editable autosave (block intact), but the
    // study's reported stage is now its FURTHEST milestone: preregistered.
    const detail = await caller.studies.get({ id });
    expect(detail.stage).toBe("preregistered");
    expect(detail.blocks).toHaveLength(1);
  });

  it("enqueues the OSF push and marks pending when the researcher is connected", async () => {
    const { user: u } = await seedUserWithWorkspace("ext_a", "Alpha");
    // Seed an active OSF connection for this user.
    const registryId = ulid();
    await db.insert(registry).values({ id: registryId, key: "osf", name: "OSF", oauthConfig: {}, pushConfig: {} });
    await db
      .insert(registryConnection)
      .values({ id: ulid(), userId: u.id, registryId, accessToken: "enc:tok", scopes: ["osf.full_write"] });

    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    const res = await caller.studies.preregister({ studyId: id });
    expect(res.pushStatus).toBe("pending");

    const [pre] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.kind, "preregistered"));
    expect(pre.registryPushStatus).toBe("pending");

    expect(enqueue.mock.calls.filter((c) => c[0] === "registry.push")).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledWith("registry.push", {
      experimentVersionId: pre.id,
      registryKey: "osf",
      userId: u.id,
      isAmendment: false,
    });
  });

  it("getPreregistration returns null before, then the latest status after", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    expect(await caller.studies.getPreregistration({ studyId: id })).toBeNull();

    await caller.studies.preregister({ studyId: id });
    const status = await caller.studies.getPreregistration({ studyId: id });
    expect(status).toMatchObject({
      versionNumber: expect.any(Number),
      name: expect.stringContaining("Preregistration"),
      pushStatus: "no_credentials",
      url: null,
      doi: null,
    });
  });

  it("retryPush re-enqueues the same frozen version once connected", async () => {
    const { user: u } = await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    // Preregister while disconnected → parks as no_credentials, no enqueue.
    await caller.studies.preregister({ studyId: id });
    // Scoped to registry.push — preregister also enqueues notification.fanout (emit).
    expect(enqueue.mock.calls.filter((c) => c[0] === "registry.push")).toHaveLength(0);
    const [pre] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.kind, "preregistered"));

    // Now connect, then retry — re-pushes the SAME version, no new version.
    // The 'osf' registry row already exists (preregister's getConnection
    // ensured it), so reuse it rather than insert a duplicate.
    const [reg] = await db.select({ id: registry.id }).from(registry).where(eq(registry.key, "osf")).limit(1);
    await db
      .insert(registryConnection)
      .values({ id: ulid(), userId: u.id, registryId: reg.id, accessToken: "enc:tok", scopes: ["osf.full_write"] });

    const res = await caller.studies.retryPush({ studyId: id });
    expect(res.pushStatus).toBe("pending");
    expect(enqueue.mock.calls.filter((c) => c[0] === "registry.push")).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledWith("registry.push", {
      experimentVersionId: pre.id,
      registryKey: "osf",
      userId: u.id,
      isAmendment: false,
    });

    const all = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "preregistered"));
    expect(all).toHaveLength(1); // no new version created
    expect(all[0].registryPushStatus).toBe("pending");
  });

  it("lists a preregistered study under the Preregistered filter, not Drafts", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });

    const prereg = await caller.studies.list({ filter: "preregistered" });
    expect(prereg.map((s) => s.id)).toContain(id);
    expect(prereg.find((s) => s.id === id)?.stage).toBe("preregistered");

    // The working tip is still an editable autosave, but the study has left Drafts.
    const drafts = await caller.studies.list({ filter: "drafts" });
    expect(drafts.map((s) => s.id)).not.toContain(id);
  });

  it("retryPush errors when there is no preregistration yet", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await expect(caller.studies.retryPush({ studyId: id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("requires write permission (a viewer cannot preregister)", async () => {
    const owner = await seedUserWithWorkspace("ext_owner", "Alpha");
    const [viewer] = await db
      .insert(user)
      .values({ externalId: "ext_v", email: "ext_v@example.com", displayName: "V" })
      .returning();
    await db.insert(member).values({
      workspaceId: owner.workspace.id,
      userId: viewer.id,
      role: "viewer",
      status: "active",
    });
    const ownerCaller = createCaller({ authUser: authUser("ext_owner") });
    const { id } = await ownerCaller.studies.create({ kind: "blank", title: "S" });

    const viewerCaller = createCaller({ authUser: authUser("ext_v") });
    await expect(viewerCaller.studies.preregister({ studyId: id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("studies.getRunInfo + openRecruitment", () => {
  it("reports not-preregistered, then preregistered-without-recruitment, then recruiting", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    expect(await caller.studies.getRunInfo({ studyId: id })).toEqual({
      runnable: false,
      versionKind: null,
      recruitment: null,
    });

    await caller.studies.preregister({ studyId: id });
    expect(await caller.studies.getRunInfo({ studyId: id })).toEqual({
      runnable: true,
      versionKind: "preregistered",
      recruitment: null,
    });

    await caller.studies.openRecruitment({ studyId: id });
    expect(await caller.studies.getRunInfo({ studyId: id })).toEqual({
      runnable: true,
      versionKind: "preregistered",
      recruitment: { status: "open", currentN: 0 },
    });
  });

  it("openRecruitment refuses a study that is neither preregistered nor published", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await expect(caller.studies.openRecruitment({ studyId: id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("publish makes a study runnable (no OSF) — runnable via the published version", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addCondition({ studyId: id, name: "Treatment" });

    await caller.studies.publish({ studyId: id });
    const info = await caller.studies.getRunInfo({ studyId: id });
    expect(info).toMatchObject({ runnable: true, versionKind: "published" });

    // No OSF push happened (publish doesn't preregister).
    // Scoped to registry.push — preregister also enqueues notification.fanout (emit).
    expect(enqueue.mock.calls.filter((c) => c[0] === "registry.push")).toHaveLength(0);

    // The published version froze the conditions, and recruitment can open on it.
    const [pub] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.kind, "published"));
    const copied = await db.select().from(condition).where(eq(condition.experimentVersionId, pub.id));
    expect(copied.map((c) => c.slug)).toEqual(["treatment"]);
    await caller.studies.openRecruitment({ studyId: id });
    expect((await caller.studies.getRunInfo({ studyId: id })).recruitment?.status).toBe("open");
  });

  it("openRecruitment is idempotent (one open session)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const info = await caller.studies.getRunInfo({ studyId: id });
    expect(info.recruitment?.status).toBe("open");
  });
});

describe("studies.conditions (builder-conditions.md)", () => {
  async function studyWithBlock() {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    return { caller, id };
  }

  it("adds conditions with auto, unique slugs and lists them in order", async () => {
    const { caller, id } = await studyWithBlock();
    const c1 = await caller.studies.addCondition({ studyId: id, name: "Control group" });
    const c2 = await caller.studies.addCondition({ studyId: id, name: "Control group" });
    expect(c1.slug).toBe("control-group");
    expect(c2.slug).toBe("control-group-2");
    const list = await caller.studies.listConditions({ studyId: id });
    expect(list.map((c) => c.slug)).toEqual(["control-group", "control-group-2"]);
    expect(list[0].allocationWeight).toBe(1);
  });

  it("updates weight + name, and locks the slug once a block references it", async () => {
    const { caller, id } = await studyWithBlock();
    const c = await caller.studies.addCondition({ studyId: id, name: "Treatment" });
    const updated = await caller.studies.updateCondition({
      studyId: id,
      conditionId: c.id,
      name: "Treatment A",
      allocationWeight: 3,
    });
    expect(updated).toMatchObject({ name: "Treatment A", allocationWeight: 3, slug: "treatment" });

    // Slug is free to change while unreferenced…
    const reslug = await caller.studies.updateCondition({ studyId: id, conditionId: c.id, slug: "treat-a" });
    expect(reslug.slug).toBe("treat-a");

    // …but locks once a block shows only to it.
    const [blk] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    const instanceId = (blk.definitionSnapshot as { blocks: { instanceId: string }[] }).blocks[0].instanceId;
    await caller.studies.setBlockVisibility({ studyId: id, instanceId, showIfCondition: ["treat-a"] });
    await expect(
      caller.studies.updateCondition({ studyId: id, conditionId: c.id, slug: "treat-b" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("setBlockVisibility validates slugs and clears on empty", async () => {
    const { caller, id } = await studyWithBlock();
    await caller.studies.addCondition({ studyId: id, name: "Control" });
    const [blk] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    const instanceId = (blk.definitionSnapshot as { blocks: { instanceId: string }[] }).blocks[0].instanceId;

    await expect(
      caller.studies.setBlockVisibility({ studyId: id, instanceId, showIfCondition: ["ghost"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await caller.studies.setBlockVisibility({ studyId: id, instanceId, showIfCondition: ["control"] });
    let detail = await caller.studies.get({ id });
    // The block now carries visibility in the snapshot.
    const [v1] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    expect((v1.definitionSnapshot as { blocks: { visibility?: unknown }[] }).blocks[0].visibility).toEqual({
      showIfCondition: ["control"],
    });

    await caller.studies.setBlockVisibility({ studyId: id, instanceId, showIfCondition: [] });
    const [v2] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    expect((v2.definitionSnapshot as { blocks: { visibility?: unknown }[] }).blocks[0].visibility).toBeUndefined();
    expect(detail.id).toBe(id); // sanity
  });

  it("removeCondition deletes it and strips it from block visibility", async () => {
    const { caller, id } = await studyWithBlock();
    const c = await caller.studies.addCondition({ studyId: id, name: "Control" });
    const [blk] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    const instanceId = (blk.definitionSnapshot as { blocks: { instanceId: string }[] }).blocks[0].instanceId;
    await caller.studies.setBlockVisibility({ studyId: id, instanceId, showIfCondition: ["control"] });

    await caller.studies.removeCondition({ studyId: id, conditionId: c.id });
    expect(await caller.studies.listConditions({ studyId: id })).toHaveLength(0);
    const [v] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    expect((v.definitionSnapshot as { blocks: { visibility?: unknown }[] }).blocks[0].visibility).toBeUndefined();
  });

  it("preregister copies the working-tip conditions onto the immutable version", async () => {
    const { caller, id } = await studyWithBlock();
    await caller.studies.addCondition({ studyId: id, name: "Control" });
    await caller.studies.addCondition({ studyId: id, name: "Treatment" });
    await caller.studies.preregister({ studyId: id });

    const [pre] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.kind, "preregistered"));
    const copied = await db.select().from(condition).where(eq(condition.experimentVersionId, pre.id));
    expect(copied.map((c) => c.slug).sort()).toEqual(["control", "treatment"]);
  });
});

describe("studies.getResults (end-to-end)", () => {
  it("aggregates a completed run: per-condition count + likert mean + a CSV row", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });

    // A participant completes (single likert question, answer 6).
    const open = await resolveOpenRecruitment(id);
    const started = await startResponse({
      recruitmentSessionId: open!.recruitmentSessionId,
      mode: "run",
      externalPid: "P1",
    });
    const responseId = (started as { responseId: string }).responseId;
    const done = await recordAnswer({ responseId, questionIndex: 0, answer: { value: 6 } });
    expect(done).toMatchObject({ ok: true, done: true });

    const results = await caller.studies.getResults({ studyId: id });
    expect(results).not.toBeNull();
    expect(results!.totalCompleted).toBe(1);
    expect(results!.conditions).toEqual([{ slug: "control", name: "Control", completed: 1 }]);
    expect(results!.questions).toHaveLength(1);
    expect(results!.questions[0]).toMatchObject({ moduleKey: "likert-7", n: 1, mean: 6 });
    expect(results!.rows).toHaveLength(1);
    expect(results!.rows[0]).toMatchObject({ conditionSlug: "control", externalPid: "P1" });
  });

  it("returns null when the study isn't preregistered", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    expect(await caller.studies.getResults({ studyId: id })).toBeNull();
  });

  it("summarizes a multiple-choice question as per-option counts + a stringified CSV cell", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const { instanceId } = await caller.studies.addBlock({
      studyId: id,
      source: "core",
      key: "multiple-choice",
      version: "1.0.0",
    });
    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId,
      config: { prompt: "Pick", options: ["A", "B"], multiple: false, required: true, randomizeOrder: false },
    });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });

    const open = await resolveOpenRecruitment(id);
    const started = await startResponse({
      recruitmentSessionId: open!.recruitmentSessionId,
      mode: "run",
      externalPid: null,
    });
    const responseId = (started as { responseId: string }).responseId;
    await recordAnswer({ responseId, questionIndex: 0, answer: { selected: ["B"] } });

    const results = await caller.studies.getResults({ studyId: id });
    const q = results!.questions[0];
    expect(q).toMatchObject({ moduleKey: "multiple-choice", kind: "categorical", n: 1, mean: null });
    expect(q.optionCounts).toEqual([{ value: "B", count: 1 }]);
    expect(results!.rows[0].answers[instanceId]).toBe("B");
  });
});

describe("role enforcement", () => {
  it("lets a viewer read but blocks writes (FORBIDDEN)", async () => {
    const owner = await seedUserWithWorkspace("ext_owner", "Alpha");
    const [viewer] = await db
      .insert(user)
      .values({ externalId: "ext_viewer", email: "ext_viewer@example.com", displayName: "V" })
      .returning();
    await db.insert(member).values({
      workspaceId: owner.workspace.id,
      userId: viewer.id,
      role: "viewer",
      status: "active",
    });
    await db
      .insert(experiment)
      .values({ tenantId: owner.workspace.id, ownerId: owner.user.id, title: "S" });

    const caller = createCaller({ authUser: authUser("ext_viewer") });

    // Reads are allowed for any member.
    expect(await caller.studies.list()).toHaveLength(1);

    // Writes are blocked for viewers.
    await expect(caller.studies.create({ kind: "blank" })).rejects.toMatchObject({
      code: "FORBIDDEN",
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

describe("studies.setTags (ADR-0017)", () => {
  it("normalizes + dedupes tags, exposes them on get, and emits tagSlugs on preregister", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    const res = await caller.studies.setTags({
      studyId: id,
      tags: ["Misinformation Research!", "misinformation-research", "  Source Cues  "],
    });
    // Slugged, deduped (the first two collapse to one slug).
    expect(res.tags).toEqual(["misinformation-research", "source-cues"]);
    expect((await caller.studies.get({ id })).tags).toEqual([
      "misinformation-research",
      "source-cues",
    ]);

    // Preregister copies the study's tags onto the activity_event (Follows source).
    await caller.studies.preregister({ studyId: id });
    const [ev] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.type, "preregister_complete"));
    expect(ev.relatedTagSlugs).toEqual(["misinformation-research", "source-cues"]);
  });
});

describe("studies.fork + getReplications (ADR-0018)", () => {
  it("same-workspace fork copies blocks (instanceIds preserved); getReplications shows the diff", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id: src } = await caller.studies.create({ kind: "blank", title: "Source" });
    const b = await caller.studies.addBlock({
      studyId: src,
      source: "core",
      key: "likert-7",
      version: "1.0.0",
    });

    const { id: fork } = await caller.studies.fork({ studyId: src });
    const forkDetail = await caller.studies.get({ id: fork });
    expect(forkDetail.isReplication).toBe(true);
    expect(forkDetail.blocks.map((x) => x.instanceId)).toEqual([b.instanceId]); // preserved

    const reps = await caller.studies.getReplications({ studyId: src });
    expect(reps.children).toHaveLength(1);
    expect(reps.children[0]).toMatchObject({ studyId: fork, canSeeDetail: true });
    expect(reps.children[0].diff).toMatchObject({ unchangedCount: 1, changed: [], added: [], removed: [] });

    // The fork's view shows its parent.
    const forkReps = await caller.studies.getReplications({ studyId: fork });
    expect(forkReps.parent?.studyId).toBe(src);
  });

  it("cross-workspace fork: FORBIDDEN when private, allowed + emits fork when public (diff withheld)", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const beta = await seedUserWithWorkspace("ext_s", "Beta");
    const hanna = createCaller({ authUser: authUser("ext_a") });
    const sofia = createCaller({ authUser: authUser("ext_s") });
    const { id: src } = await hanna.studies.create({ kind: "blank", title: "Public source" });

    await expect(sofia.studies.fork({ studyId: src })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await hanna.studies.setForkable({ studyId: src, forkableBy: "public" });
    const { id: fork } = await sofia.studies.fork({ studyId: src });
    const [exp] = await db.select().from(experiment).where(eq(experiment.id, fork));
    expect(exp.tenantId).toBe(beta.workspace.id); // lands in Sofia's workspace
    expect(exp.forkOfExperimentId).toBe(src);

    const events = await db.select().from(activityEvent).where(eq(activityEvent.type, "fork"));
    expect(events).toHaveLength(1);
    expect(events[0].relatedStudyId).toBe(src);
    expect(events[0].relatedAuthorUserId).toBe(a.user.id); // notifies Hanna

    // Hanna sees the replication counted, but its diff is withheld (private + other workspace).
    const reps = await hanna.studies.getReplications({ studyId: src });
    expect(reps.children).toHaveLength(1);
    expect(reps.children[0]).toMatchObject({ studyId: fork, canSeeDetail: false, diff: null });
  });
});

describe("studies.saveAndRequestReview (ADR-0015 review_request)", () => {
  it("creates a named version + emits review_request to an active member", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_a", "Alpha");
    // A second member to review.
    const [maya] = await db
      .insert(user)
      .values({ externalId: "ext_m", email: "m@example.com", displayName: "Maya" })
      .returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: maya.id, role: "editor", status: "active" });

    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    await caller.studies.saveAndRequestReview({ studyId: id, name: "v1 for review", reviewerUserId: maya.id });

    const events = await db.select().from(activityEvent).where(eq(activityEvent.type, "review_request"));
    expect(events).toHaveLength(1);
    expect((events[0].payload as Record<string, unknown>).reviewerUserId).toBe(maya.id);
    // The named version exists.
    const named = await db
      .select()
      .from(experimentVersion)
      .where(and(eq(experimentVersion.experimentId, id), eq(experimentVersion.kind, "named")));
    expect(named).toHaveLength(1);
  });

  it("rejects a reviewer who isn't a workspace member", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const outsider = await seedUserWithWorkspace("ext_o", "Other");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await expect(
      caller.studies.saveAndRequestReview({ studyId: id, name: "v1", reviewerUserId: outsider.user.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("versionNumber semantics (ADR-0012 amendment 2026-06-04)", () => {
  it("autosave is Draft (0); conscious saves count 1, 2, … and autosaves never bump", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    // Fresh study: the autosave tip is the unnumbered Draft.
    expect((await caller.studies.get({ id })).versionNumber).toBe(0);

    // An autosave edit (rename) must NOT create a numbered version.
    await caller.studies.updateTitle({ id, title: "S2" });
    expect((await caller.studies.get({ id })).versionNumber).toBe(0);

    // First conscious save → v1.
    const named = await caller.studies.saveAsNamed({ studyId: id, name: "Pilot" });
    expect(named.versionNumber).toBe(1);

    // Next conscious save (publish) → v2 — counts conscious kinds, not max+1.
    const published = await caller.studies.publish({ studyId: id });
    expect(published.versionNumber).toBe(2);
  });
});

describe("studies.listVersions (V1.7.1 item 3)", () => {
  it("returns the Draft + each conscious version, oldest→newest, with working-copy / latest-saved flags", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });

    let versions = await caller.studies.listVersions({ studyId: id });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      kind: "autosave",
      versionNumber: 0,
      isWorkingCopy: true,
      hasUnsavedChanges: false,
    });

    await caller.studies.saveAsNamed({ studyId: id, name: "Pilot" });
    versions = await caller.studies.listVersions({ studyId: id });
    expect(versions.map((v) => v.kind)).toEqual(["autosave", "named"]);
    expect(versions[1]).toMatchObject({ kind: "named", versionNumber: 1, name: "Pilot" });
    // The autosave tip is the working copy; the named snapshot is the latest saved.
    // Right after saving, the working copy matches it → no unsaved changes.
    expect(versions[0]).toMatchObject({ isWorkingCopy: true, hasUnsavedChanges: false });
    expect(versions[1]).toMatchObject({ isWorkingCopy: false, isLatestSaved: true });

    // Edit the working copy → it now diverges from the latest saved snapshot.
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    versions = await caller.studies.listVersions({ studyId: id });
    expect(versions[0]).toMatchObject({ isWorkingCopy: true, hasUnsavedChanges: true });
  });
});

describe("studies.getVersion + restoreVersion (ADR-0019)", () => {
  it("previews a frozen version's blocks read-only", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "Pilot" });

    const versions = await caller.studies.listVersions({ studyId: id });
    const named = versions.find((v) => v.kind === "named")!;
    const preview = await caller.studies.getVersion({ studyId: id, versionId: named.id });
    expect(preview.kind).toBe("named");
    expect(preview.blocks.map((b) => b.ref)).toEqual(["core/likert-7@1.0.0"]);
  });

  it("restores a frozen version's blocks into the working copy without mutating the frozen version", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const added = await caller.studies.addBlock({
      studyId: id,
      source: "core",
      key: "likert-7",
      version: "1.0.0",
    });
    await caller.studies.saveAsNamed({ studyId: id, name: "Pilot" });
    const named = (await caller.studies.listVersions({ studyId: id })).find((v) => v.kind === "named")!;

    // Diverge the working copy: remove the block.
    await caller.studies.removeBlock({ studyId: id, instanceId: added.instanceId });
    expect((await caller.studies.get({ id })).blocks).toHaveLength(0);

    // Restore the named version → the block comes back to the working copy.
    const result = await caller.studies.restoreVersion({ studyId: id, versionId: named.id });
    expect(result).toMatchObject({ restoredFromNumber: 1, restoredFromKind: "named", blockCount: 1 });
    expect((await caller.studies.get({ id })).blocks.map((b) => b.ref)).toEqual(["core/likert-7@1.0.0"]);

    // The frozen version still has its original (single) block — unmutated.
    const stillFrozen = await caller.studies.getVersion({ studyId: id, versionId: named.id });
    expect(stillFrozen.blocks.map((b) => b.ref)).toEqual(["core/likert-7@1.0.0"]);
  });

  it("refuses to restore the working copy onto itself", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const autosave = (await caller.studies.listVersions({ studyId: id }))[0];
    await expect(
      caller.studies.restoreVersion({ studyId: id, versionId: autosave.id }),
    ).rejects.toThrow(/already the working copy/);
  });

  it("is tenant-scoped — another workspace's version is NOT_FOUND", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_b", "Bravo");
    const a = createCaller({ authUser: authUser("ext_a") });
    const b = createCaller({ authUser: authUser("ext_b") });
    const { id } = await a.studies.create({ kind: "blank", title: "S" });
    const ver = (await a.studies.listVersions({ studyId: id }))[0];
    await expect(b.studies.getVersion({ studyId: id, versionId: ver.id })).rejects.toThrow();
    await expect(b.studies.restoreVersion({ studyId: id, versionId: ver.id })).rejects.toThrow();
  });
});

describe("studies.browsePublic + browseTags (V1.8 Stream B, ADR-0018)", () => {
  async function makePublic(
    caller: ReturnType<typeof createCaller>,
    title: string,
    tags: string[] = [],
  ): Promise<string> {
    const { id } = await caller.studies.create({ kind: "blank", title });
    await caller.studies.publish({ studyId: id });
    await caller.studies.setForkable({ studyId: id, forkableBy: "public" });
    if (tags.length) await caller.studies.setTags({ studyId: id, tags });
    return id;
  }

  it("lists only public studies with a frozen version — drafts and private excluded", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });

    const shown = await makePublic(a, "Public + published");

    // Public but only a Draft (never published) — not discoverable.
    const draft = await a.studies.create({ kind: "blank", title: "Public draft only" });
    await a.studies.setForkable({ studyId: draft.id, forkableBy: "public" });

    // Published but private — not discoverable.
    const priv = await a.studies.create({ kind: "blank", title: "Private published" });
    await a.studies.publish({ studyId: priv.id });

    const page = await a.studies.browsePublic({});
    expect(page.items.map((i) => i.studyId)).toEqual([shown]);
    expect(page.items[0]).toMatchObject({
      title: "Public + published",
      authorName: "hanna",
      latestKind: "published",
      latestVersionNumber: 1,
      replicationCount: 0,
    });
    expect(page.nextCursor).toBeNull();
  });

  it("intersects tag filters (a study must carry every selected tag)", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const both = await makePublic(a, "Misinfo + trust", ["misinformation", "trust"]);
    await makePublic(a, "Misinfo only", ["misinformation"]);

    const r = await a.studies.browsePublic({ tags: ["misinformation", "trust"] });
    expect(r.items.map((i) => i.studyId)).toEqual([both]);

    const wide = await a.studies.browsePublic({ tags: ["misinformation"] });
    expect(wide.items).toHaveLength(2);
  });

  it("filters by author name", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const b = createCaller({ authUser: authUser("sofia") });
    const hStudy = await makePublic(a, "Hanna study");
    await makePublic(b, "Sofia study");

    const r = await a.studies.browsePublic({ authorQuery: "hann" });
    expect(r.items.map((i) => i.studyId)).toEqual([hStudy]);
  });

  it("sorts by most replicated", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const b = createCaller({ authUser: authUser("sofia") });
    const popular = await makePublic(a, "Popular");
    const quiet = await makePublic(a, "Quiet");
    // Sofia forks the popular one twice.
    await b.studies.fork({ studyId: popular });
    await b.studies.fork({ studyId: popular });

    const r = await a.studies.browsePublic({ sort: "replicated" });
    expect(r.items[0].studyId).toBe(popular);
    expect(r.items[0].replicationCount).toBe(2);
    expect(r.items.find((i) => i.studyId === quiet)!.replicationCount).toBe(0);
  });

  it("paginates by cursor", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    await makePublic(a, "One");
    await makePublic(a, "Two");
    await makePublic(a, "Three");

    const p1 = await a.studies.browsePublic({ limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await a.studies.browsePublic({ limit: 2, cursor: p1.nextCursor! });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();

    // No overlap between pages.
    const ids = new Set([...p1.items, ...p2.items].map((i) => i.studyId));
    expect(ids.size).toBe(3);
  });

  it("browseTags returns counts over the public set, with optional prefix", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    await makePublic(a, "S1", ["misinformation", "trust"]);
    await makePublic(a, "S2", ["misinformation"]);
    // A private study's tags must NOT count.
    const priv = await a.studies.create({ kind: "blank", title: "priv" });
    await a.studies.publish({ studyId: priv.id });
    await a.studies.setTags({ studyId: priv.id, tags: ["misinformation", "secret"] });

    const all = await a.studies.browseTags({});
    const map = Object.fromEntries(all.map((t) => [t.tag, t.count]));
    expect(map["misinformation"]).toBe(2);
    expect(map["trust"]).toBe(1);
    expect(map["secret"]).toBeUndefined(); // private study excluded

    const pref = await a.studies.browseTags({ q: "mis" });
    expect(pref.map((t) => t.tag)).toEqual(["misinformation"]);
  });
});

describe("studies.getPublicStudy (V1.8 Stream B)", () => {
  it("returns a public study's latest frozen version read-only", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Public detail" });
    await a.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await a.studies.publish({ studyId: id });
    await a.studies.setForkable({ studyId: id, forkableBy: "public" });
    await a.studies.setTags({ studyId: id, tags: ["misinformation"] });

    const detail = await a.studies.getPublicStudy({ studyId: id });
    expect(detail).toMatchObject({
      title: "Public detail",
      authorName: "hanna",
      latestKind: "published",
      latestVersionNumber: 1,
      tags: ["misinformation"],
    });
    expect(detail.blocks.map((b) => b.ref)).toEqual(["core/likert-7@1.0.0"]);
  });

  it("is NOT_FOUND for a private study", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Private" });
    await a.studies.publish({ studyId: id });
    await expect(a.studies.getPublicStudy({ studyId: id })).rejects.toThrow();
  });
});

describe("studies.compareVersions (V1.8 Stream A, ADR-0020 §A6)", () => {
  it("diffs the working copy against a chosen version: added / removed / unchanged", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Cmp" });

    const c = await a.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    const old = await a.studies.addBlock({ studyId: id, source: "core", key: "multiple-choice", version: "1.0.0" });
    await a.studies.publish({ studyId: id }); // v1 frozen with [C, old]
    const v1 = (await a.studies.listVersions({ studyId: id })).find((v) => v.kind === "published")!;

    // Working copy diverges: drop `old`, add `fresh`.
    await a.studies.removeBlock({ studyId: id, instanceId: old.instanceId });
    const fresh = await a.studies.addBlock({ studyId: id, source: "core", key: "slider", version: "1.0.0" });

    const cmp = await a.studies.compareVersions({ studyId: id, vs: v1.id });
    expect(cmp.leftLabel).toBe("Working copy");
    expect(cmp.rightLabel).toBe("Published v1");

    const leftById = Object.fromEntries(cmp.left.map((n) => [n.instanceId, n.status]));
    const rightById = Object.fromEntries(cmp.right.map((n) => [n.instanceId, n.status]));
    expect(leftById[c.instanceId]).toBe("unchanged");
    expect(leftById[fresh.instanceId]).toBe("added");
    expect(rightById[c.instanceId]).toBe("unchanged");
    expect(rightById[old.instanceId]).toBe("removed");
  });

  it("is tenant-scoped — another workspace's study is NOT_FOUND", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const b = createCaller({ authUser: authUser("sofia") });
    const { id } = await a.studies.create({ kind: "blank", title: "S" });
    await a.studies.publish({ studyId: id });
    const v1 = (await a.studies.listVersions({ studyId: id })).find((v) => v.kind === "published")!;
    await expect(b.studies.compareVersions({ studyId: id, vs: v1.id })).rejects.toThrow();
  });
});

describe("studies.archive (IA v0.4 focused-mode ⋯ menu)", () => {
  it("archives: gone from the default list, present under the archived filter", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "To shelve" });
    await caller.studies.archive({ studyId: id });
    expect((await caller.studies.list()).find((s) => s.id === id)).toBeUndefined();
    expect((await caller.studies.list({ filter: "archived" })).find((s) => s.id === id)).toBeDefined();
  });

  it("is tenant-scoped — another workspace's study is NOT_FOUND", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const b = createCaller({ authUser: authUser("sofia") });
    const { id } = await a.studies.create({ kind: "blank", title: "Mine" });
    await expect(b.studies.archive({ studyId: id })).rejects.toThrow();
  });
});

describe("studies.addBlock atIndex (library drag-to-position)", () => {
  it("inserts at the given position; appends when omitted or out of range", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Ordered" });
    const a = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    const b = await caller.studies.addBlock({ studyId: id, source: "core", key: "slider", version: "1.0.0", atIndex: 0 });
    const c = await caller.studies.addBlock({ studyId: id, source: "core", key: "free-text", version: "1.0.0", atIndex: 99 });
    const order = (await caller.studies.get({ id })).blocks.map((x) => x.instanceId);
    expect(order).toEqual([b.instanceId, a.instanceId, c.instanceId]);
  });
});

describe("listVersions auto-changelog (ADR-0033)", () => {
  it("first save = initial summary; later saves diff vs previous frozen; working copy shows pending", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Changelog" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "v1" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "attention-check", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "v2" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "slider", version: "1.0.0" });

    const versions = await caller.studies.listVersions({ studyId: id });
    const frozen = versions.filter((v) => !v.isWorkingCopy);
    expect(frozen[0].changes).toEqual(["Initial version — 1 block"]);
    expect(frozen[1].changes.some((l) => l.startsWith("＋ Added") && l.includes("Attention"))).toBe(true);
    const working = versions.find((v) => v.isWorkingCopy)!;
    expect(working.changes.some((l) => l.startsWith("＋ Added") && l.includes("Slider"))).toBe(true);
  });
});

describe("studies.setConsent (ADR-0035)", () => {
  it("round-trips through the working tip; defaults merge on read", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Consented" });
    expect((await caller.studies.get({ id })).consent.agreeLabel).toBe("Agree — begin");
    await caller.studies.setConsent({
      studyId: id,
      consent: { body: "Custom IRB text.", agreeLabel: "", disagreeLabel: "No thanks", declineMessage: "" },
    });
    const c = (await caller.studies.get({ id })).consent;
    expect(c.body).toBe("Custom IRB text.");
    expect(c.disagreeLabel).toBe("No thanks");
    expect(c.agreeLabel).toBe("Agree — begin"); // empty → default
  });
});
