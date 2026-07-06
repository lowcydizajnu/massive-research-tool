import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { citation } from "@/server/adapters/citation";
import { registry } from "@/server/adapters/registry";
import { db } from "@/server/db/client";
import { experiment, experimentVersion, osfMaterialUpload, registryPush, response, studyRecord } from "@/server/db/schema";
import {
  OSF_MATERIALS_FOLDER,
  assembleOsfMaterialFiles,
  planOsfArtifacts,
} from "@/server/osf/materials-bundle";
import { buildStudyPdfData } from "@/server/study/pdf-data";
import {
  DEFAULT_LAYOUT,
  SECTION_TYPES,
  type RecordSection,
  carriesAuthoredContent,
  isFrozenSection,
  sanitizeLayout,
} from "@/lib/study-record/sections";
import { extractMaterials } from "@/lib/study-record/materials";
import { readBlocks } from "@/server/modules/blocks";
import { writeProcedure, router } from "@/server/trpc/trpc";

/**
 * Study Record composer data layer (ADR-0054 §41, Slice 2). The editing side of
 * the Record — owner/editor only (`writeProcedure` + a tenant check), all scoped
 * to the active workspace's own studies. Reads the public Record render path
 * stays in `studies.getPublicStudy` (Slice 1). Mirrors the dashboard router:
 * a per-object `layout` of section instances, sanitised against the registry.
 *
 * Authored content split (see `lib/study-record/sections`): `abstract` and the
 * article link are `study_record` columns (the publish gate reads the abstract);
 * `narrative`/`custom` carry prose in the layout entry's `content`.
 */

const hypothesisFields = z
  .object({
    effectType: z.string().max(80).optional(),
    direction: z.string().max(80).optional(),
    statisticKind: z.string().max(80).optional(),
    statisticValue: z.string().max(120).optional(),
    analysis: z.string().max(120).optional(),
  })
  .optional();

const layoutInput = z
  .array(
    z.object({
      type: z.string().min(1).max(40),
      title: z.string().max(200).optional(),
      content: z.string().max(20_000).optional(),
      hidden: z.boolean().optional(),
      fields: hypothesisFields,
    }),
  )
  .max(60);

export type StudyRecordForEdit = {
  studyId: string;
  finishedAt: string | null;
  visibility: "workspace" | "public";
  abstract: string | null;
  articleUrl: string | null;
  articleDoi: string | null;
  publishedAt: string | null;
  /** Publishable dataset state (ADR-0056 E2) — opt-in, snapshot at publish. */
  dataPublished: boolean;
  dataColumns: string[];
  dataRowCount: number;
  layout: RecordSection[];
  /** Which bound sections have data to show (greyed in the palette otherwise). */
  availability: Record<string, boolean>;
  /** Whether this study is preregistered — frozes the preregistration section (ADR-0056). */
  hasPreregistration: boolean;
  /** OSF project node from the push history — present = "Push update to OSF" available (E4b). */
  osfNodeId: string | null;
  /** Exactly what a push would write to the OSF project node, itemized (item 2). */
  osfSummaryItems: OsfPushItem[];
  /** When the current content was last pushed (null = never), and whether OSF is already up to date. */
  osfPushedAt: string | null;
  osfUpToDate: boolean;
  sectionTypes: typeof SECTION_TYPES;
};

/** Resolve + tenant-check the study, or NOT_FOUND. Returns its forkable + finished state. */
async function requireOwnStudy(studyId: string, workspaceId: string) {
  const [exp] = await db
    .select({
      id: experiment.id,
      forkableBy: experiment.forkableBy,
      finishedAt: experiment.finishedAt,
    })
    .from(experiment)
    .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });
  return exp;
}

