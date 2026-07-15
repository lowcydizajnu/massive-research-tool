/**
 * studyRecord router tests (ADR-0054 §41, Slice 2) — the Study Record composer
 * data layer: lazy record creation, layout sanitising, authored fields, the
 * publish (visibility=public) gate, bound-section availability, tenant scoping.
 * Real migrated PGlite, no network.
 */
import { and, eq } from "drizzle-orm";
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
vi.mock("@/server/adapters/jobs", () => ({ jobs: { enqueue: vi.fn() } }));
vi.mock("@/server/adapters/registry", () => ({
  registry: {
    getConnection: vi.fn(async () => ({ connected: true })),
    pushRecordSummary: vi.fn(async () => ({ ok: true })),
    uploadMaterials: vi.fn(async (_userId: string, { files }: { files: { artifactKey: string; fileName: string }[] }) =>
      files.map((f) => ({
        artifactKey: f.artifactKey,
        fileName: f.fileName,
        status: "uploaded" as const,
        osfFileId: `osf-${f.artifactKey}`,
        osfPath: `/${f.artifactKey}`,
        osfUrl: "https://osf.io/NODE-1/files/osfstorage",
      })),
    ),
  },
}));
// The protocol PDF + byte assembly are unit-tested directly; here we stub them so
// the mutation test focuses on guards + persistence (ADR-0094).
vi.mock("@/server/study/pdf-data", () => ({ buildStudyPdfData: vi.fn(async () => ({ title: "T" })) }));
vi.mock("@/server/osf/materials-bundle", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    assembleOsfMaterialFiles: vi.fn(async () => ({
      files: [
        { artifactKey: "design-snapshot.json", fileName: "design-snapshot.json", bytes: new Uint8Array([1]), existingOsfFileId: null },
        { artifactKey: "protocol.pdf", fileName: "protocol.pdf", bytes: new Uint8Array([2]), existingOsfFileId: null },
      ],
      skipped: [],
      failed: [],
    })),
  };
});

import type { AuthUser } from "@/server/adapters/auth";
import { db } from "@/server/db/client";
import {
  activityEvent,
  changeProposal,
  condition,
  customModule,
  experiment,
  experimentVersion,
  follow,
  member,
  mention,
  notification,
  osfMaterialUpload,
  recruitmentSession,
  registry,
  registryConnection,
  registryPush,
  response,
  responseItem,
  savedRecord,
  studyRecord,
  user,
  workspace,
} from "@/server/db/schema";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

function authUser(externalId: string): AuthUser {
  return {
    id: externalId,
    email: `${externalId}@example.com`,
    displayName: externalId,
    avatarUrl: null,
    hasCompletedOnboarding: true,
  };
}

async function seed(externalId: string, wsName: string) {
  const [u] = await db
    .insert(user)
    .values({ externalId, email: `${externalId}@example.com`, displayName: externalId })
    .returning();
  const [ws] = await db
    .insert(workspace)
    .values({ name: wsName, slug: wsName.toLowerCase(), ownerId: u.id })
    .returning();
  await db.insert(member).values({ workspaceId: ws.id, userId: u.id, role: "owner", status: "active" });
  return { user: u, workspace: ws };
}

beforeEach(async () => {
  await db.update(experiment).set({ currentVersionId: null, forkOfVersionId: null, forkOfExperimentId: null });
  await db.delete(changeProposal);
  await db.delete(customModule);
  await db.delete(mention);
  await db.delete(notification);
  await db.delete(follow);
  await db.delete(activityEvent);
  await db.delete(responseItem);
  await db.delete(response);
  await db.delete(recruitmentSession);
  await db.delete(condition);
  await db.delete(savedRecord);
  await db.delete(osfMaterialUpload);
  await db.delete(studyRecord);
  await db.delete(registryPush);
  await db.delete(registryConnection);
  await db.delete(registry);
  await db.delete(experimentVersion);
  await db.delete(experiment);
  await db.delete(member);
  await db.delete(workspace);
  await db.delete(user);
});

