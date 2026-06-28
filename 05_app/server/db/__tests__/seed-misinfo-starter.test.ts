import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

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
import { experiment, experimentVersion, member, user, workspace, workspaceTemplate } from "@/server/db/schema";
import { seedMisinfoStarter } from "@/server/db/seed-misinfo-starter";
import { readBlocks } from "@/server/modules/blocks";
import { readConsent } from "@/server/modules/consent";
import {
  STARTER_MISINFO_EXPERIMENT_ID,
  STARTER_MISINFO_TEMPLATE_ID,
  STARTER_MISINFO_VERSION_ID,
  SYSTEM_USER_ID,
  SYSTEM_WORKSPACE_ID,
} from "@/lib/system/starter";

describe("seedMisinfoStarter", () => {
  it("seeds an app-owned system account + public starter template", async () => {
    await seedMisinfoStarter();

    const [u] = await db.select().from(user).where(eq(user.id, SYSTEM_USER_ID));
    expect(u?.isSystem).toBe(true);

    const [ws] = await db.select().from(workspace).where(eq(workspace.id, SYSTEM_WORKSPACE_ID));
    expect(ws?.isSystem).toBe(true);

    const members = await db.select().from(member).where(eq(member.workspaceId, SYSTEM_WORKSPACE_ID));
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");

    // Source study stays PRIVATE (only the template is discoverable).
    const [exp] = await db.select().from(experiment).where(eq(experiment.id, STARTER_MISINFO_EXPERIMENT_ID));
    expect(exp?.tenantId).toBe(SYSTEM_WORKSPACE_ID);
    expect(exp?.forkableBy).toBe("private");
    expect(exp?.currentVersionId).toBe(STARTER_MISINFO_VERSION_ID);

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, STARTER_MISINFO_VERSION_ID));
    expect(ver?.kind).toBe("named");
    expect((ver?.moduleVersionLocks as unknown[]).length).toBeGreaterThan(0);

    // The curated misinformation block set: 2 measured items + quality + framing.
    const blocks = readBlocks(ver?.definitionSnapshot);
    const keys = blocks.map((b) => b.key);
    expect(keys.filter((k) => k === "social-post")).toHaveLength(2);
    expect(keys.filter((k) => k === "accuracy-confidence")).toHaveLength(2);
    expect(keys.filter((k) => k === "share-intention")).toHaveLength(2);
    expect(keys).toContain("attention-check");
    expect(keys).toContain("text");
    // One false + one true stimulus (a discriminable design).
    const veracities = blocks
      .filter((b) => b.key === "social-post")
      .map((b) => (b.config as { veracityGroundTruth?: string }).veracityGroundTruth);
    expect(veracities).toContain("false");
    expect(veracities).toContain("true");

    // Custom consent rides the snapshot.
    expect(readConsent(ver?.definitionSnapshot).body).toMatch(/social-media/i);

    const [tpl] = await db
      .select()
      .from(workspaceTemplate)
      .where(eq(workspaceTemplate.id, STARTER_MISINFO_TEMPLATE_ID));
    expect(tpl?.starter).toBe(true);
    expect(tpl?.shareScope).toBe("public");
    expect(tpl?.sourceVersionId).toBe(STARTER_MISINFO_VERSION_ID);
    expect(tpl?.workspaceId).toBe(SYSTEM_WORKSPACE_ID);
  });

  it("is idempotent — re-running creates no duplicates", async () => {
    await seedMisinfoStarter();
    await seedMisinfoStarter();

    expect(await db.select().from(user).where(eq(user.id, SYSTEM_USER_ID))).toHaveLength(1);
    expect(await db.select().from(workspace).where(eq(workspace.id, SYSTEM_WORKSPACE_ID))).toHaveLength(1);
    expect(await db.select().from(member).where(eq(member.workspaceId, SYSTEM_WORKSPACE_ID))).toHaveLength(1);
    expect(await db.select().from(experiment).where(eq(experiment.id, STARTER_MISINFO_EXPERIMENT_ID))).toHaveLength(1);
    expect(
      await db.select().from(experimentVersion).where(eq(experimentVersion.id, STARTER_MISINFO_VERSION_ID)),
    ).toHaveLength(1);
    expect(
      await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, STARTER_MISINFO_TEMPLATE_ID)),
    ).toHaveLength(1);
  });
});