/** Lazily create the record row (default layout) on first compose; return it. */
async function ensureRecord(studyId: string) {
  const [existing] = await db.select().from(studyRecord).where(eq(studyRecord.experimentId, studyId)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(studyRecord)
    .values({ experimentId: studyId, layout: DEFAULT_LAYOUT })
    .onConflictDoNothing()
    .returning();
  // onConflictDoNothing returns nothing on a race — re-read to be safe.
  if (created) return created;
  const [row] = await db.select().from(studyRecord).where(eq(studyRecord.experimentId, studyId)).limit(1);
  return row!;
}

/** Bound-section availability — which sections have data worth rendering. */
async function boundAvailability(studyId: string): Promise<Record<string, boolean>> {
  const [prereg] = await db
    .select({ id: experimentVersion.id })
    .from(experimentVersion)
    .where(and(eq(experimentVersion.experimentId, studyId), eq(experimentVersion.kind, "preregistered")))
    .limit(1);
  const [{ reps }] = await db
    .select({ reps: count() })
    .from(experiment)
    .where(eq(experiment.forkOfExperimentId, studyId));
  const [{ done }] = await db
    .select({ done: count() })
    .from(response)
    .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
    // Real responses only — Preview (mode:"preview") must never inflate a public record's N.
    .where(and(eq(experimentVersion.experimentId, studyId), eq(response.status, "completed"), eq(response.mode, "run")));

  const hasResponses = Number(done) > 0;

  // Materials = researcher-uploaded stimuli in the latest frozen version (E3).
  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, studyId),
        inArray(experimentVersion.kind, ["published", "preregistered"]),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  const hasMaterials = ver ? extractMaterials(readBlocks(ver.snapshot)).length > 0 : false;

  return {
    method: true, // a study always has a protocol skeleton
    results: hasResponses,
    data: hasResponses,
    preregistration: !!prereg,
    replications: Number(reps) > 0,
    materials: hasMaterials,
  };
}

/** The OSF project node id from this study's push history (E4b), or null. */
async function osfProjectNode(studyId: string): Promise<string | null> {
  const pushes = await db
    .select({ resp: registryPush.responsePayload })
    .from(registryPush)
    .innerJoin(experimentVersion, eq(registryPush.experimentVersionId, experimentVersion.id))
    .where(eq(experimentVersion.experimentId, studyId))
    .orderBy(desc(registryPush.createdAt));
  for (const p of pushes) {
    const nodeId = (p.resp as { nodeId?: string } | null)?.nodeId;
    if (nodeId) return nodeId;
  }
  return null;
}

/** The newest frozen (published/preregistered) version — the source of a study's
 *  materials + design snapshot for OSF upload (ADR-0094), matching the E3
 *  materials inventory. */