describe("studyRecord.getForEdit", () => {
  it("lazily creates a default record and reports empty bound availability", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Trust study" });

    const rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.visibility).toBe("workspace");
    expect(rec.abstract).toBeNull();
    // Default layout = the on-by-default section types, in order.
    expect(rec.layout.map((s) => s.type)).toEqual([
      "abstract",
      "hypotheses",
      "method",
      "results",
      "data",
      "preregistration",
      "replications",
    ]);
    // No responses / prereg / forks yet.
    expect(rec.availability.method).toBe(true);
    expect(rec.availability.results).toBe(false);
    expect(rec.availability.preregistration).toBe(false);
    expect(rec.availability.replications).toBe(false);

    // Idempotent — a second call returns the same single row.
    await a.studyRecord.getForEdit({ studyId: id });
    const rows = await db.select().from(studyRecord).where(eq(studyRecord.experimentId, id));
    expect(rows).toHaveLength(1);
  });

  it("reports preregistration availability once a study is preregistered", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Prereg study" });
    await a.studies.preregister({ studyId: id });

    const rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.availability.preregistration).toBe(true);
  });
});

describe("studyRecord.saveLayout", () => {
  it("persists order + hidden, keeps content only on authored content sections, drops unknown types", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Composed" });

    await a.studyRecord.saveLayout({
      studyId: id,
      layout: [
        { type: "method" },
        { type: "abstract", hidden: true },
        { type: "narrative", content: "We found a robust effect." },
        { type: "method", content: "ignored on bound" }, // content stripped on bound
        { type: "bogus-type", content: "x" }, // dropped
      ],
    });

    const rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.layout.map((s) => s.type)).toEqual(["method", "abstract", "narrative", "method"]);
    expect(rec.layout[1].hidden).toBe(true);
    expect(rec.layout[2].content).toBe("We found a robust effect.");
    expect(rec.layout[0].content).toBeUndefined(); // bound section carries no content
  });
});

describe("studyRecord.saveAuthored + setVisibility (publish gate)", () => {
  it("blocks publish without public-replicable, then without an abstract, then succeeds and stamps publishedAt", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "To publish" });
    await a.studies.publish({ studyId: id });

    // Not public-replicable yet.
    await expect(a.studyRecord.setVisibility({ studyId: id, visibility: "public" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    await a.studies.setForkable({ studyId: id, forkableBy: "public" });
    // Public-replicable but no abstract.
    await expect(a.studyRecord.setVisibility({ studyId: id, visibility: "public" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    await a.studyRecord.saveAuthored({ studyId: id, abstract: "  A clear summary.  " });
    const { publishedAt } = await a.studyRecord.setVisibility({ studyId: id, visibility: "public" });
    expect(publishedAt).not.toBeNull();

    const rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.visibility).toBe("public");
    expect(rec.abstract).toBe("A clear summary."); // trimmed
    expect(rec.publishedAt).toBe(publishedAt); // stamp preserved
  });

  it("reverting to workspace keeps the publishedAt history", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Revert" });
    await a.studies.publish({ studyId: id });
    await a.studies.setForkable({ studyId: id, forkableBy: "public" });
    await a.studyRecord.saveAuthored({ studyId: id, abstract: "x" });
    const first = await a.studyRecord.setVisibility({ studyId: id, visibility: "public" });

    const reverted = await a.studyRecord.setVisibility({ studyId: id, visibility: "workspace" });
    expect(reverted.publishedAt).toBe(first.publishedAt);
  });
});

describe("getPublicStudy reflects the published record (ADR-0054 read path)", () => {
  it("returns null record until published, then the composed layout", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Public record" });
    await a.studies.publish({ studyId: id });
    await a.studies.setForkable({ studyId: id, forkableBy: "public" });
    await a.studyRecord.saveAuthored({ studyId: id, abstract: "Headline finding." });

    // Composed but not yet published → public page falls back to the default render.
    const before = await a.studies.getPublicStudy({ studyId: id });
    expect(before.record).toBeNull();

    // Reorder + hide, then publish.
    await a.studyRecord.saveLayout({
      studyId: id,
      layout: [{ type: "abstract" }, { type: "method", hidden: true }, { type: "narrative", content: "Prose." }],
    });
    await a.studyRecord.setVisibility({ studyId: id, visibility: "public" });

    const after = await a.studies.getPublicStudy({ studyId: id });
    expect(after.record).not.toBeNull();
    expect(after.record!.abstract).toBe("Headline finding.");
    expect(after.record!.layout.map((s) => s.type)).toEqual(["abstract", "method", "narrative"]);
    expect(after.record!.layout[1].hidden).toBe(true);
    expect(after.record!.layout[2].content).toBe("Prose.");
  });
});

