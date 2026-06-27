import { beforeEach, describe, expect, it, vi } from "vitest";
import { ulid } from "ulid";

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

import { db } from "@/server/db/client";
import { cookieConsent, user } from "@/server/db/schema";
import { getServerConsent } from "@/server/analytics/consent";

async function seedUser(ext: string): Promise<string> {
  const [u] = await db
    .insert(user)
    .values({ externalId: ext, email: `${ext}@e.com`, displayName: ext })
    .returning();
  return u.id;
}

beforeEach(async () => {
  await db.delete(cookieConsent);
  await db.delete(user);
});

describe("getServerConsent (ADR-0074)", () => {
  it("returns 'necessary' when the user has no consent row (never assume consent)", async () => {
    const u = await seedUser("noconsent");
    expect(await getServerConsent(u)).toBe("necessary");
  });

  it("returns 'necessary' for a null/undefined user id", async () => {
    expect(await getServerConsent(null)).toBe("necessary");
    expect(await getServerConsent(undefined)).toBe("necessary");
  });

  it("returns the newest recorded choice", async () => {
    const u = await seedUser("hanna");
    await db.insert(cookieConsent).values({
      id: ulid(),
      userId: u,
      choice: "necessary",
      cookiePolicyVersion: 1,
      recordedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await db.insert(cookieConsent).values({
      id: ulid(),
      userId: u,
      choice: "all",
      cookiePolicyVersion: 1,
      recordedAt: new Date("2026-02-01T00:00:00Z"),
    });
    expect(await getServerConsent(u)).toBe("all");
  });
});
