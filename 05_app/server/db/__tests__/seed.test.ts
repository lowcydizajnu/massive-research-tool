/**
 * Seed test — the core module catalogue (ADR-0012). Hermetic PGlite, migrated,
 * then seeded; asserts the two modules + versions land and that re-seeding is
 * idempotent.
 */
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
import { moduleTable, moduleVersion } from "@/server/db/schema";
import { seedCoreModules } from "@/server/db/seed-core";

beforeEach(async () => {
  await db.delete(moduleVersion);
  await db.delete(moduleTable);
});

describe("seedCoreModules", () => {
  it("seeds the core modules with their versions (social-post has v1 + v2)", async () => {
    await seedCoreModules();

    const mods = await db.select().from(moduleTable);
    expect(mods.map((m) => `${m.source}/${m.key}`).sort()).toEqual([
      "core/accuracy-confidence",
      "core/address",
      "core/attention-check",
      "core/audio-record",
      "core/constant-sum",
      "core/contact",
      "core/date",
      "core/demographics",
      "core/drill-down",
      "core/dropdown",
      "core/email",
      "core/field-group",
      "core/free-text",
      "core/image",
      "core/likert-7",
      "core/link",
      "core/matrix-grid",
      "core/maxdiff",
      "core/multiple-choice",
      "core/nps",
      "core/number",
      "core/phone",
      "core/picture-choice",
      "core/ranking",
      "core/rating-stars",
      "core/reaction-time",
      "core/semantic-differential",
      "core/share-intention",
      "core/side-by-side",
      "core/slider",
      "core/social-post",
      "core/text",
      "core/url",
      "core/vas",
      "core/video",
      "core/yes-no",
    ]);

    const versions = await db.select().from(moduleVersion);
    expect(versions).toHaveLength(37); // +5 Wave 1 choice & judgment blocks (2026-06-13)

    const social = mods.find((m) => m.key === "social-post")!;
    const socialVersions = versions
      .filter((v) => v.moduleId === social.id)
      .map((v) => v.version)
      .sort();
    expect(socialVersions).toEqual(["1.0.0", "2.0.0"]);
    expect((versions[0].schema as Record<string, unknown>).type).toBe("object");
  });

  it("is idempotent across repeated runs", async () => {
    await seedCoreModules();
    await seedCoreModules();
    expect(await db.select().from(moduleTable)).toHaveLength(36);
    expect(await db.select().from(moduleVersion)).toHaveLength(37);
  });
});