describe("saved (bookmark) router — ADR-0056", () => {
  it("toggles a save, reflects isSaved, and lists it", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Bookmark me" });

    expect(await a.saved.isSaved({ studyId: id })).toBe(false);
    expect((await a.saved.toggle({ studyId: id })).saved).toBe(true);
    expect(await a.saved.isSaved({ studyId: id })).toBe(true);
    expect((await a.saved.list()).map((s) => s.studyId)).toContain(id);

    expect((await a.saved.toggle({ studyId: id })).saved).toBe(false);
    expect(await a.saved.list()).toHaveLength(0);
  });
});

describe("studies.studyDashboard — ADR-0056", () => {
  it("reports lifecycle + a next-action prompt; preregistering advances the spine", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Lifecycle" });

    const d0 = await a.studies.studyDashboard({ studyId: id });
    expect(d0.currentStep).toBe("draft");
    expect(d0.lifecycle.find((s) => s.key === "preregistered")!.done).toBe(false);
    // A draft with no frozen version prompts to preregister/publish.
    expect(d0.nextActions.some((x) => x.href.endsWith("/preregister"))).toBe(true);

    await a.studies.preregister({ studyId: id });
    const d1 = await a.studies.studyDashboard({ studyId: id });
    expect(d1.lifecycle.find((s) => s.key === "preregistered")!.done).toBe(true);
    expect(d1.currentStep).toBe("preregistered");
  });
});

describe("studyRecord.publishDataset (ADR-0056 E2)", () => {
  it("stores a snapshot, exposes it only when the record is public, and unpublish clears it", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Dataset study" });
    await a.studies.publish({ studyId: id });
    await a.studies.setForkable({ studyId: id, forkableBy: "public" });
    await a.studyRecord.saveAuthored({ studyId: id, abstract: "An abstract." });

    await a.studyRecord.publishDataset({ studyId: id, headers: ["response_id", "q1"], rows: [["r1", "yes"], ["r2", "no"]] });
    const edit = await a.studyRecord.getForEdit({ studyId: id });
    expect(edit.dataPublished).toBe(true);
    expect(edit.dataRowCount).toBe(2);

    // Not exposed publicly until the record itself is public.
    expect((await a.studies.getPublicStudy({ studyId: id })).record).toBeNull();
    await a.studyRecord.setVisibility({ studyId: id, visibility: "public" });
    const pub = await a.studies.getPublicStudy({ studyId: id });
    expect(pub.record!.dataTable!.headers).toEqual(["response_id", "q1"]);
    expect(pub.record!.dataTable!.rows).toHaveLength(2);

    await a.studyRecord.unpublishDataset({ studyId: id });
    expect((await a.studies.getPublicStudy({ studyId: id })).record!.dataTable).toBeNull();
    expect((await a.studyRecord.getForEdit({ studyId: id })).dataPublished).toBe(false);
  });
});

