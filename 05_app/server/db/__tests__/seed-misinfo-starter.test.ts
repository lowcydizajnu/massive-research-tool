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
import {
  condition,
  experiment,
  experimentVersion,
  member,
  user,
  workspace,
  workspaceTemplate,
} from "@/server/db/schema";
import {
  seedAbStarter,
  seedMisinfoStarter,
  seedPilotStarter,
  seedStarters,
} from "@/server/db/seed-misinfo-starter";
import { readBlocks } from "@/server/modules/blocks";
import { readConsent } from "@/server/modules/consent";
import {
  STARTER_AB_EXPERIMENT_ID,
  STARTER_AB_TEMPLATE_ID,
  STARTER_AB_VERSION_ID,
  STARTER_MISINFO_EXPERIMENT_ID,
  STARTER_MISINFO_TEMPLATE_ID,
  STARTER_MISINFO_VERSION_ID,
  STARTER_PILOT_EXPERIMENT_ID,
  STARTER_PILOT_TEMPLATE_ID,
  STARTER_PILOT_VERSION_ID,
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

    // Source study is PUBLIC + forkable with a published version (#7B), so it
    // surfaces in /browse + Explore's community band as a real replicable study.
    const [exp] = await db.select().from(experiment).where(eq(experiment.id, STARTER_MISINFO_EXPERIMENT_ID));
    expect(exp?.tenantId).toBe(SYSTEM_WORKSPACE_ID);
    expect(exp?.forkableBy).toBe("public");
    expect(exp?.currentVersionId).toBe(STARTER_MISINFO_VERSION_ID);

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, STARTER_MISINFO_VERSION_ID));
    expect(ver?.kind).toBe("published");
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

describe("seedAbStarter", () => {
  it("seeds a public A/B source study + published version + two arms + starter template", async () => {
    await seedAbStarter();

    // Source study is PUBLIC + forkable with a published version.
    const [exp] = await db.select().from(experiment).where(eq(experiment.id, STARTER_AB_EXPERIMENT_ID));
    expect(exp?.tenantId).toBe(SYSTEM_WORKSPACE_ID);
    expect(exp?.forkableBy).toBe("public");
    expect(exp?.currentVersionId).toBe(STARTER_AB_VERSION_ID);

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, STARTER_AB_VERSION_ID));
    expect(ver?.kind).toBe("published");
    expect((ver?.moduleVersionLocks as unknown[]).length).toBeGreaterThan(0);

    // Two random-assignment arms (cloned into the fork by templates.useTemplate).
    const arms = await db.select().from(condition).where(eq(condition.experimentVersionId, STARTER_AB_VERSION_ID));
    expect(arms).toHaveLength(2);
    const slugs = arms.map((a) => a.slug).sort();
    expect(slugs).toEqual(["version-a", "version-b"]);

    // Each arm's stimulus screen is condition-gated so the design is real A/B.
    const blocks = readBlocks(ver?.definitionSnapshot);
    const gated = blocks.filter((b) => (b.visibility?.showIfCondition ?? []).length > 0);
    expect(gated).toHaveLength(2);
    expect(gated.flatMap((b) => b.visibility?.showIfCondition ?? []).sort()).toEqual([
      "version-a",
      "version-b",
    ]);
    // Shared outcome measures everyone answers.
    expect(blocks.map((b) => b.key)).toContain("likert-7");
    expect(blocks.map((b) => b.key)).toContain("share-intention");

    const [tpl] = await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, STARTER_AB_TEMPLATE_ID));
    expect(tpl?.starter).toBe(true);
    expect(tpl?.shareScope).toBe("public");
    expect(tpl?.sourceVersionId).toBe(STARTER_AB_VERSION_ID);
    expect(tpl?.workspaceId).toBe(SYSTEM_WORKSPACE_ID);
  });

  it("is idempotent — re-running creates no duplicate arms or template", async () => {
    await seedAbStarter();
    await seedAbStarter();
    expect(
      await db.select().from(condition).where(eq(condition.experimentVersionId, STARTER_AB_VERSION_ID)),
    ).toHaveLength(2);
    expect(
      await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, STARTER_AB_TEMPLATE_ID)),
    ).toHaveLength(1);
  });
});

describe("seedPilotStarter", () => {
  it("seeds a public pilot source study + published version + starter template", async () => {
    await seedPilotStarter();

    const [exp] = await db.select().from(experiment).where(eq(experiment.id, STARTER_PILOT_EXPERIMENT_ID));
    expect(exp?.forkableBy).toBe("public");
    expect(exp?.currentVersionId).toBe(STARTER_PILOT_VERSION_ID);

    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, STARTER_PILOT_VERSION_ID));
    expect(ver?.kind).toBe("published");

    // A draft scale (several Likert/VAS items) + an open-text feedback question.
    const blocks = readBlocks(ver?.definitionSnapshot);
    const keys = blocks.map((b) => b.key);
    expect(keys.filter((k) => k === "likert-7").length).toBeGreaterThanOrEqual(3);
    expect(keys).toContain("vas");
    expect(keys).toContain("free-text");
    // The scale items share one "Draft scale" screen-group.
    const grouped = blocks.filter((b) => b.groupId === "draft-scale");
    expect(grouped.length).toBeGreaterThanOrEqual(3);

    const [tpl] = await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, STARTER_PILOT_TEMPLATE_ID));
    expect(tpl?.starter).toBe(true);
    expect(tpl?.shareScope).toBe("public");
    expect(tpl?.sourceVersionId).toBe(STARTER_PILOT_VERSION_ID);
  });
});

describe("seedStarters", () => {
  it("seeds all three starters and is idempotent", async () => {
    await seedStarters();
    await seedStarters();

    for (const id of [STARTER_MISINFO_TEMPLATE_ID, STARTER_AB_TEMPLATE_ID, STARTER_PILOT_TEMPLATE_ID]) {
      expect(await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.id, id))).toHaveLength(1);
    }
    // Single shared system account across all three.
    expect(await db.select().from(user).where(eq(user.id, SYSTEM_USER_ID))).toHaveLength(1);
    expect(await db.select().from(member).where(eq(member.workspaceId, SYSTEM_WORKSPACE_ID))).toHaveLength(1);
  });
});
