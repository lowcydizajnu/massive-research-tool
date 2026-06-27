import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { trackEvent } from "@/server/analytics/track";
import { db } from "@/server/db/client";
import { experiment, experimentVersion, user, workspaceMaterial } from "@/server/db/schema";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Workspace Materials (ADR-0064, Library L3). A reusable stimulus-media library.
 * Assets live in the R2 `ws/<workspace>/materials/` namespace; the client
 * presigns + PUTs, then calls `upload` to register the row. Blocks reference the
 * material's `r2Key` (never this row's id) — orphan-safe + snapshot-stable.
 * Workspace-scoped throughout; researcher stimuli, not participant PII.
 */
const KINDS = ["image", "audio", "video", "document"] as const;
const SORTS = ["recent", "used", "alpha"] as const;

export const materialsRouter = router({
  list: workspaceProcedure
    .input(
      z
        .object({
          kind: z.enum(KINDS).optional(),
          search: z.string().trim().max(120).optional(),
          sort: z.enum(SORTS).default("recent"),
          limit: z.number().int().min(1).max(200).default(100),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(workspaceMaterial.workspaceId, ctx.workspace.id),
        isNull(workspaceMaterial.deletedAt),
        input.kind ? eq(workspaceMaterial.kind, input.kind) : undefined,
        input.search ? sql`${workspaceMaterial.name} ILIKE ${"%" + input.search + "%"}` : undefined,
      );
      const orderBy =
        input.sort === "used"
          ? desc(workspaceMaterial.useCount)
          : input.sort === "alpha"
            ? workspaceMaterial.name
            : desc(workspaceMaterial.createdAt);

      return db
        .select({
          id: workspaceMaterial.id,
          kind: workspaceMaterial.kind,
          name: workspaceMaterial.name,
          description: workspaceMaterial.description,
          tags: workspaceMaterial.tags,
          r2Key: workspaceMaterial.r2Key,
          mimeType: workspaceMaterial.mimeType,
          sizeBytes: workspaceMaterial.sizeBytes,
          useCount: workspaceMaterial.useCount,
          createdAt: workspaceMaterial.createdAt,
          uploadedByName: user.displayName,
        })
        .from(workspaceMaterial)
        .leftJoin(user, eq(user.id, workspaceMaterial.uploadedByUserId))
        .where(where)
        .orderBy(orderBy)
        .limit(input.limit);
    }),

  get: workspaceProcedure
    .input(z.object({ materialId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [m] = await db
        .select()
        .from(workspaceMaterial)
        .where(
          and(
            eq(workspaceMaterial.id, input.materialId),
            eq(workspaceMaterial.workspaceId, ctx.workspace.id),
            isNull(workspaceMaterial.deletedAt),
          ),
        )
        .limit(1);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      return m;
    }),

  /**
   * Register an asset already uploaded (presign + PUT) into the workspace's R2
   * `ws/<workspace>/materials/` prefix. The key is verified to live under the
   * caller's own workspace namespace so a row can't reference another tenant's
   * object.
   */
  upload: writeProcedure
    .input(
      z.object({
        key: z.string().min(1).max(512),
        kind: z.enum(KINDS),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(280).optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
        mimeType: z.string().min(1).max(120),
        sizeBytes: z.number().int().positive(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        durationMs: z.number().int().positive().optional(),
        sourceKind: z.enum(["upload", "study-block-promote", "playground-promote"]).default("upload"),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      if (!input.key.startsWith(`ws/${ctx.workspace.id}/`)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Material must live in this workspace's storage." });
      }
      const id = ulid();
      await db.insert(workspaceMaterial).values({
        id,
        workspaceId: ctx.workspace.id,
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        tags: input.tags,
        r2Key: input.key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        uploadedByUserId: ctx.dbUser.id,
        sourceKind: input.sourceKind,
      });
      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        event: "material_uploaded",
        sensitivity: "researcher_behavior",
        properties: { kind: input.kind, sourceKind: input.sourceKind },
      });
      return { id };
    }),

  /** Record that a material was inserted into a block (best-effort use metering). */
  touch: writeProcedure
    .input(z.object({ materialId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db
        .update(workspaceMaterial)
        .set({ useCount: sql`${workspaceMaterial.useCount} + 1`, lastUsedAt: new Date() })
        .where(
          and(
            eq(workspaceMaterial.id, input.materialId),
            eq(workspaceMaterial.workspaceId, ctx.workspace.id),
          ),
        );
      return { ok: true };
    }),

  update: writeProcedure
    .input(
      z.object({
        materialId: z.string(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(280).nullable().optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [m] = await db
        .select()
        .from(workspaceMaterial)
        .where(
          and(
            eq(workspaceMaterial.id, input.materialId),
            eq(workspaceMaterial.workspaceId, ctx.workspace.id),
            isNull(workspaceMaterial.deletedAt),
          ),
        )
        .limit(1);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(workspaceMaterial)
        .set({
          name: input.name ?? m.name,
          description: input.description === undefined ? m.description : input.description,
          tags: input.tags ?? m.tags,
          updatedAt: new Date(),
        })
        .where(eq(workspaceMaterial.id, m.id));
      return { ok: true };
    }),

  /** Soft-delete. The object stays in R2 + studies referencing the key keep working. */
  delete: writeProcedure
    .input(z.object({ materialId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .update(workspaceMaterial)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaceMaterial.id, input.materialId),
            eq(workspaceMaterial.workspaceId, ctx.workspace.id),
            isNull(workspaceMaterial.deletedAt),
          ),
        )
        .returning({ id: workspaceMaterial.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),

  /** Which studies in this workspace currently reference a material's key (advisory). */
  usage: workspaceProcedure
    .input(z.object({ materialId: z.string() }))
    .query(async ({ ctx, input }): Promise<{ studyId: string; title: string }[]> => {
      const [m] = await db
        .select({ r2Key: workspaceMaterial.r2Key })
        .from(workspaceMaterial)
        .where(
          and(
            eq(workspaceMaterial.id, input.materialId),
            eq(workspaceMaterial.workspaceId, ctx.workspace.id),
          ),
        )
        .limit(1);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      // Best-effort scan: the key appears verbatim in a version snapshot's JSON.
      const rows = await db
        .select({ studyId: experiment.id, title: experiment.title })
        .from(experiment)
        .innerJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
        .where(
          and(
            eq(experiment.tenantId, ctx.workspace.id),
            isNull(experiment.archivedAt),
            sql`${experimentVersion.definitionSnapshot}::text LIKE ${"%" + m.r2Key + "%"}`,
          ),
        );
      return rows;
    }),
});
