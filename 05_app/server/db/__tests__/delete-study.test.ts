import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// In-memory pglite with the real migrations applied (same harness as
// delete-demo / delete-responses). The real FK constraints mean a wrong delete
// ORDER throws — so this test guards the ordering, not just the end state.
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
import { deleteStudy, StudyNotFoundError, TemplateExistsError } from "@/server/db/delete-study";
import {
  comment,
  condition,
  experiment,
  experimentVersion,
  previewToken,
  qualityFlag,
  recruitmentSession,
  response,
  responseItem,
  studyPresence,
  user,
  workspace,
  workspaceTemplate,
} from "@/server/db/schema";

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${seq++}`;

async function seedUserWs() {
  const [u] = await db
    .insert(user)
    .values({ externalId: uniq("clerk"), email: `${uniq("u")}@e.com`, displayName: "U" })
    .returning();
  const [ws] = await db.insert(workspace).values({ name: "W", slug: uniq("w"), ownerId: u.id }).returning();
  return { u, ws };
}

/** A study with one version + condition + open session. */
async function seedStudy(wsId: string, ownerId: string, title = "Study") {
  const experimentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(experiment).values({ id: experimentId, tenantId: wsId, ownerId, title, isDemo: false });
  await db.insert(experimentVersion).values({
    id: versionId,
    experimentId,
    createdBy: ownerId,
    versionNumber: 1,
    kind: "published",
    name: "v1",
    definitionSnapshot: { blocks: [] },
    moduleVersionLocks: [],
  });
  await db.update(experiment).set({ currentVersionId: versionId }).where(eq(experiment.id, experimentId));
  const sessionId = uniq("rec");
  const conditionId = uniq("cond");
  await db.insert(recruitmentSession).values({ id: sessionId, experimentVersionId: versionId, status: "open" });
  await db.insert(condition).values({ id: conditionId, experimentVersionId: versionId, slug: "c", name: "C", position: 0 });
  return { experimentId, versionId, sessionId, conditionId };
}

async function seedResponse(s: { versionId: string; sessionId: string; conditionId: string }) {
  const id = uniq("r");
  await db.insert(response).values({
    id,
    recruitmentSessionId: s.sessionId,
    experimentVersionId: s.versionId,
    conditionId: s.conditionId,
    mode: "run",
    status: "completed",
    completedAt: new Date(),
  });
  await db.insert(responseItem).values({
    id: uniq("item"),
    responseId: id,
    blockInstanceId: "b1",
    blockPosition: 0,
    moduleSource: "core",
    moduleKey: "likert-7",
    moduleVersion: "1.0.0",
    answer: { value: 5 },
  });
  return id;
}

describe("deleteStudy", () => {
  it("hard-deletes the whole study graph, leaves other workspaces' studies untouched", async () => {
    const { u, ws } = await seedUserWs();
    const s = await seedStudy(ws.id, u.id, "Delete me");
    const respId = await seedResponse(s);
    // RESTRICT referrers delete-demo skipped / extras, to exercise the order:
    await db.insert(qualityFlag).values({
      id: uniq("qf"), workspaceId: ws.id, experimentId: s.experimentId, responseId: respId, flagKind: "manual", severity: "low",
    });
    await db.insert(qualityFlag).values({
      id: uniq("qf"), workspaceId: ws.id, experimentId: s.experimentId, flagKind: "manual", severity: "low", // null responseId
    });
    await db.insert(comment).values({
      id: uniq("cm"), workspaceId: ws.id, targetType: "study", targetId: s.experimentId, experimentId: s.experimentId, authorUserId: u.id, bodyMd: "hi",
    });
    await db.insert(previewToken).values({ experimentId: s.experimentId, tokenHash: uniq("tok"), createdBy: u.id, expiresAt: new Date(Date.now() + 1e6) });
    await db.insert(studyPresence).values({ studyId: s.experimentId, userId: u.id });

    // A different workspace's study that must be untouched.
    const other = await seedUserWs();
    const os = await seedStudy(other.ws.id, other.u.id, "Survivor");
    const otherResp = await seedResponse(os);

    const res = await deleteStudy(s.experimentId, ws.id);
    expect(res.responses).toBe(1);
    expect(res.versions).toBe(1);

    // Everything in the deleted study is gone.
    expect(await db.select().from(experiment).where(eq(experiment.id, s.experimentId))).toHaveLength(0);
    expect(await db.select().from(experimentVersion).where(eq(experimentVersion.id, s.versionId))).toHaveLength(0);
    expect(await db.select().from(condition).where(eq(condition.experimentVersionId, s.versionId))).toHaveLength(0);
    expect(await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, s.sessionId))).toHaveLength(0);
    expect(await db.select().from(response).where(eq(response.id, respId))).toHaveLength(0);
    expect(await db.select().from(qualityFlag).where(eq(qualityFlag.experimentId, s.experimentId))).toHaveLength(0);
    expect(await db.select().from(comment).where(eq(comment.experimentId, s.experimentId))).toHaveLength(0);
    expect(await db.select().from(previewToken).where(eq(previewToken.experimentId, s.experimentId))).toHaveLength(0);
    expect(await db.select().from(studyPresence).where(eq(studyPresence.studyId, s.experimentId))).toHaveLength(0);

    // The other workspace's study survives intact.
    expect(await db.select().from(experiment).where(eq(experiment.id, os.experimentId))).toHaveLength(1);
    expect(await db.select().from(response).where(eq(response.id, otherResp))).toHaveLength(1);
  });

  it("severs (not deletes) an external replication's lineage pointers", async () => {
    const { u, ws } = await seedUserWs();
    const s = await seedStudy(ws.id, u.id);
    const other = await seedUserWs();
    const repId = crypto.randomUUID();
    const repVer = crypto.randomUUID();
    await db.insert(experiment).values({
      id: repId, tenantId: other.ws.id, ownerId: other.u.id, title: "Replication", isDemo: false,
      forkOfExperimentId: s.experimentId, forkOfVersionId: s.versionId,
    });
    await db.insert(experimentVersion).values({
      id: repVer, experimentId: repId, createdBy: other.u.id, versionNumber: 1, kind: "published", name: "v1",
      definitionSnapshot: { blocks: [] }, moduleVersionLocks: [],
    });

    const res = await deleteStudy(s.experimentId, ws.id);
    expect(res.externalReplications).toBe(1);

    const [rep] = await db.select().from(experiment).where(eq(experiment.id, repId));
    expect(rep).toBeDefined(); // survives
    expect(rep.forkOfExperimentId).toBeNull();
    expect(rep.forkOfVersionId).toBeNull();
  });

  it("nulls supersedesVersionId + its paired amendment columns together (CHECK-safe)", async () => {
    const { u, ws } = await seedUserWs();
    const s = await seedStudy(ws.id, u.id);
    const other = await seedUserWs();
    const oid = crypto.randomUUID();
    const over = crypto.randomUUID();
    await db.insert(experiment).values({ id: oid, tenantId: other.ws.id, ownerId: other.u.id, title: "Amender", isDemo: false });
    await db.insert(experimentVersion).values({
      id: over, experimentId: oid, createdBy: other.u.id, versionNumber: 2, kind: "published", name: "v2",
      definitionSnapshot: { blocks: [] }, moduleVersionLocks: [],
      supersedesVersionId: s.versionId, changeSummary: "amended", amendmentClassification: "clarification",
    });

    await deleteStudy(s.experimentId, ws.id); // must not violate experiment_version_amendment_consistency
    const [v] = await db.select().from(experimentVersion).where(eq(experimentVersion.id, over));
    expect(v).toBeDefined();
    expect(v.supersedesVersionId).toBeNull();
    expect(v.changeSummary).toBeNull();
  });

  it("gates on saved templates: throws unless deleteTemplates, then deletes them", async () => {
    const { u, ws } = await seedUserWs();
    const s = await seedStudy(ws.id, u.id);
    await db.insert(workspaceTemplate).values({
      id: uniq("tpl"), workspaceId: ws.id, sourceExperimentId: s.experimentId, sourceVersionId: s.versionId, name: "T", createdByUserId: u.id,
    });

    await expect(deleteStudy(s.experimentId, ws.id)).rejects.toBeInstanceOf(TemplateExistsError);
    // study still intact after the guard
    expect(await db.select().from(experiment).where(eq(experiment.id, s.experimentId))).toHaveLength(1);

    const res = await deleteStudy(s.experimentId, ws.id, { deleteTemplates: true });
    expect(res.templates).toBe(1);
    expect(await db.select().from(workspaceTemplate).where(eq(workspaceTemplate.sourceExperimentId, s.experimentId))).toHaveLength(0);
    expect(await db.select().from(experiment).where(eq(experiment.id, s.experimentId))).toHaveLength(0);
  });

  it("dryRun reports counts without deleting; wrong tenant throws StudyNotFoundError", async () => {
    const { u, ws } = await seedUserWs();
    const s = await seedStudy(ws.id, u.id);
    await seedResponse(s);

    const preview = await deleteStudy(s.experimentId, ws.id, { dryRun: true });
    expect(preview.responses).toBe(1);
    expect(await db.select().from(experiment).where(eq(experiment.id, s.experimentId))).toHaveLength(1);

    await expect(deleteStudy(s.experimentId, crypto.randomUUID())).rejects.toBeInstanceOf(StudyNotFoundError);
  });
});
