import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { trackEvent } from "@/server/analytics/track";
import { db } from "@/server/db/client";
import {
  condition as conditionTable,
  experiment,
  experimentVersion,
  user,
  workspaceTemplate,
} from "@/server/db/schema";
import { emit } from "@/server/events/emit";
import {
  locksFromBlocks,
  readBlocks,
  readGroups,
  readOverview,
} from "@/server/modules/blocks";
import { readConsent } from "@/server/modules/consent";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";
import { readTheme } from "@/lib/themes/themes";

/**
 * Workspace Templates (ADR-0063, Library L1). A Template pins curated metadata to
 * a FROZEN experiment_version. "Save as template" freezes the working tip (same
 * shape as studies.saveAsNamed) then writes the row; "Use template" clones that
 * frozen version into the caller's workspace (same copy shape as studies.fork —
 * deliberately replicated here so the load-bearing fork mutation is untouched and
 * the finished-study replication gate doesn't apply to template use).
 */

const SHARE_SCOPES = ["private", "workspace", "public"] as const;
const SORTS = ["recent", "used", "alpha"] as const;

/** Visible to the caller: their own workspace's templates, plus any public/starter. */
function visibilityWhere(workspaceId: string) {
  return and(
    isNull(workspaceTemplate.deletedAt),
    sql`(${workspaceTemplate.workspaceId} = ${workspaceId} OR ${workspaceTemplate.shareScope} = 'public' OR ${workspaceTemplate.starter} = true)`,
  );
}

