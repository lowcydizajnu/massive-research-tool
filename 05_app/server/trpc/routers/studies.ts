import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, user } from "@/server/db/schema";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

/**
 * How a new study begins (new-study-modal wireframe). Framework + Template
 * require the Framework entity + seeded data (ADR-0011 item 9), so V1 ships
 * "blank" only; the modal disables the other two per its own edge case.
 */
const START_KINDS = ["blank"] as const;

/** Sub-nav filters per the studies-destination wireframe. */
export const STUDY_FILTERS = [
  "all",
  "mine",
  "drafts",
  "preregistered",
  "published",
  "replicating",
  "archived",
] as const;
export type StudyFilter = (typeof STUDY_FILTERS)[number];

/** Researcher-facing stage, derived from the current version's kind. */
export type StudyStage = "draft" | "preregistered" | "published";

function stageFromKind(kind: string | null | undefined): StudyStage {
  if (kind === "preregistered") return "preregistered";
  if (kind === "published") return "published";
  return "draft"; // autosave / named / none
}

export type StudyListItem = {
  id: string;
  title: string;
  stage: StudyStage;
  lastEditedAt: string;
  isReplication: boolean;
  isOwner: boolean;
};

export type StudyDetail = {
  id: string;
  title: string;
  stage: StudyStage;
  versionNumber: number;
  lastEditedAt: string;
  ownerName: string;
  isReplication: boolean;
  blockCount: number;
};

export const studiesRouter = router({
  list: workspaceProcedure
    .input(z.object({ filter: z.enum(STUDY_FILTERS).default("all") }).optional())
    .query(async ({ ctx, input }): Promise<StudyListItem[]> => {
      const filter: StudyFilter = input?.filter ?? "all";

      const rows = await db
        .select({ experiment, version: experimentVersion })
        .from(experiment)
        .leftJoin(
          experimentVersion,
          eq(experiment.currentVersionId, experimentVersion.id),
        )
        .where(
          and(
            eq(experiment.tenantId, ctx.workspace.id),
            filter === "archived"
              ? isNotNull(experiment.archivedAt)
              : isNull(experiment.archivedAt),
          ),
        )
        .orderBy(desc(experiment.updatedAt));

      const items: StudyListItem[] = rows.map(({ experiment: e, version: v }) => ({
        id: e.id,
        title: e.title,
        stage: stageFromKind(v?.kind),
        lastEditedAt: e.updatedAt.toISOString(),
        isReplication: e.forkOfExperimentId !== null,
        isOwner: e.ownerId === ctx.dbUser.id,
      }));

      // Sub-nav filters beyond archived are applied in-memory (the workspace's
      // study count is small in V1; promote to SQL when it isn't).
      switch (filter) {
        case "mine":
          return items.filter((s) => s.isOwner);
        case "drafts":
          return items.filter((s) => s.stage === "draft");
        case "preregistered":
          return items.filter((s) => s.stage === "preregistered");
        case "published":
          return items.filter((s) => s.stage === "published");
        case "replicating":
          return items.filter((s) => s.isReplication);
        default:
          return items;
      }
    }),

  /**
   * Fetch one study in the active workspace (the Build stage). Scoped to the
   * tenant — a study id outside the workspace is NOT_FOUND. Blocks come from the
   * current version's definition_snapshot (opaque JSON for now; the formal
   * block format is deferred per data-model open question 3 — blank studies
   * have none yet).
   */
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyDetail> => {
      const [row] = await db
        .select({
          experiment,
          version: experimentVersion,
          ownerName: user.displayName,
        })
        .from(experiment)
        .leftJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
        .leftJoin(user, eq(experiment.ownerId, user.id))
        .where(
          and(eq(experiment.id, input.id), eq(experiment.tenantId, ctx.workspace.id)),
        )
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const def = (row.version?.definitionSnapshot ?? {}) as { blocks?: unknown[] };
      return {
        id: row.experiment.id,
        title: row.experiment.title,
        stage: stageFromKind(row.version?.kind),
        versionNumber: row.version?.versionNumber ?? 1,
        lastEditedAt: row.experiment.updatedAt.toISOString(),
        ownerName: row.ownerName ?? "",
        isReplication: row.experiment.forkOfExperimentId !== null,
        blockCount: Array.isArray(def.blocks) ? def.blocks.length : 0,
      };
    }),

  /** Rename a study (autosaves the title; the title lives on Experiment, not a version). */
  updateTitle: workspaceProcedure
    .input(
      z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200) }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string; title: string }> => {
      const [row] = await db
        .update(experiment)
        .set({ title: input.title, updatedAt: new Date() })
        .where(
          and(eq(experiment.id, input.id), eq(experiment.tenantId, ctx.workspace.id)),
        )
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: row.id, title: row.title };
    }),

  /**
   * Create a new study in the active workspace. Inserts the Experiment + its
   * first version (v1, autosave, empty definition) and points current_version_id
   * at it — all in one transaction. Returns the new study id; the caller routes
   * to its Build stage.
   */
  create: workspaceProcedure
    .input(
      z.object({
        kind: z.enum(START_KINDS).default("blank"),
        title: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const title = input.title?.trim() || "Untitled study";
      return db.transaction(async (tx) => {
        const [exp] = await tx
          .insert(experiment)
          .values({ tenantId: ctx.workspace.id, ownerId: ctx.dbUser.id, title })
          .returning();
        const [version] = await tx
          .insert(experimentVersion)
          .values({
            experimentId: exp.id,
            versionNumber: 1,
            kind: "autosave",
            definitionSnapshot: {},
            moduleVersionLocks: [],
            createdBy: ctx.dbUser.id,
          })
          .returning();
        await tx
          .update(experiment)
          .set({ currentVersionId: version.id })
          .where(eq(experiment.id, exp.id));
        return { id: exp.id };
      });
    }),
});
