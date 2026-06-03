import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { jobs } from "@/server/adapters/jobs";
import { registry } from "@/server/adapters/registry";
import { db } from "@/server/db/client";
import { emit } from "@/server/events/emit";
import {
  condition as conditionTable,
  experiment,
  experimentVersion,
  recruitmentSession,
  response as responseTable,
  responseItem,
  user,
} from "@/server/db/schema";
import { openRecruitment as runtimeOpenRecruitment } from "@/server/runtime/participant";
import { getFrameworkDef } from "@/server/frameworks/registry";
import {
  type BlockInstance,
  blockDisplay,
  locksFromBlocks,
  readBlocks,
  validateConfig,
} from "@/server/modules/blocks";
import { getModuleDef } from "@/server/modules/registry";
import { router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

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

/** A condition as the Builder UI consumes it (weight as a number). */
export type ConditionRow = {
  id: string;
  slug: string;
  name: string;
  allocationWeight: number;
  position: number;
};

function toConditionRow(row: typeof conditionTable.$inferSelect): ConditionRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    allocationWeight: Number(row.allocationWeight),
    position: row.position,
  };
}

async function conditionsForVersion(versionId: string): Promise<ConditionRow[]> {
  const rows = await db
    .select()
    .from(conditionTable)
    .where(eq(conditionTable.experimentVersionId, versionId))
    .orderBy(conditionTable.position);
  return rows.map(toConditionRow);
}

async function conditionSlugs(versionId: string): Promise<Set<string>> {
  return new Set((await conditionsForVersion(versionId)).map((c) => c.slug));
}