export const templatesRouter = router({
  /** List templates visible to the caller, filtered by scope/search and sorted. */
  list: workspaceProcedure
    .input(
      z
        .object({
          scope: z.enum(["workspace", "starters", "public"]).default("workspace"),
          search: z.string().trim().max(120).optional(),
          sort: z.enum(SORTS).default("recent"),
          limit: z.number().int().min(1).max(100).default(60),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const ws = ctx.workspace.id;
      const scopeFilter =
        input.scope === "starters"
          ? eq(workspaceTemplate.starter, true)
          : input.scope === "public"
            ? eq(workspaceTemplate.shareScope, "public")
            : eq(workspaceTemplate.workspaceId, ws);

      const where = and(
        isNull(workspaceTemplate.deletedAt),
        scopeFilter,
        input.search ? sql`${workspaceTemplate.name} ILIKE ${"%" + input.search + "%"}` : undefined,
      );

      const orderBy =
        input.sort === "used"
          ? desc(workspaceTemplate.useCount)
          : input.sort === "alpha"
            ? workspaceTemplate.name
            : desc(workspaceTemplate.createdAt);

      const rows = await db
        .select({
          id: workspaceTemplate.id,
          workspaceId: workspaceTemplate.workspaceId,
          name: workspaceTemplate.name,
          description: workspaceTemplate.description,
          tags: workspaceTemplate.tags,
          coverImageR2Key: workspaceTemplate.coverImageR2Key,
          shareScope: workspaceTemplate.shareScope,
          useCount: workspaceTemplate.useCount,
          starter: workspaceTemplate.starter,
          createdAt: workspaceTemplate.createdAt,
          createdByName: user.displayName,
        })
        .from(workspaceTemplate)
        .leftJoin(user, eq(user.id, workspaceTemplate.createdByUserId))
        .where(where)
        .orderBy(orderBy)
        .limit(input.limit);

      return rows.map((r) => ({ ...r, isOwn: r.workspaceId === ws }));
    }),

  /** Read one template + its frozen blocks (for the read-only detail preview). */
  get: workspaceProcedure
    .input(z.object({ templateId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [t] = await db
        .select()
        .from(workspaceTemplate)
        .where(and(eq(workspaceTemplate.id, input.templateId), visibilityWhere(ctx.workspace.id)))
        .limit(1);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select({ snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .where(eq(experimentVersion.id, t.sourceVersionId))
        .limit(1);
      const snapshot = ver?.snapshot ?? null;

      const [creator] = await db
        .select({ name: user.displayName })
        .from(user)
        .where(eq(user.id, t.createdByUserId))
        .limit(1);

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        tags: t.tags,
        coverImageR2Key: t.coverImageR2Key,
        shareScope: t.shareScope,
        useCount: t.useCount,
        starter: t.starter,
        createdAt: t.createdAt,
        createdByName: creator?.name ?? null,
        isOwn: t.workspaceId === ctx.workspace.id,
        blocks: readBlocks(snapshot),
        overview: readOverview(snapshot),
        theme: readTheme(snapshot),
      };
    }),

  /**
   * Save the current study as a template: freeze a named version of the working
   * tip, then write the template row referencing it. Per ADR-0063 the freeze and
   * the row-insert are not cross-rolled-back; a stray named version on a failed
   * insert is acceptable.
   */
  create: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(280).optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
        coverImageR2Key: z.string().max(512).optional(),
        shareScope: z.enum(SHARE_SCOPES).default("private"),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      // Working tip of the caller's study (tenant-scoped).
      const [tip] = await db
        .select({ experiment, version: experimentVersion })
        .from(experiment)
        .leftJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!tip) throw new TRPCError({ code: "NOT_FOUND" });
      if (!tip.version) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No working version to save." });
      }

      // Template name must be unique within the workspace (the user-facing rule).
      const [dupe] = await db
        .select({ id: workspaceTemplate.id })
        .from(workspaceTemplate)
        .where(
          and(
            eq(workspaceTemplate.workspaceId, ctx.workspace.id),
            eq(workspaceTemplate.name, input.name),
            isNull(workspaceTemplate.deletedAt),
          ),
        )
        .limit(1);
      if (dupe) {
        throw new TRPCError({ code: "CONFLICT", message: "A template with this name already exists." });
      }

      // Freeze a named version (count-not-max, mirrors studies.saveAsNamed). The
      // version label is derived so it never collides with the user's own named
      // versions.
      const [{ c: namedCount } = { c: 0 }] = await db
        .select({ c: count() })
        .from(experimentVersion)
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            inArray(experimentVersion.kind, ["named", "preregistered", "published"]),
          ),
        );
      const nextNumber = (namedCount ?? 0) + 1;

      const [frozen] = await db
        .insert(experimentVersion)
        .values({
          experimentId: input.studyId,
          versionNumber: nextNumber,
          kind: "named",
          name: `${input.name} (template v${nextNumber})`,
          definitionSnapshot: tip.version.definitionSnapshot,
          moduleVersionLocks: tip.version.moduleVersionLocks,
          createdBy: ctx.dbUser.id,
        })
        .returning();
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));

      const id = ulid();
      await db.insert(workspaceTemplate).values({
        id,
        workspaceId: ctx.workspace.id,
        sourceExperimentId: input.studyId,
        sourceVersionId: frozen.id,
        name: input.name,
        description: input.description ?? null,
        tags: input.tags,
        coverImageR2Key: input.coverImageR2Key ?? null,
        shareScope: input.shareScope,
        createdByUserId: ctx.dbUser.id,
      });

      if (input.shareScope !== "private") {
        try {
          await emit({
            type: "template_published",
            actorUserId: ctx.dbUser.id,
            workspaceId: ctx.workspace.id,
            targetType: "template",
            targetId: id,
            related: { authorUserId: ctx.dbUser.id, tagSlugs: input.tags },
            data: { templateName: input.name, shareScope: input.shareScope },
          });
        } catch {
          // Non-critical; the template is saved.
        }
      }
      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        event: "template_saved",
        sensitivity: "researcher_behavior",
        properties: { shareScope: input.shareScope },
      });
      return { id };
    }),

  /**
   * Clone a template's frozen version into a new private study in the caller's
   * active workspace. Replicates studies.fork's copy shape against the template's
   * pinned source_version_id (no finished-study gate — using a template is not a
   * scientific replication).
   */
  useTemplate: writeProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const [t] = await db
        .select()
        .from(workspaceTemplate)
        .where(and(eq(workspaceTemplate.id, input.templateId), visibilityWhere(ctx.workspace.id)))
        .limit(1);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select({ snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .where(eq(experimentVersion.id, t.sourceVersionId))
        .limit(1);
      if (!ver) throw new TRPCError({ code: "NOT_FOUND", message: "Template source is missing." });

      const blocks = readBlocks(ver.snapshot);
      const groups = readGroups(ver.snapshot).map(({ moduleId: _drop, ...g }) => g);
      const overview = readOverview(ver.snapshot);
      const theme = readTheme(ver.snapshot);
      const consent = readConsent(ver.snapshot);
      const sourceConditions = await db
        .select()
        .from(conditionTable)
        .where(eq(conditionTable.experimentVersionId, t.sourceVersionId));

      const newId = await db.transaction(async (tx) => {
        const [exp] = await tx
          .insert(experiment)
          .values({
            tenantId: ctx.workspace.id,
            ownerId: ctx.dbUser.id,
            title: t.name,
            tags: t.tags.length ? t.tags : null,
            // NO fork lineage: using a template is a DUPLICATE of the frozen
            // snapshot into a fresh, independent study — not a replication of the
            // source study (Replicate/forkOf* is for finished studies, ADR-0018).
            // Setting forkOf* here made the new study show a false "Replicating X"
            // banner (bug, 2026-06-22).
          })
          .returning();
        const [version] = await tx
          .insert(experimentVersion)
          .values({
            experimentId: exp.id,
            versionNumber: 0,
            kind: "autosave",
            definitionSnapshot: { blocks, groups, overview, theme, consent },
            moduleVersionLocks: locksFromBlocks(blocks),
            createdBy: ctx.dbUser.id,
          })
          .returning();
        if (sourceConditions.length) {
          await tx.insert(conditionTable).values(
            sourceConditions.map((c) => ({
              id: ulid(),
              experimentVersionId: version.id,
              slug: c.slug,
              name: c.name,
              allocationWeight: c.allocationWeight,
              position: c.position,
            })),
          );
        }
        await tx.update(experiment).set({ currentVersionId: version.id }).where(eq(experiment.id, exp.id));
        return exp.id;
      });

      await db
        .update(workspaceTemplate)
        .set({ useCount: sql`${workspaceTemplate.useCount} + 1`, updatedAt: new Date() })
        .where(eq(workspaceTemplate.id, t.id));

      try {
        await emit({
          type: "template_used",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "template",
          targetId: t.id,
          related: { authorUserId: t.createdByUserId },
          data: { templateName: t.name, newStudyId: newId },
        });
      } catch {
        // Non-critical; the clone succeeded.
      }
      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        event: "template_used",
        sensitivity: "researcher_behavior",
        properties: { templateId: input.templateId },
      });
      return { id: newId };
    }),

  /** Edit a template's metadata (owner workspace only). */
  update: writeProcedure
    .input(
      z.object({
        templateId: z.string(),
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(280).nullable().optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
        coverImageR2Key: z.string().max(512).nullable().optional(),
        shareScope: z.enum(SHARE_SCOPES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [t] = await db
        .select()
        .from(workspaceTemplate)
        .where(
          and(
            eq(workspaceTemplate.id, input.templateId),
            eq(workspaceTemplate.workspaceId, ctx.workspace.id),
            isNull(workspaceTemplate.deletedAt),
          ),
        )
        .limit(1);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(workspaceTemplate)
        .set({
          name: input.name ?? t.name,
          description: input.description === undefined ? t.description : input.description,
          tags: input.tags ?? t.tags,
          coverImageR2Key:
            input.coverImageR2Key === undefined ? t.coverImageR2Key : input.coverImageR2Key,
          shareScope: input.shareScope ?? t.shareScope,
          updatedAt: new Date(),
        })
        .where(eq(workspaceTemplate.id, t.id));

      const becamePublished =
        input.shareScope && input.shareScope !== "private" && t.shareScope === "private";
      if (becamePublished) {
        try {
          await emit({
            type: "template_published",
            actorUserId: ctx.dbUser.id,
            workspaceId: ctx.workspace.id,
            targetType: "template",
            targetId: t.id,
            related: { authorUserId: t.createdByUserId, tagSlugs: input.tags ?? t.tags },
            data: { templateName: input.name ?? t.name, shareScope: input.shareScope },
          });
        } catch {
          // Non-critical.
        }
      }
      return { ok: true };
    }),

  /** Soft-delete a template (owner workspace only). Cloned studies are untouched. */
  delete: writeProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .update(workspaceTemplate)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaceTemplate.id, input.templateId),
            eq(workspaceTemplate.workspaceId, ctx.workspace.id),
            isNull(workspaceTemplate.deletedAt),
          ),
        )
        .returning({ id: workspaceTemplate.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),
});
