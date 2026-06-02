import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db } from "@/server/db/client";
import { experiment, experimentVersion, user } from "@/server/db/schema";
import { getFrameworkDef } from "@/server/frameworks/registry";
import {
  type BlockInstance,
  blockDisplay,
  locksFromBlocks,
  readBlocks,
  validateConfig,
} from "@/server/modules/blocks";
import { getModuleDef } from "@/server/modules/registry";
import { router, workspaceProcedure } from "@/server/trpc/trpc";

/**
 * Load a study's working tip (its current autosave version), scoped to the
 * workspace. NOT_FOUND outside the workspace; PRECONDITION_FAILED if it somehow
 * has no working version.
 */
async function loadWorkingTip(studyId: string, workspaceId: string) {
  const [row] = await db
    .select({ experiment, version: experimentVersion })
    .from(experiment)
    .leftJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
    .where(and(eq(experiment.id, studyId), eq(experiment.tenantId, workspaceId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (!row.version) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No working version." });
  }
  return { experiment: row.experiment, version: row.version };
}

/**
 * Persist the block set to the autosave working tip (ADR-0012): definition
 * snapshot + derived module_version_locks, and touch the experiment. No
 * transaction — last-write-wins per ADR-0012's V1 concurrency decision.
 */
async function writeBlocks(
  versionId: string,
  studyId: string,
  blocks: ReturnType<typeof readBlocks>,
) {
  await db
    .update(experimentVersion)
    .set({ definitionSnapshot: { blocks }, moduleVersionLocks: locksFromBlocks(blocks) })
    .where(eq(experimentVersion.id, versionId));
  await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, studyId));
}

/**
 * How a new study begins (new-study-modal wireframe). Framework + Template
 * require the Framework entity + seeded data (ADR-0011 item 9), so V1 ships
 * "blank" only; the modal disables the other two per its own edge case.
 */
const START_KINDS = ["blank", "framework"] as const;

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

export type StudyBlock = {
  instanceId: string;
  source: string;
  key: string;
  version: string;
  name: string;
  ref: string;
  config: Record<string, unknown>;
  complete: boolean;
};

export type StudyDetail = {
  id: string;
  title: string;
  stage: StudyStage;
  versionNumber: number;
  lastEditedAt: string;
  ownerName: string;
  isReplication: boolean;
  blocks: StudyBlock[];
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

      const blocks: StudyBlock[] = readBlocks(row.version?.definitionSnapshot).map((b) => {
        const d = blockDisplay(b);
        return {
          instanceId: b.instanceId,
          source: b.source,
          key: b.key,
          version: b.version,
          name: d.name,
          ref: d.ref,
          config: b.config,
          complete: d.complete,
        };
      });

      return {
        id: row.experiment.id,
        title: row.experiment.title,
        stage: stageFromKind(row.version?.kind),
        versionNumber: row.version?.versionNumber ?? 1,
        lastEditedAt: row.experiment.updatedAt.toISOString(),
        ownerName: row.ownerName ?? "",
        isReplication: row.experiment.forkOfExperimentId !== null,
        blocks,
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

  /** Append a block (from the module catalogue) to the study's working tip. */
  addBlock: workspaceProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        source: z.string(),
        key: z.string(),
        version: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ instanceId: string }> => {
      const def = getModuleDef(input.source, input.key, input.version);
      if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown module." });
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const instanceId = ulid();
      blocks.push({
        instanceId,
        source: def.source,
        key: def.key,
        version: def.version,
        config: def.defaultConfig,
      });
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { instanceId };
    }),

  /** Remove a block by instance id. */
  removeBlock: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot).filter(
        (b) => b.instanceId !== input.instanceId,
      );
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { ok: true };
    }),

  /** Update a block's config (validated against its module schema, ADR-0012). */
  updateBlockConfig: workspaceProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        instanceId: z.string(),
        config: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const idx = blocks.findIndex((b) => b.instanceId === input.instanceId);
      if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const target = blocks[idx];
      let validated: Record<string, unknown>;
      try {
        validated = validateConfig(target.source, target.key, target.version, input.config);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid block config." });
      }
      blocks[idx] = { ...target, config: validated };
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { ok: true };
    }),

  /**
   * Save as a named version — snapshot the autosave working tip into a new
   * immutable `named` version (ADR-0012). The autosave continues unchanged.
   * Label must be unique within the study's history.
   */
  saveAsNamed: workspaceProcedure
    .input(
      z.object({ studyId: z.string().uuid(), name: z.string().trim().min(1).max(64) }),
    )
    .mutation(async ({ ctx, input }): Promise<{ versionNumber: number; name: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);

      const existing = await db
        .select({ id: experimentVersion.id })
        .from(experimentVersion)
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experimentVersion.name, input.name),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A version with this label already exists.",
        });
      }

      const [latest] = await db
        .select({ n: experimentVersion.versionNumber })
        .from(experimentVersion)
        .where(eq(experimentVersion.experimentId, input.studyId))
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      const nextNumber = (latest?.n ?? 0) + 1;

      const [named] = await db
        .insert(experimentVersion)
        .values({
          experimentId: input.studyId,
          versionNumber: nextNumber,
          kind: "named",
          name: input.name,
          definitionSnapshot: tip.version.definitionSnapshot,
          moduleVersionLocks: tip.version.moduleVersionLocks,
          createdBy: ctx.dbUser.id,
        })
        .returning();
      await db
        .update(experiment)
        .set({ updatedAt: new Date() })
        .where(eq(experiment.id, input.studyId));

      return { versionNumber: named.versionNumber, name: named.name! };
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
        frameworkKey: z.string().optional(),
        title: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      // Blank → no blocks; Framework → copy the framework's blocks with fresh ULIDs.
      let blocks: BlockInstance[] = [];
      if (input.kind === "framework") {
        const fw = input.frameworkKey ? getFrameworkDef(input.frameworkKey) : undefined;
        if (!fw) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown framework." });
        blocks = fw.blocks.map((b) => ({
          instanceId: ulid(),
          source: b.source,
          key: b.key,
          version: b.version,
          config: b.config,
        }));
      }
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
            definitionSnapshot: { blocks },
            moduleVersionLocks: locksFromBlocks(blocks),
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
