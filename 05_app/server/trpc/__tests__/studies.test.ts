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
import { registry as osfRegistryAdapter } from "@/server/adapters/registry";
import { db } from "@/server/db/client";
import {
  activityEvent,
  changeProposal,
  condition,
  customModule,
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
  getCompletionInfo,
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
  await db.delete(changeProposal);
  await db.delete(customModule);
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

  it("creates a blank study with no blocks (Frameworks retired — ADR-0063 L2)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });

    const { id } = await caller.studies.create({ kind: "blank" });
    const detail = await caller.studies.get({ id });
    expect(detail.blocks).toHaveLength(0);
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

  // ADR-0084 hard gate: a fully-branded social-post can't freeze without a logo
  // AND an IRB attestation. setIrbAttestation records the attestation.
  it("hard-gates a fully-branded social-post until logo + IRB attestation", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Branded" });
    const { instanceId } = await caller.studies.addBlock({
      studyId: id,
      source: "core",
      key: "social-post",
      version: "2.0.0",
    });
    const baseConfig = {
      headline: "H",
      body: "",
      source: "Src",
      veracityGroundTruth: "unverified",
      topicTags: [],
      imageUrl: "",
      brandingTier: "branded",
    };
    // Branded, no logo, no attestation → rejected.
    await caller.studies.updateBlockConfig({ studyId: id, instanceId, config: baseConfig });
    await expect(caller.studies.preregister({ studyId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    // Attestation but still no logo → still rejected.
    await caller.studies.setIrbAttestation({ studyId: id, attested: true, statement: "IRB approved." });
    await expect(caller.studies.preregister({ studyId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    // Add the researcher-uploaded logo → now allowed.
    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId,
      config: { ...baseConfig, brandLogoKey: "/api/media/ws/abc/logo.png" },
    });
    const res = await caller.studies.preregister({ studyId: id });
    expect(res.versionNumber).toBeGreaterThan(0);
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

  it("amend supersedes the preregistration with a change summary (ADR-0004, audit step 4)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    // Can't amend before preregistering.
    await expect(caller.studies.amend({ studyId: id, changeSummary: "x" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await caller.studies.preregister({ studyId: id });
    const v1 = (await caller.studies.getPreregistration({ studyId: id }))!.versionNumber;
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.amend({ studyId: id, changeSummary: "Added a credibility item.", classification: "scope-change" });
    const after = (await caller.studies.getPreregistration({ studyId: id }))!;
    expect(after.versionNumber).toBeGreaterThan(v1);
    expect(after.changeSummary).toBe("Added a credibility item.");
    expect(after.amends).toBe(v1);
    expect(after.name).toContain("Amendment");
  });

  it("amend rejects an empty change summary (CHECK + Zod)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });
    await expect(caller.studies.amend({ studyId: id, changeSummary: "   " })).rejects.toBeTruthy();
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
      liveVersionNumber: null,
      divergedFromLive: false,
      recruitment: null,
      finishedAt: null,
    });

    await caller.studies.preregister({ studyId: id });
    expect(await caller.studies.getRunInfo({ studyId: id })).toMatchObject({
      runnable: true,
      versionKind: "preregistered",
      divergedFromLive: false, // tip == frozen right after preregister
      recruitment: null,
    });

    await caller.studies.openRecruitment({ studyId: id });
    expect(await caller.studies.getRunInfo({ studyId: id })).toMatchObject({
      runnable: true,
      versionKind: "preregistered",
      recruitment: { status: "open", currentN: 0 },
    });
  });

  it("getRunInfo reports divergedFromLive once the draft is edited after freezing (audit step 2)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });
    expect((await caller.studies.getRunInfo({ studyId: id })).divergedFromLive).toBe(false);
    // Edit the draft (tip) after freezing → diverges from the live frozen version.
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    const info = await caller.studies.getRunInfo({ studyId: id });
    expect(info.divergedFromLive).toBe(true);
    expect(info.liveVersionNumber).not.toBeNull();
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

  it("openRecruitment closes an older runnable version's live session (one-open-session invariant, ADR-0044)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.preregister({ studyId: id }); // v1 (preregistered)
    await caller.studies.openRecruitment({ studyId: id }); // v1 session open
    const firstSession = await resolveOpenRecruitment(id);

    // Freeze a v2 directly (publish, no makeLive), then open recruitment on it.
    await caller.studies.publish({ studyId: id }); // v2 (published)
    await caller.studies.openRecruitment({ studyId: id });

    // Exactly one open session across the study — the v1 session was closed.
    const openSessions = await db.select().from(recruitmentSession).where(eq(recruitmentSession.status, "open"));
    expect(openSessions).toHaveLength(1);
    const resolved = await resolveOpenRecruitment(id);
    expect(resolved!.recruitmentSessionId).not.toBe(firstSession!.recruitmentSessionId);
  });

  it("setRecruitmentStatus pause/resume/close gates the /take link, keeps data (run-stage.md)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    expect(await resolveOpenRecruitment(id)).not.toBeNull(); // link live

    // Pause → public link unavailable, but the session/data remain.
    await caller.studies.setRecruitmentStatus({ studyId: id, status: "paused" });
    expect((await caller.studies.getRunInfo({ studyId: id })).recruitment?.status).toBe("paused");
    expect(await resolveOpenRecruitment(id)).toBeNull();

    // Resume → link live again (same session reused).
    await caller.studies.setRecruitmentStatus({ studyId: id, status: "open" });
    expect(await resolveOpenRecruitment(id)).not.toBeNull();

    // Close → terminal; link stays unavailable.
    await caller.studies.setRecruitmentStatus({ studyId: id, status: "closed" });
    expect((await caller.studies.getRunInfo({ studyId: id })).recruitment?.status).toBe("closed");
    expect(await resolveOpenRecruitment(id)).toBeNull();
  });

  it("setRecruitmentStatus refuses when recruitment was never opened", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });
    await expect(caller.studies.setRecruitmentStatus({ studyId: id, status: "paused" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("studies.makeLive (ADR-0044)", () => {
  it("preregistered: makes the edited draft live as an amendment, reopens recruitment, closes the old session", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const { instanceId } = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const v1 = (await caller.studies.getRunInfo({ studyId: id })).liveVersionNumber!;
    const firstSession = await resolveOpenRecruitment(id);

    // Edit the draft → it diverges from the frozen live version.
    await caller.studies.setBlockTitle({ studyId: id, instanceId, title: "Reworded item" });
    expect((await caller.studies.getRunInfo({ studyId: id })).divergedFromLive).toBe(true);

    const res = await caller.studies.makeLive({
      studyId: id,
      changeSummary: "Reworded the credibility item.",
      classification: "clarification",
    });
    expect(res.versionKind).toBe("preregistered");
    expect(res.versionNumber).toBeGreaterThan(v1);

    // Live version is now the new one; drift cleared; recruitment still open.
    const after = await caller.studies.getRunInfo({ studyId: id });
    expect(after.liveVersionNumber).toBe(res.versionNumber);
    expect(after.divergedFromLive).toBe(false);
    expect(after.recruitment?.status).toBe("open");

    // Amendment lineage recorded (ADR-0004).
    const pre = (await caller.studies.getPreregistration({ studyId: id }))!;
    expect(pre.changeSummary).toBe("Reworded the credibility item.");
    expect(pre.amends).toBe(v1);

    // The OLD session is closed; the new link resolves to the new version; exactly
    // one open session remains for the study (the mandatory close-old guard).
    const newOpen = await resolveOpenRecruitment(id);
    expect(newOpen!.recruitmentSessionId).not.toBe(firstSession!.recruitmentSessionId);
    expect(newOpen!.versionId).not.toBe(firstSession!.versionId);
    const openSessions = await db.select().from(recruitmentSession).where(eq(recruitmentSession.status, "open"));
    expect(openSessions).toHaveLength(1);
  });

  it("published: makes the edited draft live without OSF and without a summary", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const { instanceId } = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    await caller.studies.setBlockTitle({ studyId: id, instanceId, title: "Edited" });

    const res = await caller.studies.makeLive({ studyId: id });
    expect(res.versionKind).toBe("published");
    expect(res.pushStatus).toBeNull();
    expect(enqueue.mock.calls.filter((c) => c[0] === "registry.push")).toHaveLength(0);
    const after = await caller.studies.getRunInfo({ studyId: id });
    expect(after.divergedFromLive).toBe(false);
    expect(after.recruitment?.status).toBe("open");
  });

  it("refuses when the draft hasn't diverged from the live version", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.publish({ studyId: id });
    await expect(caller.studies.makeLive({ studyId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("preregistered: requires a change summary", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const { instanceId } = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.setBlockTitle({ studyId: id, instanceId, title: "Edited" });
    await expect(caller.studies.makeLive({ studyId: id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a study that was never frozen", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await expect(caller.studies.makeLive({ studyId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("inherits the prior recruitment intent — making edits live on a PAUSED study does not silently re-open it", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const { instanceId } = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    await caller.studies.setRecruitmentStatus({ studyId: id, status: "paused" });
    await caller.studies.setBlockTitle({ studyId: id, instanceId, title: "Edited" });

    await caller.studies.makeLive({ studyId: id });

    // Still paused — the public link stays inactive; no session is open anywhere.
    expect((await caller.studies.getRunInfo({ studyId: id })).recruitment?.status).toBe("paused");
    expect(await resolveOpenRecruitment(id)).toBeNull();
    const openSessions = await db.select().from(recruitmentSession).where(eq(recruitmentSession.status, "open"));
    expect(openSessions).toHaveLength(0);
  });

  it("divergence covers non-block edits — a condition-weight change reads as drift and can be made live (ADR-0044)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    const c = await caller.studies.addCondition({ studyId: id, name: "Treatment" });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    expect((await caller.studies.getRunInfo({ studyId: id })).divergedFromLive).toBe(false);

    // Change ONLY a condition weight — no block edit at all.
    await caller.studies.updateCondition({ studyId: id, conditionId: c.id, allocationWeight: 3 });
    expect((await caller.studies.getRunInfo({ studyId: id })).divergedFromLive).toBe(true);
    const res = await caller.studies.makeLive({ studyId: id });
    expect(res.versionKind).toBe("published");
    expect((await caller.studies.getRunInfo({ studyId: id })).divergedFromLive).toBe(false);
  });
});

describe("getResults spans versions (ADR-0044 — no silent v1 data loss)", () => {
  it("pools all runnable versions by default, tags each row's version, and filters by version", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    const { instanceId } = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });

    // One completed response on v1 (likert = 2).
    const s1 = await resolveOpenRecruitment(id);
    const r1 = await startResponse({ recruitmentSessionId: s1!.recruitmentSessionId, mode: "run", externalPid: "P1" });
    await recordAnswer({ responseId: (r1 as { responseId: string }).responseId, questionIndex: 0, answer: { value: 2 } });

    // Edit the draft (keeps a single question), then make it live as v2.
    await caller.studies.setBlockTitle({ studyId: id, instanceId, title: "How credible now?" });
    const live = await caller.studies.makeLive({ studyId: id });
    expect(live.versionNumber).toBe(2);

    // One completed response on v2 (likert = 6).
    const s2 = await resolveOpenRecruitment(id);
    expect(s2!.recruitmentSessionId).not.toBe(s1!.recruitmentSessionId); // switched to v2's session
    const r2 = await startResponse({ recruitmentSessionId: s2!.recruitmentSessionId, mode: "run", externalPid: "P2" });
    await recordAnswer({ responseId: (r2 as { responseId: string }).responseId, questionIndex: 0, answer: { value: 6 } });

    // Pooled (default): BOTH responses present — v1 data is NOT silently dropped.
    const pooled = (await caller.studies.getResults({ studyId: id }))!;
    expect(pooled.totalCompleted).toBe(2);
    expect(pooled.selectedVersion).toBeNull();
    expect(pooled.availableVersions).toEqual([2, 1]);
    expect(pooled.rows.map((r) => r.versionNumber).sort()).toEqual([1, 2]);
    const likert = pooled.questions.find((q) => q.instanceId === instanceId)!;
    expect(likert.n).toBe(2);
    expect(likert.mean).toBe(4); // (2 + 6) / 2 — merged across versions by instanceId

    // Scoped to v1: only the first response.
    const onlyV1 = (await caller.studies.getResults({ studyId: id, version: 1 }))!;
    expect(onlyV1.totalCompleted).toBe(1);
    expect(onlyV1.selectedVersion).toBe(1);
    expect(onlyV1.rows[0].versionNumber).toBe(1);
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

  it("removeCondition refuses (no FK error) when responses reference the group", async () => {
    const { caller, id } = await studyWithBlock();
    const c = await caller.studies.addCondition({ studyId: id, name: "Control" });
    const [tipv] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    // A response (e.g. a preview run) assigned to this condition on the tip.
    const rsId = ulid();
    await db.insert(recruitmentSession).values({ id: rsId, experimentVersionId: tipv.id, status: "open" });
    await db.insert(response).values({
      id: ulid(),
      recruitmentSessionId: rsId,
      experimentVersionId: tipv.id,
      conditionId: c.id,
      mode: "preview",
      status: "completed",
    });

    // Graceful refusal (returned, not a thrown FK error) + the group survives.
    const res = await caller.studies.removeCondition({ studyId: id, conditionId: c.id });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/responses/i);
    expect(await caller.studies.listConditions({ studyId: id })).toHaveLength(1);
  });

  it("studyDashboard + changelog ignore Preview artifacts (no phantom recruiting / responses / 'Opened recruitment')", async () => {
    const { caller, id } = await studyWithBlock();
    const c = await caller.studies.addCondition({ studyId: id, name: "Control" });
    const [tipv] = await db.select().from(experimentVersion).where(eq(experimentVersion.kind, "autosave"));
    // A Preview opens an "open" recruitment session on the DRAFT version and writes
    // a completed mode:"preview" response — neither is real data.
    const rsId = ulid();
    await db.insert(recruitmentSession).values({ id: rsId, experimentVersionId: tipv.id, status: "open" });
    await db.insert(response).values({
      id: ulid(),
      recruitmentSessionId: rsId,
      experimentVersionId: tipv.id,
      conditionId: c.id,
      mode: "preview",
      status: "completed",
    });

    const dash = await caller.studies.studyDashboard({ studyId: id });
    expect(dash.completedResponses).toBe(0);
    expect(dash.recruitment.status).toBeNull();
    expect(dash.lifecycle.find((s) => s.key === "recruiting")?.done).toBe(false);
    expect(dash.lifecycle.find((s) => s.key === "data")?.done).toBe(false);

    const log = await caller.studies.changelog({ studyId: id });
    expect(log.some((e) => e.title === "Opened recruitment")).toBe(false);
  });

  it("editTimeline records edit events and coalesces same-kind edits (ADR-0086)", async () => {
    const { caller, id } = await studyWithBlock(); // addBlock → one "blocks" edit
    await caller.studies.updateTitle({ id, title: "Renamed study" });
    await caller.studies.setConsent({ studyId: id, consent: { body: "A", agreeLabel: "Yes", disagreeLabel: "No", declineMessage: "ok" } });
    // Second consent edit within the coalescing window → updates the same row, not a new one.
    await caller.studies.setConsent({ studyId: id, consent: { body: "B", agreeLabel: "Yes", disagreeLabel: "No", declineMessage: "ok" } });

    const tl = await caller.studies.editTimeline({ studyId: id });
    expect(tl.filter((e) => e.title === "Edited the consent screen")).toHaveLength(1); // coalesced
    expect(tl.some((e) => e.title.startsWith("Renamed the study"))).toBe(true);
    expect(tl.some((e) => e.kind === "event" && e.title.includes("block"))).toBe(true);
    // Newest first.
    expect([...tl].sort((a, b) => (a.at < b.at ? 1 : -1))).toEqual(tl);
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

  it("surfaces the factorial variant combination in results + on each row (ADR-0058)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    // Declare a factor BEFORE freezing so the runnable snapshot carries it.
    await caller.studies.setVariants({
      studyId: id,
      factors: [{ id: "f1", name: "Social", levels: [{ id: "lo", name: "low" }, { id: "hi", name: "high" }] }],
      variantBindings: [],
    });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });

    const open = await resolveOpenRecruitment(id);
    const started = await startResponse({
      recruitmentSessionId: open!.recruitmentSessionId,
      mode: "run",
      externalPid: "P1",
    });
    const responseId = (started as { responseId: string }).responseId;
    await recordAnswer({ responseId, questionIndex: 0, answer: { value: 6 } });

    const results = (await caller.studies.getResults({ studyId: id }))!;
    // One participant → exactly one combination, count 1, label one of the levels.
    expect(results.combinations).toHaveLength(1);
    expect(results.combinations[0].completed).toBe(1);
    expect(["low", "high"]).toContain(results.combinations[0].label);
    // The row carries the same combination label (this feeds the export column).
    expect(results.rows[0].cell).toBe(results.combinations[0].label);
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

  it("replication freeze-gate (ADR-0018 am.): own-workspace draft duplication OK; public requires frozen", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id: src } = await caller.studies.create({ kind: "blank", title: "Draft" });
    // Own-workspace member may duplicate an unfrozen draft (the carve-out).
    const { id: dup } = await caller.studies.fork({ studyId: src });
    expect((await caller.studies.get({ id: dup })).isReplication).toBe(true);
    // But it can't be offered for public replication until frozen.
    await expect(caller.studies.setForkable({ studyId: src, forkableBy: "public" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await caller.studies.preregister({ studyId: src });
    await expect(caller.studies.setForkable({ studyId: src, forkableBy: "public" })).resolves.toMatchObject({
      forkableBy: "public",
    });
  });

  it("cross-workspace fork: FORBIDDEN when private, allowed + emits fork when public (diff withheld)", async () => {
    const a = await seedUserWithWorkspace("ext_a", "Alpha");
    const beta = await seedUserWithWorkspace("ext_s", "Beta");
    const hanna = createCaller({ authUser: authUser("ext_a") });
    const sofia = createCaller({ authUser: authUser("ext_s") });
    const { id: src } = await hanna.studies.create({ kind: "blank", title: "Public source" });

    await expect(sofia.studies.fork({ studyId: src })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await hanna.studies.preregister({ studyId: src }); // replication requires a frozen version (ADR-0018 am.)
    await hanna.studies.setForkable({ studyId: src, forkableBy: "public" });
    await db.update(experiment).set({ finishedAt: new Date() }).where(eq(experiment.id, src)); // + finished (ADR-0054)
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
    expect(versions[1].author).toBe("ext_a"); // changelog "by who" (creator's display name)
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

describe("studies.changelog (Dashboard — when/what/who)", () => {
  it("merges frozen saves (with author + diff) newest-first; excludes the autosave draft", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "social-post", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "Pilot" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "free-text", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "Round 2" });

    const log = await caller.studies.changelog({ studyId: id });
    // Only the two frozen saves are version entries — the autosave draft is not.
    const versions = log.filter((e) => e.kind === "version");
    expect(versions).toHaveLength(2);
    // Newest first.
    expect(versions[0].title).toContain("Round 2");
    expect(versions[1].title).toContain("Pilot");
    // "By who" comes through.
    expect(versions[0].actor).toBe("ext_a");
    // "What" — the newest save added a block; the first describes the initial version.
    expect(versions[0].detail.join(" ")).toMatch(/Added/i);
    expect(versions[1].detail.join(" ")).toMatch(/Initial/i);
  });

  it("surfaces unsaved working-draft edits as a 'Working draft' entry (feedback fix)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "social-post", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "v1" });
    // Edit the working draft WITHOUT saving a new version.
    await caller.studies.addBlock({ studyId: id, source: "core", key: "free-text", version: "1.0.0" });

    const log = await caller.studies.changelog({ studyId: id });
    const draft = log.find((e) => e.title.startsWith("Working draft"));
    expect(draft).toBeTruthy();
    expect(draft?.detail.join(" ")).toMatch(/Added/i);
    // Right after a save (no pending edits) there is NO draft entry.
    await caller.studies.saveAsNamed({ studyId: id, name: "v2" });
    const after = await caller.studies.changelog({ studyId: id });
    expect(after.find((e) => e.title.startsWith("Working draft"))).toBeUndefined();
  });

  it("rejects another workspace", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_b", "Beta");
    const a = createCaller({ authUser: authUser("ext_a") });
    const { id } = await a.studies.create({ kind: "blank", title: "S" });
    const b = createCaller({ authUser: authUser("ext_b") });
    await expect(b.studies.changelog({ studyId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("studies.setPanelIntegration (ADR-0071)", () => {
  it("defaults to standard flow; persists sanitized config; rejects other workspace", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const a = createCaller({ authUser: authUser("ext_a") });
    const { id } = await a.studies.create({ kind: "blank", title: "S" });

    // Empty by default → resolved defaults.
    const d0 = await a.studies.get({ id });
    expect(d0.panelIntegration.respondentIdParam).toBe("res_id");
    expect(d0.panelIntegration.completionUrl).toBe("");

    await a.studies.setPanelIntegration({
      studyId: id,
      config: {
        respondentIdParam: "PID",
        completionUrl: "https://panel.example.com/done?id={ext_id}",
        completionDelaySec: 30,
        refusalUrl: "javascript:bad", // dropped
        skipRefusalScreen: true,
      },
    });
    const d1 = await a.studies.get({ id });
    expect(d1.panelIntegration.respondentIdParam).toBe("PID");
    expect(d1.panelIntegration.completionUrl).toBe("https://panel.example.com/done?id={ext_id}");
    expect(d1.panelIntegration.completionDelaySec).toBe(30);
    expect(d1.panelIntegration.refusalUrl).toBe(""); // sanitized away
    expect(d1.panelIntegration.skipRefusalScreen).toBe(true);

    await seedUserWithWorkspace("ext_b", "Beta");
    const b = createCaller({ authUser: authUser("ext_b") });
    await expect(b.studies.setPanelIntegration({ studyId: id, config: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    // Cross-workspace replication now requires the source be Finished (ADR-0054).
    await db.update(experiment).set({ finishedAt: new Date() }).where(eq(experiment.id, id));
    if (tags.length) await caller.studies.setTags({ studyId: id, tags });
    return id;
  }

  it("lists only public studies with a frozen version — drafts and private excluded", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });

    const shown = await makePublic(a, "Public + published");

    // A draft can't even be made public now (ADR-0018 am.) — so it's never
    // discoverable; the gate is enforced at setForkable, not just at browse.
    const draft = await a.studies.create({ kind: "blank", title: "Public draft only" });
    await expect(a.studies.setForkable({ studyId: draft.id, forkableBy: "public" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

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

  it("filters by finished + has-preregistration facets (ADR-0055)", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const finishedId = await makePublic(a, "Finished one"); // published + finishedAt set
    // Public + published but NOT finished.
    const { id: liveId } = await a.studies.create({ kind: "blank", title: "Live not finished" });
    await a.studies.publish({ studyId: liveId });
    await a.studies.setForkable({ studyId: liveId, forkableBy: "public" });
    // Public + preregistered (not finished).
    const { id: preregId } = await a.studies.create({ kind: "blank", title: "Prereg" });
    await a.studies.preregister({ studyId: preregId });
    await a.studies.setForkable({ studyId: preregId, forkableBy: "public" });

    const fin = (await a.studies.browsePublic({ finished: true })).items.map((i) => i.studyId);
    expect(fin).toContain(finishedId);
    expect(fin).not.toContain(liveId);
    expect(fin).not.toContain(preregId);

    const pre = (await a.studies.browsePublic({ hasPreregistration: true })).items.map((i) => i.studyId);
    expect(pre).toContain(preregId);
    expect(pre).not.toContain(finishedId); // published-only
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

  it("searches by title (q) — ADR-0055", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const trust = await makePublic(a, "Trust in headlines");
    await makePublic(a, "Sharing intentions");

    const r = await a.studies.browsePublic({ q: "headline" });
    expect(r.items.map((i) => i.studyId)).toEqual([trust]);
  });

  it("search also matches the published record abstract + tags (ADR-0055 1b)", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const byAbstract = await makePublic(a, "Opaque title one");
    const byTag = await makePublic(a, "Opaque title two", ["neuroephemera"]);

    // Publish a record whose abstract carries a distinctive word.
    await a.studyRecord.saveAuthored({ studyId: byAbstract, abstract: "A study of zibbleflux priming." });
    await a.studyRecord.setVisibility({ studyId: byAbstract, visibility: "public" });

    expect((await a.studies.browsePublic({ q: "zibbleflux" })).items.map((i) => i.studyId)).toEqual([byAbstract]);
    expect((await a.studies.browsePublic({ q: "neuroephemera" })).items.map((i) => i.studyId)).toEqual([byTag]);
  });

  it("sorts oldest-first and A–Z (ADR-0055), each cursor-stable", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const first = await makePublic(a, "Zeta"); // created first
    const second = await makePublic(a, "Alpha"); // created later

    const oldest = await a.studies.browsePublic({ sort: "oldest" });
    expect(oldest.items.map((i) => i.studyId)).toEqual([first, second]);

    const alpha = await a.studies.browsePublic({ sort: "alpha" });
    expect(alpha.items.map((i) => i.title)).toEqual(["Alpha", "Zeta"]);

    // Alpha keyset paginates without overlap.
    const p1 = await a.studies.browsePublic({ sort: "alpha", limit: 1 });
    expect(p1.items[0].title).toBe("Alpha");
    const p2 = await a.studies.browsePublic({ sort: "alpha", limit: 1, cursor: p1.nextCursor! });
    expect(p2.items[0].title).toBe("Zeta");
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

describe("studies.delete + unarchive (ADR-0037)", () => {
  it("hard-deletes the full chain (versions, recruitment, responses); forks survive with lineage nulled", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const sofia = createCaller({ authUser: authUser("sofia") });

    const { id } = await hanna.studies.create({ kind: "blank", title: "Doomed" });
    await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await hanna.studies.publish({ studyId: id });
    await hanna.studies.setForkable({ studyId: id, forkableBy: "public" });
    await hanna.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const started = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: null });
    expect("responseId" in started!).toBe(true);
    await db.update(experiment).set({ finishedAt: new Date() }).where(eq(experiment.id, id)); // cross-workspace fork needs Finished (ADR-0054)
    const { id: forkId } = await sofia.studies.fork({ studyId: id });

    await hanna.studies.deleteStudy({ studyId: id, confirmTitle: "Doomed" });

    await expect(hanna.studies.get({ id })).rejects.toThrow();
    expect(await db.select().from(experimentVersion).then((r) => r.filter((v) => v.experimentId === id))).toHaveLength(0);
    expect(await db.select().from(response)).toHaveLength(0);
    const [fork] = await db.select().from(experiment).where(eq(experiment.id, forkId));
    expect(fork).toBeDefined();
    expect(fork.forkOfExperimentId).toBeNull();
  });

  it("unarchive brings a study back to the default list; both are tenant-scoped", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    await seedUserWithWorkspace("ext_b", "Lab B");
    const a = createCaller({ authUser: authUser("ext_a") });
    const b = createCaller({ authUser: authUser("ext_b") });
    const { id } = await a.studies.create({ kind: "blank", title: "Shelved" });
    await a.studies.archive({ studyId: id });
    await expect(b.studies.unarchive({ studyId: id })).rejects.toThrow();
    await expect(b.studies.deleteStudy({ studyId: id, confirmTitle: "Shelved" })).rejects.toThrow();
    await a.studies.unarchive({ studyId: id });
    expect((await a.studies.list()).find((s) => s.id === id)).toBeDefined();
  });
});

describe("getResults field-group per-field columns (ADR-0030 export)", () => {
  it("expands a field-group into one question/column per field", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Form study" });
    const fg = await caller.studies.addBlock({ studyId: id, source: "core", key: "field-group", version: "1.0.0" });
    const block = (await caller.studies.get({ id })).blocks.find((b) => b.instanceId === fg.instanceId)!;
    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId: fg.instanceId,
      config: {
        ...block.config,
        prompt: "About you",
        fields: [
          { key: "nick", label: "Nickname", type: "text" },
          { key: "age", label: "Age", type: "number" },
        ],
      },
    });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const started = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: null });
    const responseId = (started as { responseId: string }).responseId;
    await recordAnswer({ responseId, questionIndex: 0, answer: { values: { nick: "Ana", age: 30 } } });

    const results = await caller.studies.getResults({ studyId: id });
    const keys = results!.questions.map((q) => q.instanceId);
    expect(keys).toContain(`${fg.instanceId}.nick`);
    expect(keys).toContain(`${fg.instanceId}.age`);
    const ageQ = results!.questions.find((q) => q.instanceId === `${fg.instanceId}.age`)!;
    expect(ageQ.kind).toBe("numeric");
    expect(ageQ.mean).toBe(30);
    expect(ageQ.prompt).toContain("Age");
    const row = results!.rows[0];
    expect(row.answers[`${fg.instanceId}.nick`]).toBe("Ana");
    expect(row.answers[`${fg.instanceId}.age`]).toBe("30");
  });
});

describe("GitHub medium tier (ADR-0038)", () => {
  it("blockProvenance: introduced/changed versions + preregistration drift", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Prov" });
    const b = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "v1" });
    const block = (await caller.studies.get({ id })).blocks[0];
    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId: b.instanceId,
      config: { ...block.config, prompt: "Reworded" },
    });
    await caller.studies.saveAsNamed({ studyId: id, name: "v2" });
    const prov = await caller.studies.blockProvenance({ studyId: id, instanceId: b.instanceId });
    expect(prov.createdIn).toBe("v1");
    expect(prov.lastChangedIn).toBe("v2");
    expect(prov.sincePreregistration).toBeNull(); // never preregistered
  });

  it("useAsTemplate copies a public study with fresh identities and NO lineage", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const sofia = createCaller({ authUser: authUser("sofia") });
    const { id } = await hanna.studies.create({ kind: "blank", title: "Template src" });
    const src = await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await hanna.studies.publish({ studyId: id });
    await hanna.studies.setForkable({ studyId: id, forkableBy: "public" });

    const { id: copyId } = await sofia.studies.useAsTemplate({ studyId: id });
    const copy = await sofia.studies.get({ id: copyId });
    expect(copy.title).toContain("from template");
    expect(copy.blocks).toHaveLength(1);
    expect(copy.blocks[0].instanceId).not.toBe(src.instanceId); // fresh identity
    const [row] = await db.select().from(experiment).where(eq(experiment.id, copyId));
    expect(row.forkOfExperimentId).toBeNull(); // NO lineage
    expect((await sofia.studies.getReplications({ studyId: copyId })).parent).toBeNull();
  });

  it("community modules: publish → visible + insertable cross-workspace (copy-on-insert)", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const sofia = createCaller({ authUser: authUser("sofia") });
    const { id } = await hanna.studies.create({ kind: "blank", title: "Mod src" });
    const b = await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    const saved = await hanna.studies.saveBlockAsModule({ studyId: id, instanceId: b.instanceId, name: "Nice likert" });

    // Private: invisible + not insertable for Sofia.
    expect((await sofia.studies.listCommunityModules()).filter((m) => !m.mine)).toHaveLength(0);
    const { id: sofiaStudy } = await sofia.studies.create({ kind: "blank", title: "Uses it" });
    await expect(sofia.studies.insertCustomModule({ studyId: sofiaStudy, customModuleId: saved.id })).rejects.toThrow();

    await hanna.studies.setModulePublic({ id: saved.id, isPublic: true });
    await expect(sofia.studies.setModulePublic({ id: saved.id, isPublic: false })).rejects.toThrow(); // not hers
    const visible = (await sofia.studies.listCommunityModules()).filter((m) => !m.mine);
    expect(visible).toHaveLength(1);
    expect(visible[0].authorName).toBe("hanna");
    await sofia.studies.insertCustomModule({ studyId: sofiaStudy, customModuleId: saved.id });
    expect((await sofia.studies.get({ id: sofiaStudy })).blocks).toHaveLength(1);
  });
});

describe("studies.blockHistory (block-level History tab)", () => {
  it("tells the block's own story: introduced → changed (with lines) → unsaved edits", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Story" });
    const b = await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.saveAsNamed({ studyId: id, name: "v1" });
    const block = (await caller.studies.get({ id })).blocks[0];
    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId: b.instanceId,
      config: { ...block.config, prompt: "Reworded prompt" },
    });
    await caller.studies.saveAsNamed({ studyId: id, name: "v2" });
    await caller.studies.updateBlockConfig({
      studyId: id,
      instanceId: b.instanceId,
      config: { ...block.config, prompt: "Unsaved tweak" },
    });

    const history = await caller.studies.blockHistory({ studyId: id, instanceId: b.instanceId });
    // newest first: unsaved tweak → v2 change → v1 introduction
    expect(history[0].label).toContain("Working copy");
    expect(history[1].label).toBe("v2");
    expect(history[1].kind).toBe("changed");
    expect(history[1].changes.join(" ").toLowerCase()).toContain("prompt");
    expect(history[2].label).toBe("v1");
    expect(history[2].kind).toBe("introduced");
  });
});

describe("replication experience (ADR-0039)", () => {
  async function replicationFixture() {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const sofia = createCaller({ authUser: authUser("sofia") });
    const { id } = await hanna.studies.create({ kind: "blank", title: "Source cues" });
    const likert = await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await hanna.studies.publish({ studyId: id });
    await hanna.studies.setForkable({ studyId: id, forkableBy: "public" });
    await db.update(experiment).set({ finishedAt: new Date() }).where(eq(experiment.id, id)); // cross-workspace fork needs Finished (ADR-0054)
    return { hanna, sofia, originId: id, likertId: likert.instanceId };
  }

  it("fork with intent injects Recipe sections + stores the kind; status starts undiverged", async () => {
    const { sofia, originId } = await replicationFixture();
    const { id: forkId } = await sofia.studies.fork({ studyId: originId, intent: "direct" });
    const overview = (await sofia.studies.get({ id: forkId })).overview;
    expect(overview.replicationIntent).toBe("direct");
    expect(overview.sections.map((x) => x.id)).toEqual(
      expect.arrayContaining(["recipe-target-effect", "recipe-differences"]),
    );
    const status = await sofia.studies.replicationStatus({ studyId: forkId });
    expect(status?.sourceTitle).toBe("Source cues");
    expect(status?.intent).toBe("direct");
    expect(status?.divergedCount).toBe(0);
  });

  it("divergence badges + rationale + replication-aware preflight", async () => {
    const { sofia, originId, likertId } = await replicationFixture();
    const { id: forkId } = await sofia.studies.fork({ studyId: originId, intent: "direct" });
    const forkBlock = (await sofia.studies.get({ id: forkId })).blocks.find((b) => b.instanceId === likertId)!;
    await sofia.studies.updateBlockConfig({
      studyId: forkId,
      instanceId: likertId,
      config: { ...forkBlock.config, prompt: "How truthful is this?" },
    });

    const status = await sofia.studies.replicationStatus({ studyId: forkId });
    expect(status?.badges[likertId]).toBe("modified");
    const original = await sofia.studies.upstreamBlock({ studyId: forkId, instanceId: likertId });
    expect(original?.config.prompt).not.toBe("How truthful is this?");

    // Direct replication + unjustified change → amber readiness row.
    let checks = await sofia.studies.preflight({ studyId: forkId, mode: "publish" });
    expect(checks.find((c) => c.id === "replication-intent")?.status).toBe("pass");
    expect(checks.find((c) => c.id === "divergence-justified")?.status).toBe("warn");

    await sofia.studies.setBlockDivergenceNote({
      studyId: forkId,
      instanceId: likertId,
      note: "Original wording was ambiguous in pilot.",
    });
    expect(
      (await sofia.studies.get({ id: forkId })).blocks.find((b) => b.instanceId === likertId)?.divergenceNote,
    ).toContain("ambiguous");
    checks = await sofia.studies.preflight({ studyId: forkId, mode: "publish" });
    expect(checks.find((c) => c.id === "divergence-justified")?.status).toBe("pass");

    // Conceptual intent relaxes the rule even without notes.
    await sofia.studies.setBlockDivergenceNote({ studyId: forkId, instanceId: likertId, note: "" });
    await sofia.studies.setReplicationIntent({ studyId: forkId, intent: "conceptual" });
    checks = await sofia.studies.preflight({ studyId: forkId, mode: "publish" });
    expect(checks.find((c) => c.id === "divergence-justified")?.status).toBe("pass");
  });

  it("non-replications see none of it", async () => {
    await seedUserWithWorkspace("solo", "Solo Lab");
    const solo = createCaller({ authUser: authUser("solo") });
    const { id } = await solo.studies.create({ kind: "blank", title: "Plain" });
    await solo.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    expect(await solo.studies.replicationStatus({ studyId: id })).toBeNull();
    const checks = await solo.studies.preflight({ studyId: id, mode: "publish" });
    expect(checks.some((c) => c.id.startsWith("replication"))).toBe(false);
  });
});

describe("Wave 5 flow blocks: embedded-data + end-redirect (ADR-0042)", () => {
  it("embedded-data captures declared URL params at start; flow blocks are not screens", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Flow" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "embedded-data", version: "1.0.0" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "end-redirect", version: "1.0.0" });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    expect(open!.embeddedParams).toEqual(["PROLIFIC_PID"]);
    const started = await startResponse({
      recruitmentSessionId: open!.recruitmentSessionId,
      mode: "run",
      externalPid: null,
      embedded: { PROLIFIC_PID: "p-123" },
    });
    const responseId = (started as { responseId: string }).responseId;
    // Embedded params actually PERSIST on the response row (ADR-0042) — they go
    // to clientMetadata.embedded; the `response` table has no `metadata` column,
    // so the old `metadata:` insert key was silently dropped (regression guard).
    const [row] = await db
      .select({ clientMetadata: response.clientMetadata })
      .from(response)
      .where(eq(response.id, responseId));
    expect(row?.clientMetadata).toEqual({ embedded: { PROLIFIC_PID: "p-123" } });
    // The two flow blocks are filtered from the participant screen flow → only
    // the likert is a screen (recordAnswer index 0 completes the study).
    const done = await recordAnswer({ responseId, questionIndex: 0, answer: { value: 5 } });
    expect(done).toMatchObject({ ok: true, done: true });
    const info = await getCompletionInfo(responseId);
    expect(info!.completed).toBe(true);
  });
});

describe("getResults spatial overlay (heat-map / hot-spot, ADR-0041)", () => {
  it("aggregates clicks + region hits with the stimulus image", async () => {
    await seedUserWithWorkspace("ext_a", "Lab A");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Spatial" });
    const hm = await caller.studies.addBlock({ studyId: id, source: "core", key: "heat-map", version: "1.0.0" });
    const hmBlock = (await caller.studies.get({ id })).blocks.find((b) => b.instanceId === hm.instanceId)!;
    await caller.studies.updateBlockConfig({ studyId: id, instanceId: hm.instanceId, config: { ...hmBlock.config, imageUrl: "/api/media/ws/x/post.png" } });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const r1 = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: null });
    await recordAnswer({ responseId: (r1 as { responseId: string }).responseId, questionIndex: 0, answer: { points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.5 }] } });

    const results = await caller.studies.getResults({ studyId: id });
    const q = results!.questions.find((x) => x.instanceId === hm.instanceId)!;
    expect(q.spatial?.imageUrl).toBe("/api/media/ws/x/post.png");
    expect(q.spatial?.points).toHaveLength(2);
    expect(q.spatial?.points?.[0]).toEqual({ x: 0.2, y: 0.3 });
    expect(q.n).toBe(1); // one responder, two points
  });

  it("heat-map exposes per-respondent rows (kind + responses[] with condition/PID), pooled fields intact", async () => {
    await seedUserWithWorkspace("ext_hmr", "Lab HMR");
    const caller = createCaller({ authUser: authUser("ext_hmr") });
    const { id } = await caller.studies.create({ kind: "blank", title: "HM responses" });
    const hm = await caller.studies.addBlock({ studyId: id, source: "core", key: "heat-map", version: "1.0.0" });
    const hmBlock = (await caller.studies.get({ id })).blocks.find((b) => b.instanceId === hm.instanceId)!;
    await caller.studies.updateBlockConfig({ studyId: id, instanceId: hm.instanceId, config: { ...hmBlock.config, imageUrl: "/api/media/ws/x/post.png" } });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const r1 = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: "PID-1" });
    await recordAnswer({ responseId: (r1 as { responseId: string }).responseId, questionIndex: 0, answer: { points: [{ x: 0.1, y: 0.1 }] } });
    const r2 = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: null });
    await recordAnswer({ responseId: (r2 as { responseId: string }).responseId, questionIndex: 0, answer: { points: [{ x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }] } });

    const q = (await caller.studies.getResults({ studyId: id }))!.questions.find((x) => x.instanceId === hm.instanceId)!;
    expect(q.spatial?.kind).toBe("heat-map");
    expect(q.spatial?.points).toHaveLength(3); // pooled, backward-compatible
    expect(q.spatial?.responses).toHaveLength(2);
    const byPid = q.spatial!.responses!.find((r) => r.externalPid === "PID-1")!;
    expect(byPid.points).toEqual([{ x: 0.1, y: 0.1 }]);
    expect(typeof byPid.conditionSlug).toBe("string");
    expect(q.spatial!.responses!.find((r) => r.externalPid === null)?.points).toHaveLength(2);
  });

  it("hot-spot: per-respondent regionKeys + aggregated region counts", async () => {
    await seedUserWithWorkspace("ext_hs", "Lab HS");
    const caller = createCaller({ authUser: authUser("ext_hs") });
    const { id } = await caller.studies.create({ kind: "blank", title: "HS responses" });
    const hs = await caller.studies.addBlock({ studyId: id, source: "core", key: "hot-spot", version: "1.0.0" });
    const hsBlock = (await caller.studies.get({ id })).blocks.find((b) => b.instanceId === hs.instanceId)!;
    await caller.studies.updateBlockConfig({ studyId: id, instanceId: hs.instanceId, config: { ...hsBlock.config, imageUrl: "/api/media/ws/x/post.png", multiple: true } });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const r1 = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: null });
    await recordAnswer({ responseId: (r1 as { responseId: string }).responseId, questionIndex: 0, answer: { selected: ["r1"] } });

    const q = (await caller.studies.getResults({ studyId: id }))!.questions.find((x) => x.instanceId === hs.instanceId)!;
    expect(q.spatial?.kind).toBe("hot-spot");
    expect(q.spatial?.regions?.find((r) => r.key === "r1")?.count).toBe(1);
    expect(q.spatial?.responses?.[0]?.regionKeys).toEqual(["r1"]);
  });

  it("graphic-slider: emits spatial with per-respondent value + synthesized pooled strip", async () => {
    await seedUserWithWorkspace("ext_gs", "Lab GS");
    const caller = createCaller({ authUser: authUser("ext_gs") });
    const { id } = await caller.studies.create({ kind: "blank", title: "GS responses" });
    const gs = await caller.studies.addBlock({ studyId: id, source: "core", key: "graphic-slider", version: "1.0.0" });
    const gsBlock = (await caller.studies.get({ id })).blocks.find((b) => b.instanceId === gs.instanceId)!;
    await caller.studies.updateBlockConfig({ studyId: id, instanceId: gs.instanceId, config: { ...gsBlock.config, imageUrl: "/api/media/ws/x/scale.png" } });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const r1 = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: null });
    await recordAnswer({ responseId: (r1 as { responseId: string }).responseId, questionIndex: 0, answer: { value: 0.7 } });

    const q = (await caller.studies.getResults({ studyId: id }))!.questions.find((x) => x.instanceId === gs.instanceId)!;
    expect(q.spatial?.kind).toBe("graphic-slider");
    expect(q.spatial?.responses?.[0]?.value).toBe(0.7);
    expect(q.spatial?.points).toEqual([{ x: 0.7, y: 0.5 }]); // synthesized strip
    expect(q.n).toBe(1);
  });

  it("signature: emits a spatial payload with per-respondent r2Key (viewer/gallery)", async () => {
    await seedUserWithWorkspace("ext_sig", "Lab SIG");
    const caller = createCaller({ authUser: authUser("ext_sig") });
    const { id } = await caller.studies.create({ kind: "blank", title: "SIG responses" });
    const sg = await caller.studies.addBlock({ studyId: id, source: "core", key: "signature", version: "1.0.0" });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const r1 = await startResponse({ recruitmentSessionId: open!.recruitmentSessionId, mode: "run", externalPid: "PID-S" });
    await recordAnswer({ responseId: (r1 as { responseId: string }).responseId, questionIndex: 0, answer: { r2Key: "resp/r1/sig.png" } });

    const q = (await caller.studies.getResults({ studyId: id }))!.questions.find((x) => x.instanceId === sg.instanceId)!;
    expect(q.spatial?.kind).toBe("signature");
    expect(q.spatial?.imageUrl).toBe(""); // no stimulus — the viewer renders each signature
    expect(q.spatial?.responses).toEqual([
      { responseId: (r1 as { responseId: string }).responseId, conditionSlug: expect.any(String), externalPid: "PID-S", versionNumber: 1, r2Key: "resp/r1/sig.png" },
    ]);
    expect(q.n).toBe(1);
  });
});

