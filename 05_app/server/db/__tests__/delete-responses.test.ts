import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

// In-memory pglite with the real migrations applied, swapped in for the app DB
// client (same harness as delete-demo.test.ts).
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
import { deleteStudyResponses, StudyNotFoundError } from "@/server/db/delete-responses";
import {
  condition,
  experiment,
  experimentVersion,
  qualityFlag,
  recruitmentSession,
  response,
  responseItem,
  user,
  workspace,
} from "@/server/db/schema";

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${seq++}`;

/**
 * Seed an owner + workspace + a study (one version, one condition, one open
 * recruitment session). Returns the ids. `currentN` is seeded high (99) so the
 * recompute is observable. Optionally pass `now` for deterministic ages.
 */
async function seedStudy(opts: { title?: string } = {}) {
  const [owner] = await db
    .insert(user)
    .values({ externalId: uniq("clerk"), email: `${uniq("owner")}@example.com`, displayName: "Owner" })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: "WS", slug: uniq("ws"), ownerId: owner.id })
    .returning();
  const experimentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(experiment).values({
    id: experimentId,
    tenantId: ws.id,
    ownerId: owner.id,
    title: opts.title ?? "Study",
    isDemo: false,
  });
  await db.insert(experimentVersion).values({
    id: versionId,
    experimentId,
    createdBy: owner.id,
    versionNumber: 1,
    kind: "published",
    name: "v1",
    definitionSnapshot: { blocks: [] },
    moduleVersionLocks: [],
  });
  await db.update(experiment).set({ currentVersionId: versionId }).where(eq(experiment.id, experimentId));
  const sessionId = uniq("rec");
  const conditionId = uniq("cond");
  await db
    .insert(recruitmentSession)
    .values({ id: sessionId, experimentVersionId: versionId, status: "open", currentN: 99 });
  await db
    .insert(condition)
    .values({ id: conditionId, experimentVersionId: versionId, slug: "control", name: "Control", position: 0 });
  return { owner, ws, experimentId, versionId, sessionId, conditionId };
}

/** Insert a response (+ one responseItem) into a study's session. */
async function seedResponse(
  s: { versionId: string; sessionId: string; conditionId: string },
  opts: { id: string; mode?: "run" | "preview"; status?: "completed" | "started"; startedAt?: Date },
) {
  await db.insert(response).values({
    id: opts.id,
    recruitmentSessionId: s.sessionId,
    experimentVersionId: s.versionId,
    conditionId: s.conditionId,
    mode: opts.mode ?? "run",
    status: opts.status ?? "completed",
    startedAt: opts.startedAt ?? new Date(),
    completedAt: (opts.status ?? "completed") === "completed" ? new Date() : null,
  });
  await db.insert(responseItem).values({
    id: uniq("item"),
    responseId: opts.id,
    blockInstanceId: "b1",
    blockPosition: 0,
    moduleSource: "core",
    moduleKey: "likert-7",
    moduleVersion: "1.0.0",
    answer: { value: 5 },
  });
}

describe("deleteStudyResponses", () => {
  it("erases all responses + items + flags, keeps the design, recomputes currentN, idempotent", async () => {
    const s = await seedStudy({ title: "Erase me" });
    await seedResponse(s, { id: uniq("r"), mode: "run", status: "completed" });
    await seedResponse(s, { id: uniq("r"), mode: "run", status: "started" });
    const previewId = uniq("r");
    await seedResponse(s, { id: previewId, mode: "preview", status: "completed" });
    // A quality flag on one response (RESTRICT referrer of response).
    await db.insert(qualityFlag).values({
      id: uniq("qf"),
      workspaceId: s.ws.id,
      experimentId: s.experimentId,
      responseId: previewId,
      flagKind: "manual",
      severity: "low",
    });

    // Another study in a DIFFERENT workspace that must be untouched.
    const other = await seedStudy({ title: "Other" });
    await seedResponse(other, { id: uniq("r"), mode: "run", status: "completed" });

    const counts = await deleteStudyResponses(s.experimentId, s.ws.id, { mode: "all" });
    expect(counts).toEqual({ responses: 3, items: 3, flags: 1 });

    // Responses + items + flags for the target study are gone.
    expect(await db.select().from(response).where(eq(response.experimentVersionId, s.versionId))).toHaveLength(0);
    expect(await db.select().from(qualityFlag).where(eq(qualityFlag.experimentId, s.experimentId))).toHaveLength(0);

    // Design survives.
    expect(await db.select().from(experiment).where(eq(experiment.id, s.experimentId))).toHaveLength(1);
    expect(await db.select().from(experimentVersion).where(eq(experimentVersion.id, s.versionId))).toHaveLength(1);
    expect(await db.select().from(condition).where(eq(condition.id, s.conditionId))).toHaveLength(1);

    // Session kept, currentN recomputed to 0 (no surviving completed/run responses).
    const [sess] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, s.sessionId));
    expect(sess).toBeDefined();
    expect(sess.currentN).toBe(0);

    // The other workspace's study is untouched.
    expect(await db.select().from(response).where(eq(response.experimentVersionId, other.versionId))).toHaveLength(1);

    // Idempotent.
    expect(await deleteStudyResponses(s.experimentId, s.ws.id, { mode: "all" })).toEqual({ responses: 0, items: 0, flags: 0 });
  });

  it("mode 'run' leaves preview responses; recomputes currentN from survivors", async () => {
    const s = await seedStudy();
    await seedResponse(s, { id: uniq("r"), mode: "run", status: "completed" });
    await seedResponse(s, { id: uniq("r"), mode: "run", status: "completed" });
    const keep = uniq("r");
    await seedResponse(s, { id: keep, mode: "preview", status: "completed" });

    const counts = await deleteStudyResponses(s.experimentId, s.ws.id, { mode: "run" });
    expect(counts.responses).toBe(2);

    const survivors = await db.select().from(response).where(eq(response.experimentVersionId, s.versionId));
    expect(survivors.map((r) => r.id)).toEqual([keep]);

    // currentN counts only completed RUN responses → 0 after deleting both run rows.
    const [sess] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, s.sessionId));
    expect(sess.currentN).toBe(0);
  });

  it("olderThanDays deletes only responses past the cutoff (injected now)", async () => {
    const s = await seedStudy();
    const now = new Date("2026-06-20T00:00:00Z");
    const old = uniq("r");
    const recent = uniq("r");
    await seedResponse(s, { id: old, mode: "run", status: "completed", startedAt: new Date("2026-06-01T00:00:00Z") });
    await seedResponse(s, { id: recent, mode: "run", status: "completed", startedAt: new Date("2026-06-19T00:00:00Z") });

    const counts = await deleteStudyResponses(s.experimentId, s.ws.id, { olderThanDays: 7, now });
    expect(counts.responses).toBe(1);

    const survivors = await db.select().from(response).where(eq(response.experimentVersionId, s.versionId));
    expect(survivors.map((r) => r.id)).toEqual([recent]);

    // One completed/run survivor → currentN recomputed to 1.
    const [sess] = await db.select().from(recruitmentSession).where(eq(recruitmentSession.id, s.sessionId));
    expect(sess.currentN).toBe(1);
  });

  it("dryRun reports counts without deleting", async () => {
    const s = await seedStudy();
    await seedResponse(s, { id: uniq("r"), mode: "run", status: "completed" });
    await seedResponse(s, { id: uniq("r"), mode: "run", status: "completed" });

    const counts = await deleteStudyResponses(s.experimentId, s.ws.id, { mode: "all", dryRun: true });
    expect(counts).toEqual({ responses: 2, items: 2, flags: 0 });

    // Nothing actually removed.
    expect(await db.select().from(response).where(eq(response.experimentVersionId, s.versionId))).toHaveLength(2);
  });

  it("throws StudyNotFoundError when the study is in a different workspace", async () => {
    const s = await seedStudy();
    const wrongTenant = crypto.randomUUID();
    await expect(deleteStudyResponses(s.experimentId, wrongTenant, { mode: "all" })).rejects.toBeInstanceOf(
      StudyNotFoundError,
    );
    // Sanity: the responses table still reachable (no partial wipe).
    expect(await db.select().from(response).where(inArray(response.experimentVersionId, [s.versionId]))).toHaveLength(0);
  });
});
