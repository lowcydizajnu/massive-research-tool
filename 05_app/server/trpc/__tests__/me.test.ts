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
import {
  condition,
  experiment,
  experimentVersion,
  member,
  recruitmentSession,
  registry,
  registryConnection,
  response,
  savedRecord,
  user,
  workspace,
} from "@/server/db/schema";
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

beforeEach(async () => {
  await db.update(experiment).set({ currentVersionId: null });
  // FK order: response → recruitment/condition → versions → experiments.
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(savedRecord);
  await db.delete(registryConnection);
  await db.delete(registry);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
  await db.insert(user).values({ externalId: "hanna", email: "hanna@e.com", displayName: "Hanna" });
});

describe("me.emailPrefs / setMarketingOptIn (feedback #9)", () => {
  it("defaults marketingOptIn to false", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    const prefs = await caller.me.emailPrefs();
    expect(prefs.marketingOptIn).toBe(false);
  });

  it("round-trips marketingOptIn true then false", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });

    const setOn = await caller.me.setMarketingOptIn({ optIn: true });
    expect(setOn.optIn).toBe(true);
    expect((await caller.me.emailPrefs()).marketingOptIn).toBe(true);

    const setOff = await caller.me.setMarketingOptIn({ optIn: false });
    expect(setOff.optIn).toBe(false);
    expect((await caller.me.emailPrefs()).marketingOptIn).toBe(false);
  });

  it("does not affect the engagement-email opt-out", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.me.setMarketingOptIn({ optIn: true });
    const prefs = await caller.me.emailPrefs();
    expect(prefs.engagementEmailsOptedOut).toBe(false);
    expect(prefs.marketingOptIn).toBe(true);
  });
});

describe("me.gettingStarted (Start-here checklist)", () => {
  it("fresh account: every step false, no latest study", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    const s = await caller.me.gettingStarted();
    expect(s).toEqual({
      createdStudy: false,
      addedBlock: false,
      preregisteredOrPublished: false,
      openedRecruitment: false,
      firstResults: false,
      savedStudy: false,
      invitedTeammate: false,
      connectedOsf: false,
      latestStudy: null,
    });
  });

  it("each step derives from real rows — no stored progress", async () => {
    const [hanna] = await db.select({ id: user.id }).from(user).where(eq(user.externalId, "hanna"));
    const [ws] = await db.insert(workspace).values({ name: "Hanna Lab", slug: "hanna-lab", ownerId: hanna.id }).returning();
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: hanna.id, title: "First study" }).returning();
    // A block-less draft: created yes, built no.
    await db
      .insert(experimentVersion)
      .values({ experimentId: exp.id, versionNumber: 1, kind: "autosave", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: hanna.id });

    const caller = createCaller({ authUser: authUser("hanna") });
    let s = await caller.me.gettingStarted();
    expect(s.createdStudy).toBe(true);
    expect(s.addedBlock).toBe(false);
    expect(s.preregisteredOrPublished).toBe(false);
    expect(s.latestStudy).toEqual({ studyId: exp.id, workspaceId: ws.id });

    // Published version WITH a block → built + preregistered/published flip.
    const [v2] = await db
      .insert(experimentVersion)
      .values({
        experimentId: exp.id,
        versionNumber: 2,
        kind: "published",
        name: "v1",
        definitionSnapshot: { blocks: [{ instanceId: "b1", source: "core", key: "likert-7", version: "1.0.0", config: {} }] },
        moduleVersionLocks: {},
        createdBy: hanna.id,
      })
      .returning();
    // Recruitment + one completed run response → recruit + results flip.
    await db.insert(recruitmentSession).values({ id: "rs1", experimentVersionId: v2.id });
    await db.insert(condition).values({ id: "c1", experimentVersionId: v2.id, slug: "control", name: "Control", position: 0 });
    await db.insert(response).values({ id: "r1", recruitmentSessionId: "rs1", experimentVersionId: v2.id, conditionId: "c1", mode: "run", status: "completed" });
    // Saved study, pending teammate invite, OSF connection.
    await db.insert(savedRecord).values({ id: "sv1", userId: hanna.id, experimentId: exp.id });
    await db.insert(member).values({ workspaceId: ws.id, userId: null, role: "editor", status: "invited", invitedEmail: "ada@e.com" });
    await db.insert(registry).values({ id: "reg-osf", key: "osf", name: "OSF" });
    await db.insert(registryConnection).values({ id: "rc1", userId: hanna.id, registryId: "reg-osf", accessToken: "enc" });

    s = await caller.me.gettingStarted();
    expect(s).toEqual({
      createdStudy: true,
      addedBlock: true,
      preregisteredOrPublished: true,
      openedRecruitment: true,
      firstResults: true,
      savedStudy: true,
      invitedTeammate: true,
      connectedOsf: true,
      latestStudy: { studyId: exp.id, workspaceId: ws.id },
    });
  });

  it("a demo teammate or a revoked OSF connection doesn't count", async () => {
    const [hanna] = await db.select({ id: user.id }).from(user).where(eq(user.externalId, "hanna"));
    const [ws] = await db.insert(workspace).values({ name: "Hanna Lab", slug: "hanna-lab", ownerId: hanna.id }).returning();
    await db.insert(member).values({ workspaceId: ws.id, userId: null, role: "editor", status: "invited", invitedEmail: "maya@demo", isDemo: true });
    await db.insert(registry).values({ id: "reg-osf", key: "osf", name: "OSF" });
    await db.insert(registryConnection).values({ id: "rc1", userId: hanna.id, registryId: "reg-osf", accessToken: "enc", revokedAt: new Date() });

    const caller = createCaller({ authUser: authUser("hanna") });
    const s = await caller.me.gettingStarted();
    expect(s.invitedTeammate).toBe(false);
    expect(s.connectedOsf).toBe(false);
  });

  it("a Preview recruitment session (on the draft version) does NOT mark recruitment done", async () => {
    const [hanna] = await db.select({ id: user.id }).from(user).where(eq(user.externalId, "hanna"));
    const [ws] = await db.insert(workspace).values({ name: "Hanna Lab", slug: "hanna-lab", ownerId: hanna.id }).returning();
    const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: hanna.id, title: "Draft" }).returning();
    // Preview opens a recruitment session on the AUTOSAVE (draft) version.
    const [draft] = await db
      .insert(experimentVersion)
      .values({ experimentId: exp.id, versionNumber: 1, kind: "autosave", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: hanna.id })
      .returning();
    await db.insert(recruitmentSession).values({ id: "rs-preview", experimentVersionId: draft.id, status: "open" });

    const caller = createCaller({ authUser: authUser("hanna") });
    const s = await caller.me.gettingStarted();
    expect(s.openedRecruitment).toBe(false); // a preview artifact, not real recruitment
  });
});