describe("workspace.list + active-workspace switching (ADR-0033)", () => {
  it("lists the caller's workspaces (role + study count) and the switcher preference picks the active one", async () => {
    const { user: u } = await seedUserWithWorkspace("ext_a", "Alpha");
    const [beta] = await db.insert(workspace).values({ name: "Beta", slug: "beta", ownerId: u.id }).returning();
    await db.insert(member).values({ workspaceId: beta.id, userId: u.id, role: "owner", status: "active" });

    const caller = createCaller({ authUser: authUser("ext_a") });
    await caller.studies.create({ kind: "blank", title: "S1" }); // lands in the default active (Alpha)

    const list = await caller.workspace.list();
    expect(list.map((w) => w.name).sort()).toEqual(["Alpha", "Beta"]);
    const alpha = list.find((w) => w.name === "Alpha")!;
    expect(alpha.role).toBe("owner");
    expect(alpha.studyCount).toBe(1);

    // Default active = Alpha (earliest owner); the switcher preference flips it to Beta.
    expect((await caller.workspace.active()).name).toBe("Alpha");
    const callerBeta = createCaller({ authUser: authUser("ext_a"), preferredWorkspaceId: beta.id });
    expect((await callerBeta.workspace.active()).name).toBe("Beta");

    // A non-member / bogus preference falls back to the default.
    const callerBogus = createCaller({ authUser: authUser("ext_a"), preferredWorkspaceId: "00000000-0000-0000-0000-000000000000" });
    expect((await callerBogus.workspace.active()).name).toBe("Alpha");
  });
});

