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
const authUser = (ext: string): AuthUser => ({
  id: ext,
  email: `${ext}@e.com`,
  displayName: ext,
  avatarUrl: null,
  hasCompletedOnboarding: true,
});

beforeEach(async () => {
  await db.update(experiment).set({ currentVersionId: null });
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
