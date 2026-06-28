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

import { db } from "@/server/db/client";
import { emailSettings, user } from "@/server/db/schema";
import { getEmailSettings, updateEmailSettings } from "@/server/email/settings";

beforeEach(async () => {
  await db.delete(emailSettings);
  await db.delete(user);
});

describe("email settings (ADR-0081)", () => {
  it("creates the singleton with both features OFF on first read", async () => {
    const s = await getEmailSettings();
    expect(s.id).toBe("singleton");
    expect(s.digestEnabled).toBe(false);
    expect(s.nudgeEnabled).toBe(false);
    // Reading again returns the same single row.
    await getEmailSettings();
    expect(await db.select().from(emailSettings)).toHaveLength(1);
  });

  it("patches settings + records who updated", async () => {
    const [u] = await db
      .insert(user)
      .values({ externalId: "boss", email: "boss@e.com", displayName: "Boss" })
      .returning();
    const s = await updateEmailSettings({ digestEnabled: true, digestHourUtc: 14 }, u.id);
    expect(s.digestEnabled).toBe(true);
    expect(s.digestHourUtc).toBe(14);
    expect(s.updatedByUserId).toBe(u.id);
    expect(s.nudgeEnabled).toBe(false); // untouched
  });
});