describe("meRouter (cross-workspace personal data, ADR-0033)", () => {
  it("recentStudies + stats span the caller's authored studies across workspaces", async () => {
    const { user: u } = await seedUserWithWorkspace("ext_a", "Alpha");
    const [beta] = await db.insert(workspace).values({ name: "Beta", slug: "beta", ownerId: u.id }).returning();
    await db.insert(member).values({ workspaceId: beta.id, userId: u.id, role: "owner", status: "active" });

    await createCaller({ authUser: authUser("ext_a") }).studies.create({ kind: "blank", title: "Alpha study" });
    await createCaller({ authUser: authUser("ext_a"), preferredWorkspaceId: beta.id }).studies.create({ kind: "blank", title: "Beta study" });

    const caller = createCaller({ authUser: authUser("ext_a") });
    const recent = await caller.me.recentStudies({ limit: 10 });
    expect(recent.map((r) => r.title).sort()).toEqual(["Alpha study", "Beta study"]);
    expect(new Set(recent.map((r) => r.workspaceName))).toEqual(new Set(["Alpha", "Beta"]));

    const stats = await caller.me.stats();
    expect(stats.studiesAuthored).toBe(2);
    expect(stats.followers).toBe(0);
    expect(stats.totalParticipants).toBe(0);
  });

  it("recruitingStudies returns authored studies that have an open recruitment session", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Recruiting one" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });

    const recruiting = await caller.me.recruitingStudies();
    expect(recruiting).toHaveLength(1);
    expect(recruiting[0]).toMatchObject({ studyId: id, title: "Recruiting one", workspaceName: "Alpha", currentN: 0 });
  });
});

