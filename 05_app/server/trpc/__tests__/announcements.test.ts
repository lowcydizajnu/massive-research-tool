import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { eq } from "drizzle-orm";

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import { releaseAnnouncement, user } from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(ext: string): AuthUser {
  return { id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true };
}
async function seedUser(ext: string): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext }).returning();
  return u.id;
}
async function seedAnnouncement(id: string, publishedAt: Date, by: string): Promise<void> {
  await db.insert(releaseAnnouncement).values({ id, title: id, body: `body ${id}`, publishedAt, publishedByUserId: by });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(releaseAnnouncement);
  await db.delete(user);
  delete process.env.ADMIN_USER_IDS;
});
afterEach(() => {
  delete process.env.ADMIN_USER_IDS;
});

describe("announcements.unreadCount", () => {
  it("counts all when the user has never opened the panel (null last-seen)", async () => {
    const uid = await seedUser("hanna");
    await seedAnnouncement("a1", new Date("2026-06-01"), uid);
    await seedAnnouncement("a2", new Date("2026-06-02"), uid);
    const caller = createCaller({ authUser: authUser("hanna") });
    expect(await caller.announcements.unreadCount()).toBe(2);
  });

  it("counts only announcements newer than last-seen", async () => {
    const uid = await seedUser("hanna");
    await seedAnnouncement("a1", new Date("2026-06-01"), uid);
    await seedAnnouncement("a2", new Date("2026-06-10"), uid);
    await db.update(user).set({ lastSeenAnnouncementAt: new Date("2026-06-05") }).where(eq(user.id, uid));
    const caller = createCaller({ authUser: authUser("hanna") });
    expect(await caller.announcements.unreadCount()).toBe(1);
  });
});

describe("announcements.markAllRead", () => {
  it("sets the user's last-seen, dropping unread to zero", async () => {
    const uid = await seedUser("hanna");
    await seedAnnouncement("a1", new Date("2026-06-01"), uid);
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.announcements.markAllRead();
    const [u] = await db.select().from(user).where(eq(user.id, uid));
    expect(u.lastSeenAnnouncementAt).toBeInstanceOf(Date);
    expect(await caller.announcements.unreadCount()).toBe(0);
  });
});

describe("announcements.create", () => {
  it("forbids non-admins", async () => {
    await seedUser("hanna");
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.announcements.create({ title: "Hi", body: "x" })).rejects.toThrow();
  });

  it("lets an allow-listed admin publish, and it surfaces in list", async () => {
    await seedUser("owner");
    process.env.ADMIN_USER_IDS = "owner";
    const caller = createCaller({ authUser: authUser("owner") });
    const { id } = await caller.announcements.create({ title: "Launch", body: "**hello**", learnMoreUrl: "https://x.test" });
    expect(id).toBeTruthy();
    const rows = await caller.announcements.list({ limit: 20 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Launch", body: "**hello**", learnMoreUrl: "https://x.test" });
  });
});
