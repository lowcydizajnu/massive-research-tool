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
function authUser(ext: string): AuthUser {
  return { id: ext, email: `${ext}@e.com`, displayName: ext, avatarUrl: null, hasCompletedOnboarding: true };
}
async function seedUser(ext: string, isAdmin = false): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: ext, email: `${ext}@e.com`, displayName: ext, isAdmin }).returning();
  return u.id;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(user);
  delete process.env.ADMIN_USER_IDS;
});

describe("view-as (ADR-0075)", () => {
  it("an admin impersonating a researcher reads AS the target and is blocked from mutations", async () => {
    await seedUser("boss", true);
    const hanna = await seedUser("hanna", false);
    const caller = createCaller({ authUser: authUser("boss"), viewAsUserId: hanna });

    // Resolves as the target: viewingAs is set, and isAdmin reflects the TARGET (false).
    expect(await caller.me.viewingAs()).toMatchObject({ targetEmail: "hanna@e.com" });
    expect(await caller.me.isAdmin()).toBe(false);

    // All mutations are blocked while impersonating.
    await expect(caller.announcements.markAllRead()).rejects.toThrow(/read-only/i);
  });

  it("ignores the view-as cookie when the real caller is NOT an admin", async () => {
    const hanna = await seedUser("hanna", false);
    await seedUser("mallory", false);
    const caller = createCaller({ authUser: authUser("mallory"), viewAsUserId: hanna });

    expect(await caller.me.viewingAs()).toBeNull();
    // Not impersonating → mutations work normally.
    await expect(caller.announcements.markAllRead()).resolves.toMatchObject({ ok: true });
  });

  it("does not impersonate when the target is the admin themselves", async () => {
    const boss = await seedUser("boss", true);
    const caller = createCaller({ authUser: authUser("boss"), viewAsUserId: boss });
    expect(await caller.me.viewingAs()).toBeNull();
    expect(await caller.me.isAdmin()).toBe(true);
  });
});