describe("workspace dashboard aggregates (V1.13.0 Stream B)", () => {
  it("dashboardStats + activeRecruitment + recentlyEdited reflect a recruiting study", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Stream B study" });
    await caller.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await caller.studies.preregister({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });

    const stats = await caller.workspace.dashboardStats();
    expect(stats).toMatchObject({ totalStudies: 1, recruiting: 1, responsesThisWeek: 0 });

    const recruiting = await caller.workspace.activeRecruitment();
    expect(recruiting).toHaveLength(1);
    expect(recruiting[0]).toMatchObject({ studyId: id, title: "Stream B study", currentN: 0 });

    const recent = await caller.workspace.recentlyEdited({ limit: 6 });
    expect(recent.map((r) => r.title)).toContain("Stream B study");
  });

  it("recentActivity is scoped to the active workspace", async () => {
    const { user: u, workspace: ws } = await seedUserWithWorkspace("ext_a", "Alpha");
    const [beta] = await db.insert(workspace).values({ name: "Beta", slug: "beta", ownerId: u.id }).returning();
    await db.insert(member).values({ workspaceId: beta.id, userId: u.id, role: "owner", status: "active" });
    await db.insert(activityEvent).values({
      id: ulid(), type: "preregister_complete", workspaceId: ws.id,
      targetType: "study", targetId: "x", relatedStudyId: "x", payload: { studyTitle: "Mine" },
    });
    await db.insert(activityEvent).values({
      id: ulid(), type: "preregister_complete", workspaceId: beta.id,
      targetType: "study", targetId: "y", relatedStudyId: "y", payload: { studyTitle: "Other" },
    });

    // Active workspace = Alpha (earliest owner) → only its event shows.
    const caller = createCaller({ authUser: authUser("ext_a") });
    const activity = await caller.workspace.recentActivity({ limit: 15 });
    expect(activity.map((a) => a.studyTitle)).toEqual(["Mine"]);
    expect(activity[0]).toMatchObject({ type: "preregister_complete", studyTitle: "Mine" });
  });
});

