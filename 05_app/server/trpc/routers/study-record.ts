import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, response, studyRecord } from "@/server/db/schema";
import { DEFAULT_LAYOUT, SECTION_TYPES, sanitizeLayout, sectionType } from "@/lib/study-record/sections";
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

const layoutInput = z
  .array(
    z.object({
      type: z.string().min(1).max(40),
      content: z.string().max(20_000).optional(),
      hidden: z.boolean().optional(),
    }),
  )
  .max(40);

export type StudyRecordForEdit = {
  studyId: string;
  finishedAt: string | null;
  visibility: "workspace" | "public";
  abstract: string | null;
  articleUrl: string | null;
  articleDoi: string | null;
  publishedAt: string | null;
  layout: { type: string; content?: string; hidden?: boolean }[];
  /** Which bound sections have data to show (greyed in the palette otherwise). */
  availability: Record<string, boolean>;
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
        layout: sanitizeLayout(rec.layout ?? []),
        availability,
        sectionTypes: SECTION_TYPES,
      };
    }),

  /** Persist the composed layout (order, show/hide, narrative/custom content). */
  saveLayout: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), layout: layoutInput }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await requireOwnStudy(input.studyId, ctx.workspace.id);
      await ensureRecord(input.studyId);
      // Drop unknown types (forward-compat); keep content only where the type allows it.
      const clean = sanitizeLayout(input.layout).map((e) => {
        const t = sectionType(e.type);
        const carriesContent = t?.group === "authored" && (e.type === "narrative" || e.type === "custom");
        return carriesContent ? { type: e.type, content: e.content ?? "", hidden: e.hidden } : { type: e.type, hidden: e.hidden };
      });
      await db
        .update(studyRecord)
        .set({ layout: clean, updatedAt: new Date() })
        .where(eq(studyRecord.experimentId, input.studyId));
      return { ok: true };
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