/** kebab-case slug: lowercase, non-alphanumerics → single hyphen, trimmed. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ensure a slug is unique within `taken` by appending -2, -3, … */
function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A module-answer as a CSV cell: likert value / joined selections / free text. */
function stringifyAnswer(answer: unknown): string {
  if (answer && typeof answer === "object") {
    const a = answer as Record<string, unknown>;
    if (typeof a.value === "number") return String(a.value);
    if (Array.isArray(a.selected)) return a.selected.map(String).join("; ");
    if (Array.isArray(a.order)) return a.order.map(String).join(" > ");
    if (typeof a.text === "string") return a.text;
    // demographics / generic object → compact key=value
    const parts = Object.entries(a)
      .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
      .map(([k, v]) => `${k}=${v}`);
    if (parts.length) return parts.join("; ");
  }
  return "";
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

const STAGE_RANK: Record<StudyStage, number> = { draft: 0, preregistered: 1, published: 2 };

/** Version kinds a study can be RUN from — immutable + collectible. A study is
 *  runnable once it's preregistered (OSF) OR published (no OSF). ADR-0013. */
const RUNNABLE_KINDS: ("preregistered" | "published")[] = ["preregistered", "published"];

/** A study's stage = the FURTHEST milestone any of its versions reached (the
 *  autosave working tip is always 'draft', so the tip's kind under-reports a
 *  preregistered/published study). */
async function furthestStage(studyId: string): Promise<StudyStage> {
  const rows = await db
    .select({ kind: experimentVersion.kind })
    .from(experimentVersion)
    .where(eq(experimentVersion.experimentId, studyId));
  let best: StudyStage = "draft";
  for (const r of rows) {
    const s = stageFromKind(r.kind);
    if (STAGE_RANK[s] > STAGE_RANK[best]) best = s;
  }
  return best;
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
  /** Condition slugs this block is gated to; empty = shown to everyone. */
  showIfCondition: string[];
};

export type StudyDetail = {
  id: string;
  title: string;
  stage: StudyStage;
  versionNumber: number;
  lastEditedAt: string;
  ownerId: string;
  ownerName: string;
  isReplication: boolean;
  blocks: StudyBlock[];
};

export type RegistryPushStatus =
  | "not_pushed"
  | "pending"
  | "pushed"
  | "failed"
  | "no_credentials"
  | "opted_out";

/** The latest preregistered version of a study + its registry-push state. */
export type PreregistrationStatus = {
  versionNumber: number;
  name: string;
  pushStatus: RegistryPushStatus;
  url: string | null;
  doi: string | null;
  lastError: string | null;
};

/** Run-stage state: whether the study is runnable (has a preregistered OR
 *  published immutable version), which kind, + recruitment status. */
export type RunInfo = {
  runnable: boolean;
  versionKind: "preregistered" | "published" | null;
  recruitment: { status: "open" | "paused" | "closed"; currentN: number } | null;
};

/** Per-condition + per-question results, plus per-response rows for CSV export. */
export type ResultsSummary = {
  versionNumber: number;
  totalCompleted: number;
  includesPreview: boolean;
  conditions: { slug: string; name: string; completed: number }[];
  questions: {
    instanceId: string;
    prompt: string;
    moduleKey: string;
    n: number;
    /** numeric → mean+n; categorical → per-option counts; text → n only. */
    kind: "numeric" | "categorical" | "text";
    mean: number | null;
    optionCounts: { value: string; count: number }[];
  }[];
  rows: {
    responseId: string;
    conditionSlug: string;
    externalPid: string | null;
    startedAt: string;
    completedAt: string | null;
    /** Per-block answer, stringified for CSV (number / joined selections / text). */
    answers: Record<string, string>;
  }[];
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

      // A study's stage is the FURTHEST milestone any of its versions reached
      // (published > preregistered > draft) — NOT the autosave working tip's
      // kind, which is always 'draft'. Otherwise a preregistered study (whose
      // tip stays an editable autosave) would never leave the Drafts filter.
      const expIds = rows.map((r) => r.experiment.id);
      const kindRows = expIds.length
        ? await db
            .select({ experimentId: experimentVersion.experimentId, kind: experimentVersion.kind })
            .from(experimentVersion)
            .where(inArray(experimentVersion.experimentId, expIds))
        : [];
      const stageByExp = new Map<string, StudyStage>();
      const rank: Record<StudyStage, number> = { draft: 0, preregistered: 1, published: 2 };
      for (const { experimentId, kind } of kindRows) {
        const s = stageFromKind(kind);
        const cur = stageByExp.get(experimentId) ?? "draft";
        if (rank[s] >= rank[cur]) stageByExp.set(experimentId, s);
      }

      const items: StudyListItem[] = rows.map(({ experiment: e }) => ({
        id: e.id,
        title: e.title,
        stage: stageByExp.get(e.id) ?? "draft",
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
          showIfCondition: b.visibility?.showIfCondition ?? [],
        };
      });

      return {
        id: row.experiment.id,
        title: row.experiment.title,
        stage: await furthestStage(input.id),
        versionNumber: row.version?.versionNumber ?? 1,
        lastEditedAt: row.experiment.updatedAt.toISOString(),
        ownerId: row.experiment.ownerId,
        ownerName: row.ownerName ?? "",
        isReplication: row.experiment.forkOfExperimentId !== null,
        blocks,
      };
    }),

  /** Rename a study (autosaves the title; the title lives on Experiment, not a version). */
  updateTitle: writeProcedure
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
  addBlock: writeProcedure
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
  removeBlock: writeProcedure
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
  updateBlockConfig: writeProcedure
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
   * Set a block's condition-visibility (builder-conditions.md, ADR-0014).
   * `showIfCondition` is a list of condition *slugs* that must all exist for the
   * study; empty = shown to everyone (the visibility key is removed).
   */
  setBlockVisibility: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        instanceId: z.string(),
        showIfCondition: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const slugs = await conditionSlugs(tip.version.id);
      const unknown = input.showIfCondition.filter((s) => !slugs.has(s));
      if (unknown.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown condition(s): ${unknown.join(", ")}`,
        });
      }
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const idx = blocks.findIndex((b) => b.instanceId === input.instanceId);
      if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const next = { ...blocks[idx] };
      if (input.showIfCondition.length) next.visibility = { showIfCondition: input.showIfCondition };
      else delete next.visibility;
      blocks[idx] = next;
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { ok: true };
    }),

  /** List the study's conditions (working-tip version), in display order. */
  listConditions: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ConditionRow[]> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      return conditionsForVersion(tip.version.id);
    }),

  /** Add a condition to the working-tip version (slug auto-derived, unique). */
  addCondition: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }): Promise<ConditionRow> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const existing = await conditionsForVersion(tip.version.id);
      const taken = new Set(existing.map((c) => c.slug));
      const slug = uniqueSlug(slugify(input.name) || "condition", taken);
      const position = existing.length;
      const [row] = await db
        .insert(conditionTable)
        .values({
          id: ulid(),
          experimentVersionId: tip.version.id,
          slug,
          name: input.name,
          allocationWeight: "1.0",
          position,
        })
        .returning();
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return toConditionRow(row);
    }),

  /** Update a condition's name / slug / weight. Slug locks once a block uses it. */
  updateCondition: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        conditionId: z.string(),
        name: z.string().trim().min(1).max(80).optional(),
        slug: z.string().trim().min(1).max(60).optional(),
        allocationWeight: z.number().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<ConditionRow> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const all = await conditionsForVersion(tip.version.id);
      const target = all.find((c) => c.id === input.conditionId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.allocationWeight !== undefined) set.allocationWeight = String(input.allocationWeight);
      if (input.slug !== undefined && input.slug !== target.slug) {
        const desired = slugify(input.slug);
        if (all.some((c) => c.id !== target.id && c.slug === desired)) {
          throw new TRPCError({ code: "CONFLICT", message: "A condition with this slug already exists." });
        }
        // Slug locks once a block references it (visibility stores slugs).
        const referenced = readBlocks(tip.version.definitionSnapshot).some((b) =>
          b.visibility?.showIfCondition?.includes(target.slug),
        );
        if (referenced) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This condition's slug is locked because a block shows only to it. Rename the name instead.",
          });
        }
        set.slug = desired;
      }
      const [row] = await db
        .update(conditionTable)
        .set(set)
        .where(eq(conditionTable.id, target.id))
        .returning();
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return toConditionRow(row);
    }),

  /** Remove a condition + strip its slug from every block's visibility. */
  removeCondition: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), conditionId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const all = await conditionsForVersion(tip.version.id);
      const target = all.find((c) => c.id === input.conditionId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      const blocks = readBlocks(tip.version.definitionSnapshot).map((b) => {
        const gate = b.visibility?.showIfCondition;
        if (!gate?.includes(target.slug)) return b;
        const next = gate.filter((s) => s !== target.slug);
        const nb = { ...b };
        if (next.length) nb.visibility = { showIfCondition: next };
        else delete nb.visibility;
        return nb;
      });
      await writeBlocks(tip.version.id, input.studyId, blocks);
      await db.delete(conditionTable).where(eq(conditionTable.id, target.id));
      return { ok: true };
    }),

  /**
   * Save as a named version — snapshot the autosave working tip into a new
   * immutable `named` version (ADR-0012). The autosave continues unchanged.
   * Label must be unique within the study's history.
   */
  saveAsNamed: writeProcedure
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

      // Follows-only event (ADR-0015): no notification rows, but it lands in
      // activity_event so followers of this author/study see the new version.
      await emit({
        type: "new_named_version",
        actorUserId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        targetType: "study",
        targetId: input.studyId,
        related: { authorUserId: tip.experiment.ownerId, studyId: input.studyId },
        data: {
          studyTitle: tip.experiment.title,
          versionName: named.name,
          versionNumber: named.versionNumber,
        },
      });

      return { versionNumber: named.versionNumber, name: named.name! };
    }),

  /**
   * Preregister — snapshot the autosave working tip into an immutable
   * `preregistered` version (ADR-0002/0012) and, if the researcher has a
   * registry connection, enqueue the async OSF push (ADR-0005). The push
   * itself runs in the `registry.push` background job; this mutation only
   * creates the frozen version + sets its initial push status. Returns the new
   * version number + the push status the UI banner reflects.
   */
  preregister: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ versionNumber: number; pushStatus: "pending" | "no_credentials" }> => {
        const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);

        const [latest] = await db
          .select({ n: experimentVersion.versionNumber })
          .from(experimentVersion)
          .where(eq(experimentVersion.experimentId, input.studyId))
          .orderBy(desc(experimentVersion.versionNumber))
          .limit(1);
        const nextNumber = (latest?.n ?? 0) + 1;

        // Connected? Decides whether we enqueue a push or park as no_credentials.
        const connection = await registry.getConnection(ctx.dbUser.id);
        const pushStatus = connection.connected ? "pending" : "no_credentials";

        const [pre] = await db
          .insert(experimentVersion)
          .values({
            experimentId: input.studyId,
            versionNumber: nextNumber,
            kind: "preregistered",
            name: `Preregistration v${nextNumber}`,
            definitionSnapshot: tip.version.definitionSnapshot,
            moduleVersionLocks: tip.version.moduleVersionLocks,
            createdBy: ctx.dbUser.id,
            registryPushStatus: pushStatus,
          })
          .returning();

        // Conditions FK to experiment_version (ADR-0014), so freeze them into
        // the immutable snapshot too — copy the working-tip conditions onto the
        // new preregistered version (fresh ULIDs, same slug/name/weight/position
        // so the slug-based block visibility carries over unchanged).
        const tipConditions = await conditionsForVersion(tip.version.id);
        if (tipConditions.length) {
          await db.insert(conditionTable).values(
            tipConditions.map((c) => ({
              id: ulid(),
              experimentVersionId: pre.id,
              slug: c.slug,
              name: c.name,
              allocationWeight: String(c.allocationWeight),
              position: c.position,
            })),
          );
        }

        await db
          .update(experiment)
          .set({ updatedAt: new Date() })
          .where(eq(experiment.id, input.studyId));

        if (connection.connected) {
          await jobs.enqueue("registry.push", {
            experimentVersionId: pre.id,
            registryKey: "osf",
            userId: ctx.dbUser.id,
            isAmendment: false,
          });
        }

        // Follows-only event (ADR-0015): preregistration freezes an open-science
        // version — surfaced to followers via activity_event (no notifications).
        // The OSF push completion (with DOI) emits its own event from the job.
        await emit({
          type: "preregister_complete",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "study",
          targetId: input.studyId,
          related: { authorUserId: tip.experiment.ownerId, studyId: input.studyId },
          data: {
            studyTitle: tip.experiment.title,
            versionName: pre.name,
            versionNumber: pre.versionNumber,
          },
        });

        return { versionNumber: pre.versionNumber, pushStatus };
      },
    ),

  /**
   * Publish — freeze the autosave working tip into an immutable `published`
   * version to RUN it, WITHOUT an OSF preregistration (ADR-0013 amendment:
   * preregistration isn't required to run). Mirrors preregister (copies
   * conditions into the snapshot) but does no OSF push. For pilots / exploratory
   * studies; the open-science path stays `preregister`.
   */
  publish: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ versionNumber: number }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);

      const [latest] = await db
        .select({ n: experimentVersion.versionNumber })
        .from(experimentVersion)
        .where(eq(experimentVersion.experimentId, input.studyId))
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      const nextNumber = (latest?.n ?? 0) + 1;

      const [pub] = await db
        .insert(experimentVersion)
        .values({
          experimentId: input.studyId,
          versionNumber: nextNumber,
          kind: "published",
          name: `Published v${nextNumber}`,
          definitionSnapshot: tip.version.definitionSnapshot,
          moduleVersionLocks: tip.version.moduleVersionLocks,
          createdBy: ctx.dbUser.id,
        })
        .returning();

      // Freeze the conditions into the snapshot too (same as preregister).
      const tipConditions = await conditionsForVersion(tip.version.id);
      if (tipConditions.length) {
        await db.insert(conditionTable).values(
          tipConditions.map((c) => ({
            id: ulid(),
            experimentVersionId: pub.id,
            slug: c.slug,
            name: c.name,
            allocationWeight: String(c.allocationWeight),
            position: c.position,
          })),
        );
      }
      await db
        .update(experiment)
        .set({ updatedAt: new Date() })
        .where(eq(experiment.id, input.studyId));
      return { versionNumber: pub.versionNumber };
    }),

  /**
   * Retry the OSF push for the latest preregistered version (recovers from a
   * `failed` / `no_credentials` push without creating a new version — the
   * frozen snapshot is fine; only the push failed). Resets the status and
   * re-enqueues the job if connected.
   */
  retryPush: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ pushStatus: "pending" | "no_credentials" }> => {
        const [exp] = await db
          .select({ id: experiment.id })
          .from(experiment)
          .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
          .limit(1);
        if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });

        const [pre] = await db
          .select({ id: experimentVersion.id })
          .from(experimentVersion)
          .where(
            and(
              eq(experimentVersion.experimentId, input.studyId),
              eq(experimentVersion.kind, "preregistered"),
            ),
          )
          .orderBy(desc(experimentVersion.versionNumber))
          .limit(1);
        if (!pre) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Nothing to retry — this study has no preregistration yet.",
          });
        }

        const connection = await registry.getConnection(ctx.dbUser.id);
        const pushStatus = connection.connected ? "pending" : "no_credentials";
        await db
          .update(experimentVersion)
          .set({ registryPushStatus: pushStatus, registryPushLastError: null })
          .where(eq(experimentVersion.id, pre.id));

        if (connection.connected) {
          await jobs.enqueue("registry.push", {
            experimentVersionId: pre.id,
            registryKey: "osf",
            userId: ctx.dbUser.id,
            isAmendment: false,
          });
        }
        return { pushStatus };
      },
    ),

  /**
   * The latest preregistered version of a study + its registry-push status
   * (drives the Preregister-stage receipt/banner). Null when never
   * preregistered. Tenant-scoped: NOT_FOUND outside the active workspace.
   */
  getPreregistration: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<PreregistrationStatus | null> => {
      const [exp] = await db
        .select({ id: experiment.id })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });

      const [pre] = await db
        .select({
          versionNumber: experimentVersion.versionNumber,
          name: experimentVersion.name,
          pushStatus: experimentVersion.registryPushStatus,
          url: experimentVersion.externalRegistrationUrl,
          doi: experimentVersion.externalRegistrationDoi,
          lastError: experimentVersion.registryPushLastError,
        })
        .from(experimentVersion)
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experimentVersion.kind, "preregistered"),
          ),
        )
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (!pre) return null;
      return {
        versionNumber: pre.versionNumber,
        name: pre.name ?? `Preregistration v${pre.versionNumber}`,
        pushStatus: pre.pushStatus,
        url: pre.url,
        doi: pre.doi,
        lastError: pre.lastError,
      };
    }),

  /**
   * Run-stage state: is the study preregistered (runnable), and is recruitment
   * open? Tenant-scoped. Drives the Run stage UI + recruitment link.
   */
  getRunInfo: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<RunInfo> => {
      const [ver] = await db
        .select({ id: experimentVersion.id, kind: experimentVersion.kind })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experiment.tenantId, ctx.workspace.id),
            inArray(experimentVersion.kind, RUNNABLE_KINDS),
          ),
        )
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (!ver) return { runnable: false, versionKind: null, recruitment: null };

      const [rs] = await db
        .select({ status: recruitmentSession.status, currentN: recruitmentSession.currentN })
        .from(recruitmentSession)
        .where(eq(recruitmentSession.experimentVersionId, ver.id))
        .orderBy(desc(recruitmentSession.openedAt))
        .limit(1);
      return {
        runnable: true,
        versionKind: ver.kind as "preregistered" | "published",
        recruitment: rs ? { status: rs.status, currentN: rs.currentN } : null,
      };
    }),

  /**
   * Open recruitment for the study's latest runnable version — preregistered
   * OR published (Run stage). Ensures a default condition + an open
   * recruitment_session (idempotent).
   */
  openRecruitment: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [ver] = await db
        .select({ id: experimentVersion.id })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experiment.tenantId, ctx.workspace.id),
            inArray(experimentVersion.kind, RUNNABLE_KINDS),
          ),
        )
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (!ver) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Preregister or publish this study before opening recruitment.",
        });
      }
      await runtimeOpenRecruitment(ver.id);
      return { ok: true };
    }),

  /**
   * Results for the study's latest preregistered version (results-stage.md):
   * per-condition completion counts, per-question summaries (likert mean + n),
   * and per-response rows for CSV export. Excludes preview unless asked.
   * Aggregated in-memory (V1 study sizes are small). Null if not preregistered.
   */
  getResults: workspaceProcedure
    .input(
      z.object({ studyId: z.string().uuid(), includePreview: z.boolean().default(false) }),
    )
    .query(async ({ ctx, input }): Promise<ResultsSummary | null> => {
      const [ver] = await db
        .select({ id: experimentVersion.id, n: experimentVersion.versionNumber, snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experiment.tenantId, ctx.workspace.id),
            inArray(experimentVersion.kind, RUNNABLE_KINDS),
          ),
        )
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (!ver) return null;

      const conditions = await db
        .select({ id: conditionTable.id, slug: conditionTable.slug, name: conditionTable.name, position: conditionTable.position })
        .from(conditionTable)
        .where(eq(conditionTable.experimentVersionId, ver.id))
        .orderBy(conditionTable.position);
      const condBySlug = new Map(conditions.map((c) => [c.id, c]));

      const modes: ("run" | "preview")[] = input.includePreview ? ["run", "preview"] : ["run"];
      const completed = await db
        .select({
          id: responseTable.id,
          conditionId: responseTable.conditionId,
          externalPid: responseTable.externalPid,
          startedAt: responseTable.startedAt,
          completedAt: responseTable.completedAt,
        })
        .from(responseTable)
        .where(
          and(
            eq(responseTable.experimentVersionId, ver.id),
            eq(responseTable.status, "completed"),
            inArray(responseTable.mode, modes),
          ),
        );

      const items = completed.length
        ? await db
            .select({
              responseId: responseItem.responseId,
              blockInstanceId: responseItem.blockInstanceId,
              answer: responseItem.answer,
            })
            .from(responseItem)
            .where(inArray(responseItem.responseId, completed.map((r) => r.id)))
        : [];

      // Per-condition completion counts (every condition shown, even at 0).
      const completedByCondition = new Map<string, number>();
      for (const r of completed) {
        completedByCondition.set(r.conditionId, (completedByCondition.get(r.conditionId) ?? 0) + 1);
      }

      // Per-question summary by answer shape (numeric / categorical / text) +
      // a stringified per-response value for the CSV.
      const blocks = readBlocks(ver.snapshot);
      const questionBlocks = blocks.filter(
        (b) => getModuleDef(b.source, b.key, b.version)?.collectsResponse,
      );
      const kindOf = (key: string): "numeric" | "categorical" | "text" =>
        key === "multiple-choice" || key === "attention-check"
          ? "categorical"
          : key === "free-text" || key === "ranking" || key === "demographics"
            ? "text"
            : "numeric"; // likert-7, slider

      const itemsByBlock = new Map<string, unknown[]>();
      const answersByResponse = new Map<string, Record<string, string>>();
      for (const it of items) {
        const arr = itemsByBlock.get(it.blockInstanceId) ?? [];
        arr.push(it.answer);
        itemsByBlock.set(it.blockInstanceId, arr);
        const row = answersByResponse.get(it.responseId) ?? {};
        row[it.blockInstanceId] = stringifyAnswer(it.answer);
        answersByResponse.set(it.responseId, row);
      }

      const questions = questionBlocks.map((b) => {
        const kind = kindOf(b.key);
        const answers = itemsByBlock.get(b.instanceId) ?? [];
        const prompt =
          typeof b.config?.prompt === "string" && b.config.prompt ? b.config.prompt : b.key;

        if (kind === "numeric") {
          const vals = answers
            .map((a) => Number((a as { value?: unknown })?.value))
            .filter((v) => Number.isFinite(v));
          const n = vals.length;
          return {
            instanceId: b.instanceId,
            prompt,
            moduleKey: b.key,
            n,
            kind,
            mean: n > 0 ? vals.reduce((x, y) => x + y, 0) / n : null,
            optionCounts: [],
          };
        }
        if (kind === "categorical") {
          const counts = new Map<string, number>();
          let n = 0;
          for (const a of answers) {
            const selected = (a as { selected?: unknown })?.selected;
            if (Array.isArray(selected) && selected.length) {
              n++;
              for (const s of selected) counts.set(String(s), (counts.get(String(s)) ?? 0) + 1);
            }
          }
          return {
            instanceId: b.instanceId,
            prompt,
            moduleKey: b.key,
            n,
            kind,
            mean: null,
            optionCounts: [...counts.entries()].map(([value, count]) => ({ value, count })),
          };
        }
        // text (free-text / ranking / demographics) — count any non-empty answer
        const n = answers.filter((a) => stringifyAnswer(a).trim().length > 0).length;
        return { instanceId: b.instanceId, prompt, moduleKey: b.key, n, kind, mean: null, optionCounts: [] };
      });

      return {
        versionNumber: ver.n,
        totalCompleted: completed.length,
        includesPreview: input.includePreview,
        conditions: conditions.map((c) => ({
          slug: c.slug,
          name: c.name,
          completed: completedByCondition.get(c.id) ?? 0,
        })),
        questions,
        rows: completed.map((r) => ({
          responseId: r.id,
          conditionSlug: condBySlug.get(r.conditionId)?.slug ?? "?",
          externalPid: r.externalPid,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          answers: answersByResponse.get(r.id) ?? {},
        })),
      };
    }),

  /**
   * Create a new study in the active workspace. Inserts the Experiment + its
   * first version (v1, autosave, empty definition) and points current_version_id
   * at it — all in one transaction. Returns the new study id; the caller routes
   * to its Build stage.
   */
  create: writeProcedure
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