describe("studies.runningOverview + runningList (Running tab, N4.1)", () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  type Recruiting = {
    studyId: string;
    sessionId: string;
    versionId: string;
    condBySlug: Map<string, string>;
  };

  /** Publish + open recruitment on a fresh study with the named conditions. */
  async function seedRecruiting(
    caller: ReturnType<typeof createCaller>,
    title: string,
    conditionNames: string[],
  ): Promise<Recruiting> {
    const { id } = await caller.studies.create({ kind: "blank", title });
    for (const name of conditionNames) await caller.studies.addCondition({ studyId: id, name });
    await caller.studies.publish({ studyId: id });
    await caller.studies.openRecruitment({ studyId: id });
    const open = await resolveOpenRecruitment(id);
    const [pub] = await db
      .select()
      .from(experimentVersion)
      .where(and(eq(experimentVersion.experimentId, id), eq(experimentVersion.kind, "published")));
    const conds = await db.select().from(condition).where(eq(condition.experimentVersionId, pub.id));
    return {
      studyId: id,
      sessionId: open!.recruitmentSessionId,
      versionId: pub.id,
      condBySlug: new Map(conds.map((c) => [c.slug, c.id])),
    };
  }

  /** Insert `n` completed RUN responses for a condition slug at a given time. */
  async function insertCompleted(s: Recruiting, slug: string, completedAt: Date, n = 1) {
    for (let i = 0; i < n; i++) {
      await db.insert(response).values({
        id: ulid(),
        recruitmentSessionId: s.sessionId,
        experimentVersionId: s.versionId,
        conditionId: s.condBySlug.get(slug)!,
        mode: "run",
        status: "completed",
        completedAt,
      });
    }
  }

  it("is empty + zeroed when nothing is recruiting (a draft must not appear)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    await caller.studies.create({ kind: "blank", title: "Draft only" });

    expect(await caller.studies.runningList()).toEqual([]);
    expect(await caller.studies.runningOverview()).toEqual({
      recruitingStudies: 0,
      responsesToday: 0,
      responsesThisWeek: 0,
      needingAttention: 0,
    });
  });

  it("a balanced, freshly-collecting study reads healthy with its metrics", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const s = await seedRecruiting(caller, "Balanced", ["Control", "Treatment"]);
    await db
      .update(recruitmentSession)
      .set({ currentN: 10, targetN: 100 })
      .where(eq(recruitmentSession.id, s.sessionId));
    const now = Date.now();
    await insertCompleted(s, "control", new Date(now - HOUR), 5);
    await insertCompleted(s, "treatment", new Date(now - HOUR), 5);

    const list = await caller.studies.runningList();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      studyId: s.studyId,
      title: "Balanced",
      conditionCount: 2,
      currentN: 10,
      targetN: 100,
      imbalanced: false,
      status: "healthy",
      conditionBalance: { min: 5, max: 5 },
    });
    expect(list[0].lastResponseAt).not.toBeNull();

    const ov = await caller.studies.runningOverview();
    expect(ov).toMatchObject({
      recruitingStudies: 1,
      needingAttention: 0,
      responsesToday: 10,
      responsesThisWeek: 10,
    });
  });

  it("a quiet study is NOT flagged — response cadence is the researcher's call", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const now = Date.now();

    // Opened 3 days ago, last response 30h ago. We deliberately do NOT flag this:
    // a slow trickle isn't a problem to chase (owner feedback 2026-06-28).
    const quiet = await seedRecruiting(caller, "Quiet", ["Control"]);
    await db
      .update(recruitmentSession)
      .set({ currentN: 4, openedAt: new Date(now - 3 * DAY) })
      .where(eq(recruitmentSession.id, quiet.sessionId));
    await insertCompleted(quiet, "control", new Date(now - 30 * HOUR), 4);

    const byTitle = new Map((await caller.studies.runningList()).map((r) => [r.title, r]));
    expect(byTitle.get("Quiet")).toMatchObject({ status: "healthy" });
    expect((await caller.studies.runningOverview()).needingAttention).toBe(0);
  });

  it("flags imbalance above 20% skew; a single-condition study can't be imbalanced", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const now = Date.now();

    const skew = await seedRecruiting(caller, "Skewed", ["Control", "Treatment"]);
    await insertCompleted(skew, "control", new Date(now - HOUR), 10);
    await insertCompleted(skew, "treatment", new Date(now - HOUR), 3); // (10-3)/10 = 0.7 > 0.2

    const solo = await seedRecruiting(caller, "Solo", ["Control"]);
    await insertCompleted(solo, "control", new Date(now - HOUR), 9);

    const byTitle = new Map((await caller.studies.runningList()).map((r) => [r.title, r]));
    expect(byTitle.get("Skewed")).toMatchObject({
      imbalanced: true,
      status: "imbalanced",
      conditionBalance: { min: 3, max: 10 },
    });
    expect(byTitle.get("Solo")).toMatchObject({
      imbalanced: false,
      conditionCount: 1,
      conditionBalance: null,
      status: "healthy",
    });
  });

  it("status target_reached when the target is met; a null target never 'reaches'", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const now = Date.now();

    // Target met (opened long ago, old responses) → target_reached.
    const done = await seedRecruiting(caller, "Done", ["Control"]);
    await db
      .update(recruitmentSession)
      .set({ currentN: 100, targetN: 100, openedAt: new Date(now - 5 * DAY) })
      .where(eq(recruitmentSession.id, done.sessionId));
    await insertCompleted(done, "control", new Date(now - 40 * HOUR), 6);

    // No target, lots collected → never "target reached".
    const open = await seedRecruiting(caller, "OpenEnded", ["Control"]);
    await db
      .update(recruitmentSession)
      .set({ currentN: 500, targetN: null })
      .where(eq(recruitmentSession.id, open.sessionId));
    await insertCompleted(open, "control", new Date(now - HOUR), 5);

    const byTitle = new Map((await caller.studies.runningList()).map((r) => [r.title, r]));
    expect(byTitle.get("Done")).toMatchObject({ status: "target_reached", targetN: 100, currentN: 100 });
    expect(byTitle.get("OpenEnded")).toMatchObject({ status: "healthy", targetN: null });
  });

  it("only the active workspace's OPEN runnable sessions count (tenant + status scoping)", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    await seedUserWithWorkspace("ext_b", "Beta");
    const callerA = createCaller({ authUser: authUser("ext_a") });
    const callerB = createCaller({ authUser: authUser("ext_b") });

    await seedRecruiting(callerA, "Alpha study", ["Control"]);
    await seedRecruiting(callerB, "Beta study", ["Control"]); // must not leak into Alpha's view
    const paused = await seedRecruiting(callerA, "Paused", ["Control"]);
    await db
      .update(recruitmentSession)
      .set({ status: "paused" })
      .where(eq(recruitmentSession.id, paused.sessionId)); // paused ≠ recruiting

    const listA = await callerA.studies.runningList();
    expect(listA.map((r) => r.title)).toEqual(["Alpha study"]);
    expect((await callerA.studies.runningOverview()).recruitingStudies).toBe(1);
  });

  it("responsesToday is rolling 24h, responsesThisWeek rolling 7d; preview + incomplete excluded", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const now = Date.now();
    const s = await seedRecruiting(caller, "Windows", ["Control"]);
    await insertCompleted(s, "control", new Date(now - 2 * HOUR), 3); // today + week
    await insertCompleted(s, "control", new Date(now - 3 * DAY), 2); // week only
    await insertCompleted(s, "control", new Date(now - 10 * DAY), 4); // neither

    // A preview-mode completion + a started (incomplete) run must both be ignored.
    await db.insert(response).values({
      id: ulid(),
      recruitmentSessionId: s.sessionId,
      experimentVersionId: s.versionId,
      conditionId: s.condBySlug.get("control")!,
      mode: "preview",
      status: "completed",
      completedAt: new Date(now - HOUR),
    });
    await db.insert(response).values({
      id: ulid(),
      recruitmentSessionId: s.sessionId,
      experimentVersionId: s.versionId,
      conditionId: s.condBySlug.get("control")!,
      mode: "run",
      status: "started",
    });

    const ov = await caller.studies.runningOverview();
    expect(ov.responsesToday).toBe(3);
    expect(ov.responsesThisWeek).toBe(5);
  });
});

