import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { citation } from "@/server/adapters/citation";
import { db } from "@/server/db/client";
import { experiment, experimentVersion, response, studyRecord } from "@/server/db/schema";
import {
  DEFAULT_LAYOUT,
  SECTION_TYPES,
  type RecordSection,
  carriesAuthoredContent,
  isFrozenSection,
  sanitizeLayout,
} from "@/lib/study-record/sections";
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
  layout: RecordSection[];
  /** Which bound sections have data to show (greyed in the palette otherwise). */
  availability: Record<string, boolean>;
  /** Whether this study is preregistered — frozes the preregistration section (ADR-0056). */
  hasPreregistration: boolean;
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
    .where(and(eq(experimentVersion.experimentId, studyId), eq(response.status, "completed")));

  const hasResponses = Number(done) > 0;
  return {
    method: true, // a study always has a protocol skeleton
    results: hasResponses,
    data: hasResponses,
    preregistration: !!prereg,
    replications: Number(reps) > 0,
    materials: false, // media inventory resolver is deferred (greyed in the palette)
  };
}

export const studyRecordRouter = router({
  /** The composer's view: the saved (or default) layout + authored fields + availability. */
  getForEdit: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyRecordForEdit> => {
      const exp = await requireOwnStudy(input.studyId, ctx.workspace.id);
      const rec = await ensureRecord(input.studyId);
      const availability = await boundAvailability(input.studyId);
      return {
        studyId: input.studyId,
        finishedAt: exp.finishedAt?.toISOString() ?? null,
        visibility: rec.visibility === "public" ? "public" : "workspace",
        abstract: rec.abstract,
        articleUrl: rec.articleUrl,
        articleDoi: rec.articleDoi,
        publishedAt: rec.publishedAt?.toISOString() ?? null,
        layout: sanitizeLayout((rec.layout as RecordSection[]) ?? []),
        availability,
        hasPreregistration: availability.preregistration,
        sectionTypes: SECTION_TYPES,
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
});