async function latestFrozenVersion(studyId: string): Promise<{ id: string; snapshot: unknown } | null> {
  const [ver] = await db
    .select({ id: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, studyId),
        inArray(experimentVersion.kind, ["published", "preregistered"]),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  return ver ?? null;
}

export type OsfPushItem = { label: string; value: string };

/** OSF materials upload status for one artifact, as the panel sees it (ADR-0094). */
export type OsfArtifactStatus = "not_uploaded" | "uploaded" | "failed" | "skipped";

export type StudyOsfMaterialArtifact = {
  kind: "stimulus" | "design-json" | "protocol-pdf";
  artifactKey: string;
  fileName: string;
  status: OsfArtifactStatus;
  osfUrl: string | null;
  error: string | null;
  uploadedAt: string | null;
};

export type StudyOsfMaterials = {
  connected: boolean;
  /** Whether an OSF project node exists yet (a prior preregistration/record push). */
  hasNode: boolean;
  /** Whether the study has a frozen version to take materials from. */
  hasVersion: boolean;
  folderName: string;
  artifacts: StudyOsfMaterialArtifact[];
  lastUploadedAt: string | null;
};

export type OsfMaterialsUploadResult = {
  uploaded: number;
  failed: number;
  skipped: number;
  total: number;
};

/**
 * The exact, itemized content the OSF project-node push would write (ADR-0056 E4b
 * / item 2). Single source of truth so the confirm modal, the up-to-date check,
 * and the mutation all agree. The public record link is included ONLY when the
 * record is public — a workspace-private record 404s on `/browse/[id]`, which is
 * the bug the modal previously always showed.
 */
function osfRecordSummary(
  rec: { abstract: string | null; articleUrl: string | null; articleDoi: string | null },
  opts: { studyId: string; recordPublic: boolean },
): { items: OsfPushItem[]; text: string; hash: string } {
  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://myresearchlab.app";
  const items: OsfPushItem[] = [];
  if (rec.abstract?.trim()) items.push({ label: "Abstract", value: rec.abstract.trim() });
  if (rec.articleDoi?.trim()) items.push({ label: "Article DOI", value: `https://doi.org/${rec.articleDoi.trim()}` });
  else if (rec.articleUrl?.trim()) items.push({ label: "Article link", value: rec.articleUrl.trim() });
  if (opts.recordPublic) items.push({ label: "Public record link", value: `${appBase}/browse/${opts.studyId}` });
  const text = items
    .map((i) => (i.label === "Abstract" ? i.value : `${i.label}: ${i.value}`))
    .join("\n\n")
    .slice(0, 5000);
  const hash = createHash("sha256").update(text).digest("hex");
  return { items, text, hash };
}

export const studyRecordRouter = router({
  /** The composer's view: the saved (or default) layout + authored fields + availability. */
  getForEdit: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyRecordForEdit> => {
      const exp = await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);
      const availability = await boundAvailability(input.studyId);
      const recordPublic = rec.visibility === "public";
      const summary = osfRecordSummary(rec, { studyId: input.studyId, recordPublic });
      return {
        studyId: input.studyId,
        finishedAt: exp.finishedAt?.toISOString() ?? null,
        visibility: recordPublic ? "public" : "workspace",
        abstract: rec.abstract,
        articleUrl: rec.articleUrl,
        articleDoi: rec.articleDoi,
        publishedAt: rec.publishedAt?.toISOString() ?? null,
        dataPublished: rec.dataPublished,
        dataColumns: rec.dataTable?.headers ?? [],
        dataRowCount: rec.dataTable?.rows.length ?? 0,
        layout: sanitizeLayout((rec.layout as RecordSection[]) ?? []),
        availability,
        hasPreregistration: availability.preregistration,
        osfNodeId: await osfProjectNode(input.studyId),
        osfSummaryItems: summary.items,
        osfPushedAt: rec.osfPushedAt?.toISOString() ?? null,
        osfUpToDate: !!rec.osfPushedHash && rec.osfPushedHash === summary.hash,
        sectionTypes: SECTION_TYPES,
      };
    }),

  /**
   * Push the Record summary (abstract + article link + record URL) to the study's
   * OSF **project node** (ADR-0056 E4b) — a non-plan update, not an amendment
   * (ADR-0056 E4a). Requires a prior preregistration push (so a project node
   * exists) + an active OSF connection.
   */
  pushToOsf: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);
      const nodeId = await osfProjectNode(input.studyId);
      if (!nodeId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Push a preregistration to OSF first — there's no OSF project to update yet.",
        });
      }
      const conn = await registry.getConnection(ctx.dbUser.id);
      if (!conn.connected) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect OSF in Settings · Connections first." });
      }

      const summary = osfRecordSummary(rec, {
        studyId: input.studyId,
        recordPublic: rec.visibility === "public",
      });
      if (!summary.text.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Nothing to push yet — add an abstract or article link, or publish the record.",
        });
      }

      await registry.pushRecordSummary(ctx.dbUser.id, { nodeId, summary: summary.text });
      // Record what we pushed so the composer can tell up-to-date from changed (item 2).
      await db
        .update(studyRecord)
        .set({ osfPushedHash: summary.hash, osfPushedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * Materials-on-OSF panel state (ADR-0094): the artifacts this study would push
   * (its stimulus files + the design snapshot + a protocol PDF), each with its
   * last upload status. Read-only; safe to call before any push.
   */
  getMaterialsForOsf: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyOsfMaterials> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const [nodeId, conn, ver] = await Promise.all([
        osfProjectNode(input.studyId),
        registry.getConnection(ctx.dbUser.id),
        latestFrozenVersion(input.studyId),
      ]);
      const planned = ver ? planOsfArtifacts(ver.snapshot) : [];
      const rows = await db
        .select()
        .from(osfMaterialUpload)
        .where(eq(osfMaterialUpload.experimentId, input.studyId));
      const byKey = new Map(rows.map((r) => [r.artifactKey, r]));
      let lastUploadedAt: Date | null = null;
      for (const r of rows) {
        if (r.uploadedAt && (!lastUploadedAt || r.uploadedAt > lastUploadedAt)) lastUploadedAt = r.uploadedAt;
      }
      return {
        connected: conn.connected,
        hasNode: !!nodeId,
        hasVersion: !!ver,
        folderName: OSF_MATERIALS_FOLDER,
        artifacts: planned.map((p) => {
          const r = byKey.get(p.artifactKey);
          return {
            kind: p.kind,
            artifactKey: p.artifactKey,
            fileName: p.fileName,
            status: (r?.status ?? "not_uploaded") as OsfArtifactStatus,
            osfUrl: r?.osfUrl ?? null,
            error: r?.errorText ?? null,
            uploadedAt: r?.uploadedAt?.toISOString() ?? null,
          };
        }),
        lastUploadedAt: lastUploadedAt?.toISOString() ?? null,
      };
    }),

  /**
   * Upload this study's materials to its OSF **project node** (ADR-0094) — the
   * mutable node from the original preregistration, never the frozen
   * registration. Assembles stimulus files + the design snapshot + a protocol
   * PDF, uploads via WaterButler (create, or new-version on re-push), and records
   * per-file state. Requires an OSF node (preregister first) + an active
   * connection. Participant response media is never included.
   */
  uploadMaterialsToOsf: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<OsfMaterialsUploadResult> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      const nodeId = await osfProjectNode(input.studyId);
      if (!nodeId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Push a preregistration to OSF first — there's no OSF project to add materials to yet.",
        });
      }
      const conn = await registry.getConnection(ctx.dbUser.id);
      if (!conn.connected) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect OSF in Settings · Connections first." });
      }
      const ver = await latestFrozenVersion(input.studyId);
      if (!ver) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This study has no saved version to take materials from." });
      }

      // Prior OSF file ids → re-push updates in place (new version), no duplicates.
      const priorRows = await db
        .select()
        .from(osfMaterialUpload)
        .where(eq(osfMaterialUpload.experimentId, input.studyId));
      const existingByKey = new Map(
        priorRows.filter((r) => r.osfFileId).map((r) => [r.artifactKey, r.osfFileId!]),
      );

      const pdfData = await buildStudyPdfData(input.studyId);
      const { files, skipped, failed } = await assembleOsfMaterialFiles({
        snapshot: ver.snapshot,
        pdfData,
        existingByKey,
      });

      const uploaded = files.length
        ? await registry.uploadMaterials(ctx.dbUser.id, { nodeId, folderName: OSF_MATERIALS_FOLDER, files })
        : [];

      // Persist per-artifact state (upsert on (experimentId, artifactKey)).
      const kindByKey = new Map(planOsfArtifacts(ver.snapshot).map((p) => [p.artifactKey, p.kind]));
      const now = new Date();
      type Row = {
        artifactKey: string;
        fileName: string;
        status: "uploaded" | "failed" | "skipped";
        osfFileId: string | null;
        osfPath: string | null;
        osfUrl: string | null;
        sizeBytes: number | null;
        error: string | null;
      };
      const rows: Row[] = [
        ...uploaded.map((u) => ({
          artifactKey: u.artifactKey,
          fileName: u.fileName,
          status: u.status,
          osfFileId: u.osfFileId,
          osfPath: u.osfPath,
          osfUrl: u.osfUrl,
          sizeBytes: null,
          error: u.error ?? null,
        })),
        ...skipped.map((s) => ({
          artifactKey: s.artifactKey,
          fileName: s.fileName,
          status: "skipped" as const,
          osfFileId: null,
          osfPath: null,
          osfUrl: null,
          sizeBytes: s.sizeBytes,
          error: `Skipped — larger than the ${Math.round((100 * 1024 * 1024) / (1024 * 1024))} MB per-file limit.`,
        })),
        ...failed.map((f) => ({
          artifactKey: f.artifactKey,
          fileName: f.fileName,
          status: "failed" as const,
          osfFileId: null,
          osfPath: null,
          osfUrl: null,
          sizeBytes: null,
          error: f.error,
        })),
      ];

      for (const r of rows) {
        // Preserve a prior OSF file id when this attempt didn't produce one
        // (skipped / failed) so a later re-push can still update in place.
        const osfFileId = r.osfFileId ?? existingByKey.get(r.artifactKey) ?? null;
        const values = {
          nodeId,
          experimentVersionId: ver.id,
          kind: kindByKey.get(r.artifactKey) ?? "stimulus",
          fileName: r.fileName,
          osfFileId,
          osfPath: r.osfPath,
          osfUrl: r.osfUrl,
          status: r.status,
          sizeBytes: r.sizeBytes,
          errorText: r.error,
          uploadedAt: r.status === "uploaded" ? now : null,
          updatedAt: now,
        };
        await db
          .insert(osfMaterialUpload)
          .values({ id: ulid(), experimentId: input.studyId, artifactKey: r.artifactKey, ...values })
          .onConflictDoUpdate({
            target: [osfMaterialUpload.experimentId, osfMaterialUpload.artifactKey],
            set: values,
          });
      }

      return {
        uploaded: uploaded.filter((u) => u.status === "uploaded").length,
        failed: uploaded.filter((u) => u.status === "failed").length + failed.length,
        skipped: skipped.length,
        total: rows.length,
      };
    }),

  /**
   * Persist the composed layout (order, show/hide, titles, content, hypothesis
   * fields). Bound sections accept a title/content **override**; preregistration
   * is frozen once preregistered (ADR-0056) — its override is dropped server-side.
   */
  saveLayout: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), layout: layoutInput }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      const { preregistration: hasPrereg } = await boundAvailability(input.studyId);
      const clean: RecordSection[] = sanitizeLayout(input.layout).map((e) => {
        const out: RecordSection = { type: e.type };
        if (e.hidden) out.hidden = true;
        if (isFrozenSection(e.type, hasPrereg)) return out; // frozen — no overrides persisted
        if (e.title?.trim()) out.title = e.title.trim();
        // Authored types + bound overrides both carry content; hypotheses also carry fields.
        if (e.content != null && (carriesAuthoredContent(e.type) || e.type !== "preregistration")) {
          if (e.content) out.content = e.content;
        }
        if (e.type === "hypotheses" && e.fields) {
          const f = Object.fromEntries(Object.entries(e.fields).filter(([, v]) => v?.trim()));
          if (Object.keys(f).length) out.fields = f;
        }
        return out;
      });
      await db
        .update(studyRecord)
        .set({ layout: clean, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * Look up an article by DOI via the CitationAdapter (Crossref) for the
   * Abstract block's "Import from DOI" (ADR-0056). Returns null when unknown so
   * the UI falls back to manual entry. Write-gated (composer-only caller).
   */
  lookupCitation: writeProcedure
    .input(z.object({ doi: z.string().trim().min(3).max(200) }))
    .mutation(async ({ input }) => {
      return citation.lookupDoi(input.doi);
    }),

  /** Persist the column-backed authored fields (abstract + article link). */
  saveAuthored: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        abstract: z.string().max(4_000).nullish(),
        articleUrl: z.string().url().max(2_000).nullish(),
        articleDoi: z.string().max(255).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.abstract !== undefined) patch.abstract = input.abstract?.trim() || null;
      if (input.articleUrl !== undefined) patch.articleUrl = input.articleUrl || null;
      if (input.articleDoi !== undefined) patch.articleDoi = input.articleDoi?.trim() || null;
      await db.update(studyRecord).set(patch).where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),

  /**
   * Set the Record's visibility. Going **public** is the publish action: it
   * requires the study be public-replicable (same gate as Browse) AND carry a
   * non-empty abstract (ADR-0054), and stamps `published_at` on the first
   * publish. Reverting to `workspace` keeps the published_at history.
   */
  setVisibility: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), visibility: z.enum(["workspace", "public"]) }))
    .mutation(async ({ ctx, input }): Promise<{ publishedAt: string | null }> => {
      const exp = await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);

      if (input.visibility === "public") {
        if (exp.forkableBy !== "public") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Make the study public-replicable before publishing its record.",
          });
        }
        if (!rec.abstract || !rec.abstract.trim()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an abstract before publishing a public record.",
          });
        }
      }

      const publishedAt = rec.publishedAt ?? (input.visibility === "public" ? new Date() : null);
      const [row] = await db
        .update(studyRecord)
        .set({ visibility: input.visibility, publishedAt, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId))
        .returning({ publishedAt: studyRecord.publishedAt });
      return { publishedAt: row?.publishedAt?.toISOString() ?? null };
    }),

  /**
   * Publish a response-dataset snapshot on the Record (ADR-0056 amendment / E2).
   * The composer builds the table client-side from the Export Data view (the
   * researcher picks columns; the participant id is excluded by default) and
   * sends the snapshot here — we store it immutably. Opt-in + owner-built, so the
   * researcher owns the anonymity call. Capped to keep the row sane.
   */
  publishDataset: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        headers: z.array(z.string().max(200)).min(1).max(200),
        rows: z.array(z.array(z.string().max(5000)).max(200)).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true; rows: number }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      await db
        .update(studyRecord)
        .set({ dataPublished: true, dataTable: { headers: input.headers, rows: input.rows }, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true, rows: input.rows.length };
    }),

  /** Withdraw the published dataset (clears the snapshot). */
  unpublishDataset: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await db
        .update(studyRecord)
        .set({ dataPublished: false, dataTable: null, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
    }),
});