describe("workspace.topTags + recentForks (deferred dashboard widgets, N5)", () => {
  it("topTags counts study tags across the workspace, most-used first", async () => {
    await seedUserWithWorkspace("ext_a", "Alpha");
    const caller = createCaller({ authUser: authUser("ext_a") });
    const a = await caller.studies.create({ kind: "blank", title: "A" });
    const b = await caller.studies.create({ kind: "blank", title: "B" });
    await caller.studies.setTags({ studyId: a.id, tags: ["misinformation", "trust"] });
    await caller.studies.setTags({ studyId: b.id, tags: ["misinformation"] });

    const tags = await caller.workspace.topTags();
    expect(tags[0]).toEqual({ tag: "misinformation", count: 2 });
    expect(tags.find((t) => t.tag === "trust")).toEqual({ tag: "trust", count: 1 });
  });

  it("recentForks returns only fork events, tenant-scoped", async () => {
    const { workspace: ws } = await seedUserWithWorkspace("ext_a", "Alpha");
    const beta = await seedUserWithWorkspace("ext_b", "Beta");
    await db.insert(activityEvent).values([
      {
        id: ulid(),
        type: "fork",
        workspaceId: ws.id,
        targetType: "study",
        targetId: "s1",
        relatedStudyId: "s1",
        payload: { studyTitle: "Forked One" },
      },
      {
        id: ulid(),
        type: "preregister_complete",
        workspaceId: ws.id,
        targetType: "study",
        targetId: "s2",
        relatedStudyId: "s2",
        payload: { studyTitle: "Not a fork" },
      },
      {
        id: ulid(),
        type: "fork",
        workspaceId: beta.workspace.id,
        targetType: "study",
        targetId: "s3",
        relatedStudyId: "s3",
        payload: { studyTitle: "Beta fork" },
      },
    ]);

    const caller = createCaller({ authUser: authUser("ext_a") });
    const forks = await caller.workspace.recentForks({ limit: 10 });
    expect(forks.map((f) => f.studyTitle)).toEqual(["Forked One"]);
  });
});

