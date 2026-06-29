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
import { user } from "@/server/db/schema";
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