describe("studyRecord.pushToOsf (ADR-0056 E4b)", () => {
  it("refuses when the study was never pushed to OSF (no project node)", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "No OSF yet" });
    // No preregistration push → no OSF project node → guarded before any adapter call.
    await expect(a.studyRecord.pushToOsf({ studyId: id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // getForEdit reflects no OSF node, so the UI hides the push affordance.
    expect((await a.studyRecord.getForEdit({ studyId: id })).osfNodeId).toBeNull();
  });

  it("itemizes the push, gates the public link on visibility (no 404), and tracks up-to-date (item 2)", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "OSF push study" });
    await a.studies.preregister({ studyId: id });

    // Wire an OSF project node into the push history (as a preregistration push would).
    const [ver] = await db
      .select()
      .from(experimentVersion)
      .where(and(eq(experimentVersion.experimentId, id), eq(experimentVersion.kind, "preregistered")));
    await db.insert(registry).values({ id: "reg-osf", key: "osf", name: "OSF" });
    await db.insert(registryPush).values({
      id: "push-1",
      experimentVersionId: ver.id,
      registryId: "reg-osf",
      status: "pushed",
      requestPayload: {},
      responsePayload: { nodeId: "NODE-1" },
    });

    await a.studyRecord.saveAuthored({ studyId: id, abstract: "Key finding.", articleDoi: "10.1/x" });

    // Workspace-private record: abstract + DOI + license itemized (ADR-0100), but
    // NOT the /browse link (would 404 while private).
    let rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.osfNodeId).toBe("NODE-1");
    expect(rec.osfSummaryItems.map((i) => i.label)).toEqual(["Abstract", "Article DOI", "License"]);
    expect(rec.osfUpToDate).toBe(false);
    expect(rec.osfPushedAt).toBeNull();

    // Publish → the public record link is now safe to include.
    await a.studies.setForkable({ studyId: id, forkableBy: "public" });
    await a.studyRecord.setVisibility({ studyId: id, visibility: "public" });
    rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.osfSummaryItems.map((i) => i.label)).toContain("Public record link");

    // Push → up to date.
    await a.studyRecord.pushToOsf({ studyId: id });
    rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.osfUpToDate).toBe(true);
    expect(rec.osfPushedAt).not.toBeNull();

    // Editing the content flips it back to "changes to push".
    await a.studyRecord.saveAuthored({ studyId: id, abstract: "Revised finding.", articleDoi: "10.1/x" });
    rec = await a.studyRecord.getForEdit({ studyId: id });
    expect(rec.osfUpToDate).toBe(false);
  });
});