describe("studies.withdrawRegistration (ADR-0005 am. 3)", () => {
  /** Create a study, preregister it, and stamp the version as pushed-to-OSF. */
  async function seedPushedStudy(ext: string, ws: string) {
    const { user: u } = await seedUserWithWorkspace(ext, ws);
    const caller = createCaller({ authUser: authUser(ext) });
    const { id } = await caller.studies.create({ kind: "blank", title: "S" });
    await caller.studies.preregister({ studyId: id });
    await db
      .update(experimentVersion)
      .set({
        registryPushStatus: "pushed",
        externalRegistrationUrl: "https://osf.io/rxzqa/",
        externalRegistrationDoi: "10.17605/OSF.IO/RXZQA",
      })
      .where(eq(experimentVersion.kind, "preregistered"));
    return { u, id, caller };
  }

  it("calls the adapter withdraw with the registration DOI + reason for the pushed version", async () => {
    const { u, id, caller } = await seedPushedStudy("ext_a", "Alpha");
    const spy = vi.spyOn(osfRegistryAdapter, "withdraw").mockResolvedValue(undefined);

    const res = await caller.studies.withdrawRegistration({ studyId: id, reason: "Sacrificial test" });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(u.id, "10.17605/OSF.IO/RXZQA", "Sacrificial test");
    spy.mockRestore();
  });

  it("throws NOT_FOUND when the study has no pushed registration", async () => {
    const { user: u } = await seedUserWithWorkspace("ext_b", "Beta");
    void u;
    const caller = createCaller({ authUser: authUser("ext_b") });
    const { id } = await caller.studies.create({ kind: "blank", title: "Unpushed" });
    const spy = vi.spyOn(osfRegistryAdapter, "withdraw").mockResolvedValue(undefined);
    await expect(caller.studies.withdrawRegistration({ studyId: id, reason: "x" })).rejects.toThrow(/No pushed registration/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refreshRegistration syncs the withdrawn flag so getPreregistration reflects it", async () => {
    const { id, caller } = await seedPushedStudy("ext_c", "Gamma");
    expect((await caller.studies.getPreregistration({ studyId: id }))!.withdrawn).toBe(false);

    const spy = vi
      .spyOn(osfRegistryAdapter, "getRegistrationStatus")
      .mockResolvedValue({ doi: "10.17605/OSF.IO/RXZQA", pendingApproval: false, withdrawn: true, public: true });
    const status = await caller.studies.refreshRegistration({ studyId: id });
    expect(status.withdrawn).toBe(true);
    expect((await caller.studies.getPreregistration({ studyId: id }))!.withdrawn).toBe(true);
    spy.mockRestore();
  });
});

describe("studies finished lifecycle (ADR-0054)", () => {
  async function publishedStudy() {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const { id } = await hanna.studies.create({ kind: "blank", title: "Study" });
    await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await hanna.studies.publish({ studyId: id });
    const [ver] = await db.select().from(experimentVersion).where(eq(experimentVersion.experimentId, id)).limit(1);
    return { hanna, id, versionId: ver.id as string };
  }

  async function seedCompletedResponse(versionId: string) {
    const [cond] = await db
      .insert(condition)
      .values({ id: ulid(), experimentVersionId: versionId, slug: "c1", name: "C1", position: 0 })
      .returning();
    const sid = ulid();
    await db.insert(recruitmentSession).values({ id: sid, experimentVersionId: versionId, status: "closed" });
    await db.insert(response).values({
      id: ulid(), recruitmentSessionId: sid, experimentVersionId: versionId, conditionId: cond.id,
      externalPid: null, mode: "run", status: "completed", startedAt: new Date(Date.now() - 60_000), completedAt: new Date(),
    });
  }

  it("setFinished requires at least one completed response", async () => {
    const { hanna, id } = await publishedStudy();
    await expect(hanna.studies.setFinished({ studyId: id, finished: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("setFinished refuses while recruitment is still open", async () => {
    const { hanna, id } = await publishedStudy();
    await hanna.studies.openRecruitment({ studyId: id });
    await expect(hanna.studies.setFinished({ studyId: id, finished: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("finishes when closed + has a completed response; reopen clears it", async () => {
    const { hanna, id, versionId } = await publishedStudy();
    await seedCompletedResponse(versionId);
    const r = await hanna.studies.setFinished({ studyId: id, finished: true });
    expect(r.finishedAt).not.toBeNull();
    expect((await hanna.studies.finishedState({ studyId: id })).finishedAt).not.toBeNull();
    const back = await hanna.studies.setFinished({ studyId: id, finished: false });
    expect(back.finishedAt).toBeNull();
  });

  it("cross-workspace replicate requires the source be finished (Template stays open)", async () => {
    await seedUserWithWorkspace("hanna", "Hanna Lab");
    await seedUserWithWorkspace("sofia", "Sofia Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const sofia = createCaller({ authUser: authUser("sofia") });
    const { id } = await hanna.studies.create({ kind: "blank", title: "Src" });
    await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await hanna.studies.publish({ studyId: id });
    await hanna.studies.setForkable({ studyId: id, forkableBy: "public" });
    // Not finished → Replicate is refused, but Use-as-template still works.
    await expect(sofia.studies.fork({ studyId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const tmpl = await sofia.studies.useAsTemplate({ studyId: id });
    expect(tmpl.id).toBeTruthy();
    // Finish it → Replicate now allowed.
    await db.update(experiment).set({ finishedAt: new Date() }).where(eq(experiment.id, id));
    const { id: forkId } = await sofia.studies.fork({ studyId: id });
    expect(forkId).toBeTruthy();
  });

  it("replicate into a chosen target workspace (global Browse) — validated server-side", async () => {
    const hannaSeed = await seedUserWithWorkspace("hanna", "Hanna Lab");
    const sofiaSeed = await seedUserWithWorkspace("sofia", "Sofia Lab");
    const hanna = createCaller({ authUser: authUser("hanna") });
    const sofia = createCaller({ authUser: authUser("sofia") });
    const { id } = await hanna.studies.create({ kind: "blank", title: "Src" });
    await hanna.studies.addBlock({ studyId: id, source: "core", key: "likert-7", version: "1.0.0" });
    await hanna.studies.publish({ studyId: id });
    await hanna.studies.setForkable({ studyId: id, forkableBy: "public" });
    await db.update(experiment).set({ finishedAt: new Date() }).where(eq(experiment.id, id));

    // Can't target a workspace you don't belong to.
    await expect(
      sofia.studies.fork({ studyId: id, targetWorkspaceId: hannaSeed.workspace.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Explicit target = your own workspace → lands there.
    const { id: forkId } = await sofia.studies.fork({ studyId: id, targetWorkspaceId: sofiaSeed.workspace.id });
    const [exp] = await db.select().from(experiment).where(eq(experiment.id, forkId));
    expect(exp.tenantId).toBe(sofiaSeed.workspace.id);
  });
});
