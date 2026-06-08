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

describe("profile.get / update (V1.12 A2)", () => {
  it("round-trips fields and normalizes empty strings to null", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.profile.update({
      fullName: "Hanna Kowalczyk",
      affiliation: "  Jagiellonian University  ",
      orcid: "0000-0002-1825-0097",
      researchAreas: ["misinformation", "trust"],
      bio: "",
      websiteUrl: "https://hanna.example",
    });
    const p = await caller.profile.get();
    expect(p.fullName).toBe("Hanna Kowalczyk");
    expect(p.affiliation).toBe("Jagiellonian University"); // trimmed
    expect(p.orcid).toBe("0000-0002-1825-0097");
    expect(p.researchAreas).toEqual(["misinformation", "trust"]);
    expect(p.bio).toBeNull(); // empty → null
    expect(p.websiteUrl).toBe("https://hanna.example");
  });

  it("rejects a malformed ORCID", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.profile.update({ orcid: "1234-5678" })).rejects.toThrow();
  });

  it("rejects a non-http website URL", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    await expect(caller.profile.update({ websiteUrl: "ftp://nope" })).rejects.toThrow();
  });

  it("accepts the ORCID checksum 'X' terminator", async () => {
    const caller = createCaller({ authUser: authUser("hanna") });
    await caller.profile.update({ orcid: "0000-0002-1694-233X" });
    expect((await caller.profile.get()).orcid).toBe("0000-0002-1694-233X");
  });
});