describe("me replication widgets (ADR-0018)", () => {
  it("both directions: my forks + others' forks of my studies", async () => {
    // Hanna owns "Original"; Ada forks it into "Ada's replica" in her own workspace.
    const [hanna] = await db.select({ id: user.id }).from(user).where(eq(user.externalId, "hanna"));
    const [ada] = await db.insert(user).values({ externalId: "ada", email: "ada@e.com", displayName: "Ada" }).returning();
    const [wsH] = await db.insert(workspace).values({ name: "Hanna Lab", slug: "hanna-lab", ownerId: hanna.id }).returning();
    const [wsA] = await db.insert(workspace).values({ name: "Ada Lab", slug: "ada-lab", ownerId: ada.id }).returning();
    const [orig] = await db.insert(experiment).values({ tenantId: wsH.id, ownerId: hanna.id, title: "Original" }).returning();
    const [origVer] = await db
      .insert(experimentVersion)
      .values({ experimentId: orig.id, versionNumber: 1, kind: "published", name: "v1", definitionSnapshot: { blocks: [] }, moduleVersionLocks: {}, createdBy: hanna.id })
      .returning();
    // A fork sets BOTH fork columns (schema CHECK: half-null forbidden).
    await db.insert(experiment).values({
      tenantId: wsA.id,
      ownerId: ada.id,
      title: "Ada's replica",
      forkOfExperimentId: orig.id,
      forkOfVersionId: origVer.id,
    });

    // Hanna sees the replication OF her study.
    const hannaCaller = createCaller({ authUser: authUser("hanna") });
    const ofMine = await hannaCaller.me.replicationsOfMine({});
    expect(ofMine).toHaveLength(1);
    expect(ofMine[0]).toMatchObject({ originalTitle: "Original", replicatedByName: "Ada" });
    // ...and none the other way (she replicated nothing).
    expect(await hannaCaller.me.myReplications({})).toEqual([]);

    // Ada sees the study she replicated, linked back to the original.
    const adaCaller = createCaller({ authUser: authUser("ada") });
    const mine = await adaCaller.me.myReplications({});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Ada's replica", originalTitle: "Original", workspaceName: "Ada Lab" });
    expect(await adaCaller.me.replicationsOfMine({})).toEqual([]);
  });
});