describe("studies.getRecordPreview (ADR-0056 C — preview parity)", () => {
  it("returns the composed record for the owner even when visibility is workspace", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Preview me" });
    await a.studyRecord.saveAuthored({ studyId: id, abstract: "Composed abstract." });
    // Not public — getPublicStudy would hide the record, but preview must show it.
    const prev = await a.studies.getRecordPreview({ studyId: id });
    expect(prev.record).not.toBeNull();
    expect(prev.record!.abstract).toBe("Composed abstract.");
    expect(prev.title).toBe("Preview me");
  });

  it("is NOT_FOUND for another workspace's study", async () => {
    await seed("hanna", "Hanna Lab");
    await seed("sofia", "Sofia Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const b = createCaller({ authUser: authUser("sofia") });
    const { id } = await a.studies.create({ kind: "blank", title: "Hanna's" });
    await expect(b.studies.getRecordPreview({ studyId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("studies.setVariants (ADR-0058)", () => {
  it("round-trips factors + bindings via studies.get and prunes dangling bindings", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Factorial" });
    await a.studies.setVariants({
      studyId: id,
      factors: [{ id: "f1", name: "Social influence", levels: [{ id: "lo", name: "low" }, { id: "hi", name: "high" }] }],
      variantBindings: [
        { instanceId: "post", path: "likes", factorId: "f1", valuesByLevel: { lo: 12, hi: 9800 } },
        { instanceId: "post", path: "x", factorId: "gone", valuesByLevel: {} }, // dangling → pruned
      ],
    });
    const study = await a.studies.get({ id });
    expect(study.factors).toHaveLength(1);
    expect(study.factors[0].levels.map((l) => l.name)).toEqual(["low", "high"]);
    expect(study.variantBindings).toHaveLength(1);
    expect(study.variantBindings[0].valuesByLevel).toEqual({ lo: 12, hi: 9800 });

    // Clearing all factors returns the study to single-variant (no residue).
    await a.studies.setVariants({ studyId: id, factors: [], variantBindings: [] });
    const cleared = await a.studies.get({ id });
    expect(cleared.factors).toEqual([]);
    expect(cleared.variantBindings).toEqual([]);
  });
});

describe("studyRecord tenant scoping", () => {
  it("is NOT_FOUND for a study in another workspace", async () => {
    await seed("hanna", "Hanna Lab");
    await seed("sofia", "Sofia Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const b = createCaller({ authUser: authUser("sofia") });
    const { id } = await a.studies.create({ kind: "blank", title: "Hanna's" });

    await expect(b.studyRecord.getForEdit({ studyId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.studyRecord.saveAuthored({ studyId: id, abstract: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("studyRecord OSF materials (ADR-0094)", () => {
  /** Give a study an OSF project node by faking a prior preregistration push. */
  async function seedOsfNode(studyId: string) {
    const [ver] = await db
      .select({ id: experimentVersion.id })
      .from(experimentVersion)
      .where(eq(experimentVersion.experimentId, studyId))
      .limit(1);
    await db.insert(registry).values({ id: "reg-osf", key: "osf", name: "OSF", oauthConfig: {}, pushConfig: {} });
    await db.insert(registryPush).values({
      id: "push-1",
      experimentVersionId: ver!.id,
      registryId: "reg-osf",
      status: "pushed",
      requestPayload: {},
      responsePayload: { nodeId: "NODE-1" },
    });
  }

  it("refuses to upload when the study has no OSF project node yet", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "No node" });
    await a.studies.preregister({ studyId: id }); // frozen version, but no push row → no node

    await expect(a.studyRecord.uploadMaterialsToOsf({ studyId: id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("refuses to upload when OSF isn't connected", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Disconnected" });
    await a.studies.preregister({ studyId: id });
    await seedOsfNode(id);

    // Set the disconnected state right before the call so earlier procedures
    // (which also read the connection) don't consume the one-time override.
    const { registry: reg } = await import("@/server/adapters/registry");
    (reg.getConnection as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ connected: false });

    await expect(a.studyRecord.uploadMaterialsToOsf({ studyId: id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("uploads the design JSON + protocol PDF, records per-file state, and the panel reflects it", async () => {
    await seed("hanna", "Hanna Lab");
    const a = createCaller({ authUser: authUser("hanna") });
    const { id } = await a.studies.create({ kind: "blank", title: "Uploadable" });
    await a.studies.preregister({ studyId: id });
    await seedOsfNode(id);

    // Before: node + connection exist, nothing uploaded.
    const before = await a.studyRecord.getMaterialsForOsf({ studyId: id });
    expect(before.hasNode).toBe(true);
    expect(before.connected).toBe(true);
    expect(before.artifacts.map((x) => x.artifactKey)).toEqual(["design-snapshot.json", "protocol.pdf"]);
    expect(before.artifacts.every((x) => x.status === "not_uploaded")).toBe(true);

    const res = await a.studyRecord.uploadMaterialsToOsf({ studyId: id });
    expect(res).toEqual({ uploaded: 2, failed: 0, skipped: 0, total: 2 });

    // Rows persisted, and a re-query shows them uploaded with OSF links.
    const rows = await db.select().from(osfMaterialUpload).where(eq(osfMaterialUpload.experimentId, id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "uploaded" && r.osfFileId && r.uploadedAt)).toBe(true);

    const after = await a.studyRecord.getMaterialsForOsf({ studyId: id });
    expect(after.artifacts.every((x) => x.status === "uploaded" && x.osfUrl)).toBe(true);
    expect(after.lastUploadedAt).not.toBeNull();
  });
});
