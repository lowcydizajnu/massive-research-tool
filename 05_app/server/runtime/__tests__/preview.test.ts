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

import { db } from "@/server/db/client";
import { experiment, experimentVersion, previewToken, user, workspace } from "@/server/db/schema";
import { hashPreviewToken, loadPreviewByToken, newPreviewToken } from "@/server/runtime/preview";

const DAY = 24 * 60 * 60 * 1000;

async function seedStudy(): Promise<string> {
  const [u] = await db.insert(user).values({ externalId: "h", email: "h@e.com", displayName: "H" }).returning();
  const [ws] = await db.insert(workspace).values({ name: "Lab", slug: "lab", ownerId: u.id }).returning();
  const [exp] = await db.insert(experiment).values({ tenantId: ws.id, ownerId: u.id, title: "Draft study" }).returning();
  const [ver] = await db
    .insert(experimentVersion)
    .values({
      experimentId: exp.id,
      versionNumber: 0,
      kind: "autosave",
      name: "Draft",
      definitionSnapshot: { blocks: [{ instanceId: "b1", source: "core", key: "free-text", version: "1.0.0", config: {} }] },
      moduleVersionLocks: {},
      createdBy: u.id,
    })
    .returning();
  await db.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
  return exp.id;
}

async function addToken(studyId: string, token: string, opts: { expiresAt?: Date; revokedAt?: Date } = {}) {
  const [u] = await db.select({ id: user.id }).from(user).limit(1);
  await db.insert(previewToken).values({
    experimentId: studyId,
    tokenHash: hashPreviewToken(token),
    createdBy: u.id,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * DAY),
    revokedAt: opts.revokedAt ?? null,
  });
}

beforeEach(async () => {
  await db.update(experiment).set({ currentVersionId: null });
  await db.delete(previewToken);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(workspace);
  await db.delete(user);
});

describe("preview tokens (V1.12 I)", () => {
  it("hash is deterministic; fresh tokens differ", () => {
    const a = newPreviewToken();
    const b = newPreviewToken();
    expect(a).not.toBe(b);
    expect(hashPreviewToken(a)).toBe(hashPreviewToken(a));
    expect(hashPreviewToken(a)).not.toBe(hashPreviewToken(b));
  });

  it("a valid token loads the study's blocks", async () => {
    const studyId = await seedStudy();
    const token = newPreviewToken();
    await addToken(studyId, token);
    const payload = await loadPreviewByToken(studyId, token);
    expect(payload?.title).toBe("Draft study");
    expect(payload?.blocks).toHaveLength(1);
  });

  it("rejects wrong token, expired, revoked, and wrong study", async () => {
    const studyId = await seedStudy();
    const token = newPreviewToken();
    await addToken(studyId, token);

    expect(await loadPreviewByToken(studyId, "not-the-token")).toBeNull();
    expect(await loadPreviewByToken(studyId, "")).toBeNull();
    expect(await loadPreviewByToken("11111111-1111-1111-1111-111111111111", token)).toBeNull();

    const expired = newPreviewToken();
    await addToken(studyId, expired, { expiresAt: new Date(Date.now() - DAY) });
    expect(await loadPreviewByToken(studyId, expired)).toBeNull();

    const revoked = newPreviewToken();
    await addToken(studyId, revoked, { revokedAt: new Date() });
    expect(await loadPreviewByToken(studyId, revoked)).toBeNull();
  });
});
