import { TRPCError } from "@trpc/server";
import { and, arrayContains, count, desc, eq, ilike, inArray, isNotNull, isNull, sql } from "drizzle-orm";
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
  member,
  recruitmentSession,
  response as responseTable,
  responseItem,
  user,
} from "@/server/db/schema";
import {
  openRecruitment as runtimeOpenRecruitment,
  startResponse as runtimeStartResponse,
} from "@/server/runtime/participant";
import { getFrameworkDef } from "@/server/frameworks/registry";
import {
  type BlockDiff,
  type BlockInstance,
  blockDisplay,
  diffBlocks,
  locksFromBlocks,
  readBlocks,
  readOverview,
  validateConfig,
} from "@/server/modules/blocks";
import { getModuleDef } from "@/server/modules/registry";
import { publicProcedure, router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";

/**
 * Load a study's working tip (its current autosave version), scoped to the
 * workspace. NOT_FOUND outside the workspace; PRECONDITION_FAILED if it somehow
 * has no working version.
 */
/** Normalize free-form tag labels to deduped lowercase-hyphenated slugs (ADR-0017). */
function normalizeTags(raw: string[]): string[] {
  const slugs = raw
    .map((t) =>
      t
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter((t) => t.length > 0 && t.length <= 40);
  return [...new Set(slugs)].slice(0, 20);
}

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
  // Preserve other snapshot keys (e.g. `overview`, V1.12 B1) — only blocks change.
  const [cur] = await db
    .select({ snap: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(eq(experimentVersion.id, versionId))
    .limit(1);
  const prev = cur?.snap && typeof cur.snap === "object" ? (cur.snap as Record<string, unknown>) : {};
  await db
    .update(experimentVersion)
    .set({ definitionSnapshot: { ...prev, blocks }, moduleVersionLocks: locksFromBlocks(blocks) })
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

/**
 * The number to stamp on the next CONSCIOUS save (ADR-0012 amendment 2026-06-04).
 * Autosave is the unnumbered "Draft" (versionNumber 0); v1 is the first
 * named/preregistered/published snapshot. Count-not-max so a future deletion
 * can't leave a gap that skips a number (none are deleted today; the semantics
 * are just cleaner). This is why a researcher's first Preregister reads "v1",
 * not "v3".
 */
async function nextVersionNumber(experimentId: string): Promise<number> {
  const [c] = await db
    .select({ c: count() })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, experimentId),
        inArray(experimentVersion.kind, ["named", "preregistered", "published"]),
      ),
    );
  return (c?.c ?? 0) + 1;
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

/**
 * The ONE permission-gated cross-tenant read (ADR-0018). Loads a fork source
 * WITHOUT the active-workspace filter, and only if the caller may fork it:
 * forkable_by = 'public' (anyone) OR the caller is an active member of the
 * source's workspace (same-workspace forks of any forkability). Returns the
 * source experiment + the version to pin (latest runnable, else the tip).
 * link-only is recognised but deferred (treated as not-forkable cross-tenant).
 */
async function loadForkSource(studyId: string, callerUserId: string) {
  const [exp] = await db.select().from(experiment).where(eq(experiment.id, studyId)).limit(1);
  if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });

  const isMember =
    (
      await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.workspaceId, exp.tenantId),
            eq(member.userId, callerUserId),
            eq(member.status, "active"),
          ),
        )
        .limit(1)
    ).length > 0;
  if (!isMember && exp.forkableBy !== "public") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This study isn't open for replication." });
  }

  // Pin the latest runnable version (what's meaningful to replicate) else the tip.
  const [runnable] = await db
    .select()
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, studyId),
        inArray(experimentVersion.kind, RUNNABLE_KINDS),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  let version = runnable;
  if (!version && exp.currentVersionId) {
    [version] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, exp.currentVersionId))
      .limit(1);
  }
  if (!version) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nothing to replicate yet." });
  }
  return { experiment: exp, version };
}

/** Current-tip blocks of an experiment (for the replication diff). */
async function studyTipBlocks(exp: typeof experiment.$inferSelect): Promise<BlockInstance[]> {
  if (!exp.currentVersionId) return [];
  const [v] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(eq(experimentVersion.id, exp.currentVersionId))
    .limit(1);
  return readBlocks(v?.snapshot);
}

/** Cross-tenant load of an experiment + its tip blocks + author name (ADR-0018 replications read). */
async function studyMeta(studyId: string) {
  const [exp] = await db.select().from(experiment).where(eq(experiment.id, studyId)).limit(1);
  if (!exp) return null;
  const [u] = await db
    .select({ name: user.displayName })
    .from(user)
    .where(eq(user.id, exp.ownerId))
    .limit(1);
  return { exp, blocks: await studyTipBlocks(exp), authorName: u?.name ?? "" };
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
    if (typeof a.value === "string") return a.value; // email/url/date/dropdown/yes-no (V1.12 C2)
    if (a.values && typeof a.values === "object")
      // matrix-grid / semantic-differential (V1.12 Wave 3): "0=Agree; 1=Neutral"
      return Object.entries(a.values as Record<string, unknown>)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
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
  /** The module's display name (e.g. "Likert (7-point)"). */
  name: string;
  /** Researcher-set instance title; null = fall back to `name`. */
  title: string | null;
  ref: string;
  config: Record<string, unknown>;
  complete: boolean;
  /** Condition slugs this block is gated to; empty = shown to everyone. */
  showIfCondition: string[];
  /** Legacy equality branch rules (ADR-0021, superseded by `showIf`). */
  branchRules: { fromInstanceId: string; equals: string }[];
  /** Answer-based visibility condition tree (ADR-0021 amendment); null = flat. */
  showIf: import("@/lib/whiteboard/conditions").ConditionGroup | null;
};

export type StudyDetail = {
  id: string;
  title: string;
  stage: StudyStage;
  versionNumber: number;
  lastEditedAt: string;
  ownerId: string;
  ownerName: string;
  tags: string[];
  forkableBy: "public" | "link-only" | "private";
  isReplication: boolean;
  blocks: StudyBlock[];
  /** Whiteboard pan/zoom (ADR-0020); {} = fit-to-screen on first render. */
  whiteboardViewport: WhiteboardViewport;
  /** Researcher-authored study documentation (V1.12 B1). */
  overview: import("@/server/modules/blocks").StudyOverview;
};

/** Whiteboard canvas viewport state (ADR-0020). Empty object = fit-to-screen. */
export type WhiteboardViewport = {
  x?: number;
  y?: number;
  zoom?: number;
  /** Per-node canvas positions keyed by node id (block instanceId or `cond:slug`). */
  nodePositions?: Record<string, { x: number; y: number }>;
};

/** A node in a study's replication family (ADR-0018). `diff` is withheld (null) when the caller can't see the other study's protocol. */
export type ReplicationNode = {
  studyId: string;
  title: string;
  authorName: string;
  canSeeDetail: boolean;
  diff: BlockDiff | null;
};
export type ReplicationsView = { parent: ReplicationNode | null; children: ReplicationNode[] };

/** One row in a study's version history (ADR-0012 amendment) — the Versions sub-tab. */
export type StudyVersion = {
  id: string;
  kind: "autosave" | "named" | "preregistered" | "published";
  versionNumber: number;
  name: string | null;
  createdAt: string;
  /** True for the autosave row — the live, editable working copy (the tip). */
  isWorkingCopy: boolean;
  /** True for the most recent conscious (frozen) save, if any. */
  isLatestSaved: boolean;
  /** True when the working copy's blocks differ from the latest frozen save. */
  hasUnsavedChanges: boolean;
  pushStatus: string | null;
  doi: string | null;
};

/** A read-only block of a specific (often frozen) version, for the preview pane. */
export type VersionPreviewBlock = {
  instanceId: string;
  name: string;
  ref: string;
  complete: boolean;
};

/** Per-block diff status for the Whiteboard multi-version compare (ADR-0020 §A6). */
export type CompareStatus = "added" | "removed" | "modified" | "unchanged";

export type CompareNode = {
  instanceId: string;
  name: string;
  ref: string;
  status: CompareStatus;
  showIfCondition: string[];
};

/** Side-by-side compare of the working copy (left) vs a chosen version (right). */
export type VersionCompare = {
  leftLabel: string;
  rightLabel: string;
  left: CompareNode[];
  right: CompareNode[];
};

/** A single version rendered read-only for preview (ADR-0019). */
export type VersionPreview = {
  id: string;
  kind: "autosave" | "named" | "preregistered" | "published";
  versionNumber: number;
  name: string | null;
  blocks: VersionPreviewBlock[];
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

/** One card in the Browse-public-studies grid (ADR-0018 + browse wireframe). */
export type BrowseStudyCard = {
  studyId: string;
  title: string;
  authorId: string;
  authorName: string;
  tags: string[];
  /** Latest discoverable (frozen) version's kind + number. */
  latestKind: "published" | "preregistered";
  latestVersionNumber: number;
  replicationCount: number;
  createdAt: string;
};

export type BrowsePage = { items: BrowseStudyCard[]; nextCursor: string | null };

/** Read-only public study detail for `/browse/[studyId]` (ADR-0018). */
export type PublicStudyDetail = {
  studyId: string;
  title: string;
  authorId: string;
  authorName: string;
  tags: string[];
  latestKind: "published" | "preregistered";
  latestVersionNumber: number;
  replicationCount: number;
  blocks: VersionPreviewBlock[];
};

/** Tag + usage count for the Browse filter sidebar. */
export type BrowseTag = { tag: string; count: number };

type BrowseCursor = { c: string; i: string; r?: number };

function encodeCursor(cur: BrowseCursor): string {
  return Buffer.from(JSON.stringify(cur), "utf8").toString("base64url");
}

function decodeCursor(raw: string): BrowseCursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as BrowseCursor;
    if (typeof v.c === "string" && typeof v.i === "string") return v;
  } catch {
    // fall through
  }
  return null;
}

/**
 * Drop condition clauses that no longer reference an *earlier* block (forward
 * refs left by a reorder, or dangling refs after a remove), so the blocks JSON
 * stays internally consistent (ADR-0021 amendment). Pure; preserves order.
 */
function pruneForwardConditions(blocks: BlockInstance[]): BlockInstance[] {
  const earlier = new Set<string>();
  const out = blocks.map((b) => {
    const next = { ...b };
    if (next.showIf) {
      const clauses = next.showIf.clauses.filter((c) => earlier.has(c.fromInstanceId));
      if (clauses.length) next.showIf = { ...next.showIf, clauses };
      else delete next.showIf;
    }
    if (next.branchRules) {
      const rules = next.branchRules.filter((r) => earlier.has(r.fromInstanceId));
      if (rules.length) next.branchRules = rules;
      else delete next.branchRules;
    }
    earlier.add(b.instanceId);
    return next;
  });
  return out;
}

/** Shared condition-group input schema (ADR-0021 amendment). */
const conditionGroupSchema = z.object({
  op: z.enum(["and", "or"]),
  clauses: z
    .array(
      z.object({
        fromInstanceId: z.string(),
        operator: z.enum([
          "answered",
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "between",
          "isAnyOf",
          "contains",
          "includesAny",
        ]),
        value: z.array(z.string()).max(50),
      }),
    )
    .max(20),
});

/** A full block instance, for the undo/restore path (structurally validated). */
const blockInstanceSchema = z.object({
  instanceId: z.string(),
  source: z.string(),
  key: z.string(),
  version: z.string(),
  config: z.record(z.string(), z.unknown()),
  title: z.string().optional(),
  visibility: z.object({ showIfCondition: z.array(z.string()).optional() }).optional(),
  branchRules: z.array(z.object({ fromInstanceId: z.string(), equals: z.string() })).optional(),
  showIf: conditionGroupSchema.optional(),
});

export const studiesRouter = router({
  /**
   * Browse public studies (ADR-0018 + browse-public-studies wireframe). Public
   * — no workspace context needed to read the listing. The discoverable set is
   * `forkable_by = 'public'`, not archived, with at least one published or
   * preregistered (frozen) version. Filters: tag intersection + author name.
   * Sort: most recent or most replicated. Keyset (cursor) pagination.
   * Framework filtering is DEFERRED (no study→framework provenance in the
   * schema; owner decision 2026-06-07).
   */
  browsePublic: publicProcedure
    .input(
      z.object({
        tags: z.array(z.string()).optional(),
        authorQuery: z.string().trim().max(120).optional(),
        sort: z.enum(["recent", "replicated"]).default("recent"),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ input }): Promise<BrowsePage> => {
      const repCount = sql<number>`(select count(*)::int from ${experiment} c where c.fork_of_experiment_id = ${experiment.id})`;
      const latestNum = sql<number>`(select max(v.version_number) from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered'))`;
      const latestKind = sql<"published" | "preregistered">`(select v.kind from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered') order by v.version_number desc limit 1)`;

      const filters = [
        eq(experiment.forkableBy, "public"),
        isNull(experiment.archivedAt),
        eq(experiment.isDemo, false), // demo studies never publicly discoverable (ADR-0023)
        // Discoverable = has at least one frozen, citable version.
        sql`exists (select 1 from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered'))`,
      ];
      if (input.tags?.length) {
        // Intersection: the study must carry every selected tag (@> contains).
        filters.push(arrayContains(experiment.tags, input.tags));
      }
      if (input.authorQuery) {
        filters.push(ilike(user.displayName, `%${input.authorQuery}%`));
      }

      // Keyset cursor — rows strictly "after" the cursor in the sort order.
      const cur = input.cursor ? decodeCursor(input.cursor) : null;
      if (cur) {
        if (input.sort === "replicated") {
          filters.push(
            sql`(${repCount}, ${experiment.createdAt}, ${experiment.id}) < (${cur.r ?? 0}, ${cur.c}::timestamptz, ${cur.i}::uuid)`,
          );
        } else {
          filters.push(
            sql`(${experiment.createdAt}, ${experiment.id}) < (${cur.c}::timestamptz, ${cur.i}::uuid)`,
          );
        }
      }

      const order =
        input.sort === "replicated"
          ? [desc(repCount), desc(experiment.createdAt), desc(experiment.id)]
          : [desc(experiment.createdAt), desc(experiment.id)];

      const rows = await db
        .select({
          studyId: experiment.id,
          title: experiment.title,
          authorId: experiment.ownerId,
          authorName: user.displayName,
          tags: experiment.tags,
          createdAt: experiment.createdAt,
          replicationCount: repCount,
          latestVersionNumber: latestNum,
          latestKind: latestKind,
        })
        .from(experiment)
        .innerJoin(user, eq(user.id, experiment.ownerId))
        .where(and(...filters))
        .orderBy(...order)
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({
              c: last.createdAt.toISOString(),
              i: last.studyId,
              r: input.sort === "replicated" ? Number(last.replicationCount) : undefined,
            })
          : null;

      return {
        items: page.map((r) => ({
          studyId: r.studyId,
          title: r.title,
          authorId: r.authorId,
          authorName: r.authorName ?? "",
          tags: r.tags ?? [],
          latestKind: r.latestKind,
          latestVersionNumber: Number(r.latestVersionNumber),
          replicationCount: Number(r.replicationCount),
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    }),

  /**
   * Read-only detail for one public study (the `/browse/[studyId]` page). Public
   * — cross-tenant, so it can't reuse the workspace-scoped `getVersion`. Returns
   * the latest published/preregistered version's blocks read-only. NOT_FOUND if
   * the study isn't public or has no frozen version.
   */
  getPublicStudy: publicProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ input }): Promise<PublicStudyDetail> => {
      const [exp] = await db
        .select({
          id: experiment.id,
          title: experiment.title,
          authorId: experiment.ownerId,
          authorName: user.displayName,
          tags: experiment.tags,
        })
        .from(experiment)
        .innerJoin(user, eq(user.id, experiment.ownerId))
        .where(
          and(
            eq(experiment.id, input.studyId),
            eq(experiment.forkableBy, "public"),
            isNull(experiment.archivedAt),
            eq(experiment.isDemo, false), // demo studies aren't publicly viewable (ADR-0023)
          ),
        )
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select({
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          snapshot: experimentVersion.definitionSnapshot,
        })
        .from(experimentVersion)
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            inArray(experimentVersion.kind, ["published", "preregistered"]),
          ),
        )
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (!ver) throw new TRPCError({ code: "NOT_FOUND" });

      const [reps] = await db
        .select({ c: count() })
        .from(experiment)
        .where(eq(experiment.forkOfExperimentId, input.studyId));

      return {
        studyId: exp.id,
        title: exp.title,
        authorId: exp.authorId,
        authorName: exp.authorName ?? "",
        tags: exp.tags ?? [],
        latestKind: ver.kind as "published" | "preregistered",
        latestVersionNumber: ver.versionNumber,
        replicationCount: reps?.c ?? 0,
        blocks: readBlocks(ver.snapshot).map((b) => {
          const d = blockDisplay(b);
          return { instanceId: b.instanceId, name: d.name, ref: d.ref, complete: d.complete };
        }),
      };
    }),

  /**
   * Tags (with usage counts) across the discoverable public set, for the Browse
   * filter sidebar's autocomplete. Optional prefix query `q`.
   */
  browseTags: publicProcedure
    .input(z.object({ q: z.string().trim().max(60).optional() }).optional())
    .query(async ({ input }): Promise<BrowseTag[]> => {
      const rows = await db
        .select({ tags: experiment.tags })
        .from(experiment)
        .where(
          and(
            eq(experiment.forkableBy, "public"),
            isNull(experiment.archivedAt),
            eq(experiment.isDemo, false), // demo tags don't leak into public browse (ADR-0023)
            sql`exists (select 1 from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered'))`,
          ),
        );

      const q = input?.q?.toLowerCase();
      const counts = new Map<string, number>();
      for (const r of rows) {
        for (const tag of r.tags ?? []) {
          if (q && !tag.toLowerCase().startsWith(q)) continue;
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([tag, c]) => ({ tag, count: c }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, 50);
    }),

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
            // Seeded demo studies appear only when this workspace opts in (ADR-0023).
            ctx.workspace.showDemoContent ? undefined : eq(experiment.isDemo, false),
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
          title: b.title ?? null,
          ref: d.ref,
          config: b.config,
          complete: d.complete,
          showIfCondition: b.visibility?.showIfCondition ?? [],
          branchRules: b.branchRules ?? [],
          showIf: b.showIf ?? null,
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
        tags: row.experiment.tags ?? [],
        forkableBy: row.experiment.forkableBy,
        isReplication: row.experiment.forkOfExperimentId !== null,
        blocks,
        whiteboardViewport: (row.version?.whiteboardViewport as WhiteboardViewport | null) ?? {},
        overview: readOverview(row.version?.definitionSnapshot),
      };
    }),

  /**
   * Persist the Whiteboard canvas viewport (ADR-0020) onto the autosave tip.
   * The only new server endpoint the Whiteboard needs — all block edits reuse
   * the Builder mutations. Viewport is UX state, not part of the immutable
   * snapshot, so it writes the current (autosave) version in place.
   */
  updateWhiteboardViewport: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
        // Per-node positions to merge (drag-to-move persistence). Keyed by node id.
        nodePositions: z
          .record(z.string(), z.object({ x: z.number(), y: z.number() }))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [exp] = await db
        .select({
          currentVersionId: experiment.currentVersionId,
        })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp?.currentVersionId) throw new TRPCError({ code: "NOT_FOUND" });

      // Read-modify-write so pan/zoom and node positions persist independently.
      const [cur] = await db
        .select({ vp: experimentVersion.whiteboardViewport })
        .from(experimentVersion)
        .where(eq(experimentVersion.id, exp.currentVersionId))
        .limit(1);
      const prev = (cur?.vp as WhiteboardViewport | null) ?? {};
      const next: WhiteboardViewport = {
        ...prev,
        ...(input.viewport ?? {}),
        nodePositions: { ...(prev.nodePositions ?? {}), ...(input.nodePositions ?? {}) },
      };
      await db
        .update(experimentVersion)
        .set({ whiteboardViewport: next })
        .where(eq(experimentVersion.id, exp.currentVersionId));
      return { ok: true };
    }),

  /**
   * The replication family of a study (ADR-0018): its parent (if this study is
   * itself a fork) + its children (studies that forked it, possibly in other
   * workspaces). Each carries a block-level divergence diff — withheld (null)
   * when the caller may not see the other study's protocol (not public + not
   * the caller's workspace), so private cross-tenant protocols don't leak.
   */
  getReplications: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ReplicationsView> => {
      const [self] = await db
        .select()
        .from(experiment)
        .where(
          and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)),
        )
        .limit(1);
      if (!self) throw new TRPCError({ code: "NOT_FOUND" });
      const selfBlocks = await studyTipBlocks(self);

      const canSee = (exp: typeof experiment.$inferSelect) =>
        exp.forkableBy === "public" || exp.tenantId === ctx.workspace.id;

      let parent: ReplicationNode | null = null;
      if (self.forkOfExperimentId) {
        const meta = await studyMeta(self.forkOfExperimentId);
        if (meta) {
          const visible = canSee(meta.exp);
          parent = {
            studyId: meta.exp.id,
            title: meta.exp.title,
            authorName: meta.authorName,
            canSeeDetail: visible,
            // How THIS study diverged from its parent.
            diff: visible ? diffBlocks(meta.blocks, selfBlocks) : null,
          };
        }
      }

      const childRows = await db
        .select()
        .from(experiment)
        .where(eq(experiment.forkOfExperimentId, input.studyId))
        .orderBy(desc(experiment.createdAt));
      const children: ReplicationNode[] = [];
      for (const child of childRows) {
        const visible = canSee(child);
        const meta = visible ? await studyMeta(child.id) : null;
        const [u] = await db
          .select({ name: user.displayName })
          .from(user)
          .where(eq(user.id, child.ownerId))
          .limit(1);
        children.push({
          studyId: child.id,
          title: child.title,
          authorName: u?.name ?? "",
          canSeeDetail: visible,
          // How the child diverged from THIS study.
          diff: meta ? diffBlocks(selfBlocks, meta.blocks) : null,
        });
      }
      return { parent, children };
    }),

  /**
   * Every version of a study, oldest→newest (ADR-0012 amendment / V1.7.1 item 3).
   * Surfaces the full history behind the Builder's Versions sub-tab so "why does
   * it say v3?" is answerable: the Draft (autosave) + each conscious snapshot
   * with its kind, number, freeze status, and OSF DOI/status.
   */
  listVersions: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyVersion[]> => {
      const [exp] = await db
        .select({ id: experiment.id, currentVersionId: experiment.currentVersionId })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      const rows = await db
        .select({
          id: experimentVersion.id,
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          name: experimentVersion.name,
          createdAt: experimentVersion.createdAt,
          snapshot: experimentVersion.definitionSnapshot,
          pushStatus: experimentVersion.registryPushStatus,
          doi: experimentVersion.externalRegistrationDoi,
        })
        .from(experimentVersion)
        .where(eq(experimentVersion.experimentId, input.studyId))
        .orderBy(experimentVersion.createdAt);

      // The working copy is the autosave tip; the latest saved is the newest
      // frozen (conscious) save. "Unsaved changes" = the tip's blocks differ
      // from that latest frozen snapshot.
      const working = rows.find((r) => r.kind === "autosave");
      const frozen = rows.filter((r) => r.kind !== "autosave");
      const latestSaved = frozen.length ? frozen[frozen.length - 1] : undefined;
      const blocksKey = (snap: unknown) => JSON.stringify(readBlocks(snap));
      const hasUnsavedChanges =
        !!working && !!latestSaved && blocksKey(working.snapshot) !== blocksKey(latestSaved.snapshot);

      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        versionNumber: r.versionNumber,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        isWorkingCopy: r.kind === "autosave",
        isLatestSaved: !!latestSaved && r.id === latestSaved.id,
        hasUnsavedChanges: r.kind === "autosave" ? hasUnsavedChanges : false,
        pushStatus: r.pushStatus ?? null,
        doi: r.doi ?? null,
      }));
    }),

  /**
   * Read one version's blocks read-only for the Versions-tab preview (ADR-0019).
   * Any version (working copy or frozen) in the active workspace is previewable;
   * this never mutates anything.
   */
  getVersion: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), versionId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<VersionPreview> => {
      const [exp] = await db
        .select({ id: experiment.id })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select({
          id: experimentVersion.id,
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          name: experimentVersion.name,
          snapshot: experimentVersion.definitionSnapshot,
        })
        .from(experimentVersion)
        .where(
          and(
            eq(experimentVersion.id, input.versionId),
            eq(experimentVersion.experimentId, input.studyId),
          ),
        )
        .limit(1);
      if (!ver) throw new TRPCError({ code: "NOT_FOUND" });

      const blocks: VersionPreviewBlock[] = readBlocks(ver.snapshot).map((b) => {
        const d = blockDisplay(b);
        return { instanceId: b.instanceId, name: d.name, ref: d.ref, complete: d.complete };
      });

      return { id: ver.id, kind: ver.kind, versionNumber: ver.versionNumber, name: ver.name, blocks };
    }),

  /**
   * Restore a frozen version into the working copy (ADR-0019): copy its blocks
   * onto the autosave tip via writeBlocks. The frozen version is never mutated
   * and current_version_id keeps pointing at the tip — restore is an ordinary
   * edit. Overwrites the current working copy (the UI confirms first). Does not
   * emit an activity event (it is a private working-copy edit, not a save).
   */
  restoreVersion: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), versionId: z.string().uuid() }))
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ restoredFromNumber: number; restoredFromKind: string; blockCount: number }> => {
        const [exp] = await db
          .select({ id: experiment.id, currentVersionId: experiment.currentVersionId })
          .from(experiment)
          .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
          .limit(1);
        if (!exp || !exp.currentVersionId) throw new TRPCError({ code: "NOT_FOUND" });

        const [src] = await db
          .select({
            kind: experimentVersion.kind,
            versionNumber: experimentVersion.versionNumber,
            snapshot: experimentVersion.definitionSnapshot,
          })
          .from(experimentVersion)
          .where(
            and(
              eq(experimentVersion.id, input.versionId),
              eq(experimentVersion.experimentId, input.studyId),
            ),
          )
          .limit(1);
        if (!src) throw new TRPCError({ code: "NOT_FOUND" });
        if (src.kind === "autosave") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That version is already the working copy.",
          });
        }

        const blocks = readBlocks(src.snapshot);
        await writeBlocks(exp.currentVersionId, input.studyId, blocks);
        return {
          restoredFromNumber: src.versionNumber,
          restoredFromKind: src.kind,
          blockCount: blocks.length,
        };
      },
    ),

  /**
   * Side-by-side compare of the working copy vs a chosen frozen version for the
   * Whiteboard multi-version view (ADR-0020 §A6). Reuses the shared `diffBlocks`
   * (by instanceId): blocks only in the working copy = added (green), only in
   * the version = removed (red), present in both but ref/config differs =
   * modified (amber). Read-only; tenant-scoped.
   */
  compareVersions: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), vs: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<VersionCompare> => {
      const [exp] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select({
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          name: experimentVersion.name,
          snapshot: experimentVersion.definitionSnapshot,
        })
        .from(experimentVersion)
        .where(
          and(eq(experimentVersion.id, input.vs), eq(experimentVersion.experimentId, input.studyId)),
        )
        .limit(1);
      if (!ver) throw new TRPCError({ code: "NOT_FOUND" });

      const leftBlocks = await studyTipBlocks(exp); // working copy (child)
      const rightBlocks = readBlocks(ver.snapshot); // chosen version (parent)
      const diff = diffBlocks(rightBlocks, leftBlocks);
      const addedIds = new Set(diff.added.map((b) => b.instanceId));
      const removedIds = new Set(diff.removed.map((b) => b.instanceId));
      const changedIds = new Set(diff.changed.map((b) => b.instanceId));

      const toNode = (b: BlockInstance, side: "left" | "right"): CompareNode => {
        const d = blockDisplay(b);
        let status: CompareStatus = "unchanged";
        if (changedIds.has(b.instanceId)) status = "modified";
        else if (side === "left" && addedIds.has(b.instanceId)) status = "added";
        else if (side === "right" && removedIds.has(b.instanceId)) status = "removed";
        return {
          instanceId: b.instanceId,
          name: d.name,
          ref: d.ref,
          status,
          showIfCondition: b.visibility?.showIfCondition ?? [],
        };
      };

      const verLabel =
        ver.kind === "autosave"
          ? "Draft"
          : ver.kind === "named"
            ? `v${ver.versionNumber}${ver.name ? ` — ${ver.name}` : ""}`
            : ver.kind === "preregistered"
              ? `Preregistration v${ver.versionNumber}`
              : `Published v${ver.versionNumber}`;

      return {
        leftLabel: "Working copy",
        rightLabel: verLabel,
        left: leftBlocks.map((b) => toNode(b, "left")),
        right: rightBlocks.map((b) => toNode(b, "right")),
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

  /**
   * Set a study's research-area tags (ADR-0017). Free-form labels normalized to
   * lowercase-hyphenated slugs, deduped, capped — the followable unit + the
   * source for activity_event.related_tag_slugs.
   */
  setTags: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), tags: z.array(z.string()).max(20) }))
    .mutation(async ({ ctx, input }): Promise<{ tags: string[] }> => {
      const slugs = normalizeTags(input.tags);
      const [row] = await db
        .update(experiment)
        .set({ tags: slugs, updatedAt: new Date() })
        .where(
          and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)),
        )
        .returning({ tags: experiment.tags });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { tags: row.tags ?? [] };
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
      // Drop any condition clauses that referenced the removed block (or are now
      // forward refs) so nothing dangles.
      await writeBlocks(tip.version.id, input.studyId, pruneForwardConditions(blocks));
      return { ok: true };
    }),

  /**
   * Restore the working tip's blocks to an exact prior snapshot — the server
   * side of Builder/Whiteboard undo. The client holds the edit history; this
   * just writes the given (structurally validated, previously-valid) blocks.
   * Forward/dangling clauses are pruned defensively.
   */
  setBlocks: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), blocks: z.array(blockInstanceSchema).max(200) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = pruneForwardConditions(input.blocks as unknown as BlockInstance[]);
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { ok: true };
    }),

  /**
   * Save the study's Overview document (V1.12 B1) — abstract + named markdown
   * sections. Rides in `definition_snapshot.overview` (preserving blocks), so a
   * preregistered version freezes the narrative alongside the blocks (ADR-0012).
   */
  setOverview: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        overview: z.object({
          abstract: z.string().max(5000),
          hypotheses: z.array(z.string().max(1000)).max(30),
          replicationNotes: z.string().max(5000),
          sections: z
            .array(
              z.object({
                id: z.string(),
                heading: z.string().max(200),
                contentMd: z.string().max(20000),
              }),
            )
            .max(30),
        }),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, overview: input.overview } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return { ok: true };
    }),

  /**
   * Start an ephemeral PREVIEW run of the working draft (V1.12) — opens (idempotent)
   * a recruitment session on the autosave tip and creates a `mode:"preview"`
   * response, returning its id. The Preview stage iframes the REAL participant
   * runtime at this response so the researcher sees the true participant view
   * (one screen at a time, validation, branching). Preview responses are excluded
   * from results (getResults defaults to mode "run"); a draft preview never flips
   * the study's stage (furthestStage reads version kind, not recruitment).
   */
  startPreview: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ responseId: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const rec = await runtimeOpenRecruitment(tip.version.id);
      const res = await runtimeStartResponse({ recruitmentSessionId: rec.id, mode: "preview" });
      if ("error" in res) throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
      return { responseId: res.responseId };
    }),

  /**
   * Reorder the blocks to match `order` (a permutation of the study's block
   * instanceIds). Drives drag-to-reorder in the Builder + whiteboard list. The
   * block sequence is the participant path's spine (ADR-0021 amendment).
   * Conditions that now reference a non-earlier block are pruned so the canvas /
   * list / runtime stay consistent (the client warns first).
   */
  reorderBlocks: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), order: z.array(z.string()) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const byId = new Map(blocks.map((b) => [b.instanceId, b]));
      // Must be a permutation — same id set, no dupes/unknowns — else reject.
      if (
        input.order.length !== blocks.length ||
        new Set(input.order).size !== input.order.length ||
        input.order.some((id) => !byId.has(id))
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid block order." });
      }
      const reordered = pruneForwardConditions(input.order.map((id) => byId.get(id)!));
      await writeBlocks(tip.version.id, input.studyId, reordered);
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
   * Rename a block instance — a researcher-set title distinct from the module
   * type. Empty/blank clears it (falls back to the module's display name).
   * Stored in the blocks JSON (no migration); never shown to participants.
   */
  setBlockTitle: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        instanceId: z.string(),
        title: z.string().trim().max(120),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const idx = blocks.findIndex((b) => b.instanceId === input.instanceId);
      if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const next = { ...blocks[idx] };
      if (input.title) next.title = input.title;
      else delete next.title;
      blocks[idx] = next;
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { ok: true };
    }),

  /**
   * Set a block's answer-based branch rules (ADR-0021). Each rule shows this
   * block when the participant's answer to `fromInstanceId` equals `equals`
   * (OR across rules). Sources must be other existing blocks (no self-ref).
   * Empty array clears branching.
   */
  setBlockBranching: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        instanceId: z.string(),
        branchRules: z
          .array(z.object({ fromInstanceId: z.string(), equals: z.string() }))
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const idx = blocks.findIndex((b) => b.instanceId === input.instanceId);
      if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const ids = new Set(blocks.map((b) => b.instanceId));
      for (const r of input.branchRules) {
        if (r.fromInstanceId === input.instanceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A block can't branch from itself." });
        }
        if (!ids.has(r.fromInstanceId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown source block." });
        }
      }
      const next = { ...blocks[idx] };
      if (input.branchRules.length) next.branchRules = input.branchRules;
      else delete next.branchRules;
      blocks[idx] = next;
      await writeBlocks(tip.version.id, input.studyId, blocks);
      return { ok: true };
    }),

  /**
   * Set a block's answer-based visibility condition (ADR-0021 amendment) — a
   * type-aware AND/OR tree over earlier blocks' answers. `null` clears it (flat).
   * Source blocks must exist and not be the block itself. Replaces any legacy
   * `branchRules` on the block.
   */
  setBlockCondition: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        instanceId: z.string(),
        showIf: conditionGroupSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const idx = blocks.findIndex((b) => b.instanceId === input.instanceId);
      if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const ids = new Set(blocks.map((b) => b.instanceId));
      for (const c of input.showIf?.clauses ?? []) {
        if (c.fromInstanceId === input.instanceId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A block can't condition on itself." });
        }
        if (!ids.has(c.fromInstanceId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown source block." });
        }
      }
      const next = { ...blocks[idx] };
      delete next.branchRules; // superseded by showIf
      if (input.showIf && input.showIf.clauses.length) next.showIf = input.showIf;
      else delete next.showIf;
      blocks[idx] = next;
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

      const nextNumber = await nextVersionNumber(input.studyId);

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
        related: {
          authorUserId: tip.experiment.ownerId,
          studyId: input.studyId,
          tagSlugs: tip.experiment.tags ?? undefined,
        },
        data: {
          studyTitle: tip.experiment.title,
          versionName: named.name,
          versionNumber: named.versionNumber,
        },
      });

      return { versionNumber: named.versionNumber, name: named.name! };
    }),

  /**
   * Save as a named version AND request review from a workspace teammate
   * (ADR-0015 review_request). Mirrors saveAsNamed, then emits review_request to
   * the chosen reviewer (validated as an active member). The reviewer reads it
   * in Activity·Yours and reviews on the Share stage.
   */
  saveAndRequestReview: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        name: z.string().trim().min(1).max(64),
        reviewerUserId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ versionNumber: number; name: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);

      // The reviewer must be an active member of this workspace (V1.7 internal).
      const [reviewer] = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.workspaceId, ctx.workspace.id),
            eq(member.userId, input.reviewerUserId),
            eq(member.status, "active"),
          ),
        )
        .limit(1);
      if (!reviewer) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reviewer isn't a workspace member." });
      }

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
        throw new TRPCError({ code: "CONFLICT", message: "A version with this label already exists." });
      }

      const nextNumber = await nextVersionNumber(input.studyId);

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
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));

      // Notify the reviewer (review_request → data.reviewerUserId).
      await emit({
        type: "review_request",
        actorUserId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        targetType: "study",
        targetId: input.studyId,
        related: { authorUserId: tip.experiment.ownerId, studyId: input.studyId },
        data: {
          reviewerUserId: input.reviewerUserId,
          studyId: input.studyId,
          studyTitle: tip.experiment.title,
          versionName: named.name,
        },
      });
      // And the Follows-only new-version event.
      await emit({
        type: "new_named_version",
        actorUserId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        targetType: "study",
        targetId: input.studyId,
        related: {
          authorUserId: tip.experiment.ownerId,
          studyId: input.studyId,
          tagSlugs: tip.experiment.tags ?? undefined,
        },
        data: { studyTitle: tip.experiment.title, versionName: named.name, versionNumber: named.versionNumber },
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

        const nextNumber = await nextVersionNumber(input.studyId);

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
          related: {
            authorUserId: tip.experiment.ownerId,
            studyId: input.studyId,
            tagSlugs: tip.experiment.tags ?? undefined,
          },
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

      const nextNumber = await nextVersionNumber(input.studyId);

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
            versionNumber: 0, // autosave is the unnumbered "Draft" (ADR-0012 amendment)
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

  /**
   * Replicate (fork) a study into the caller's active workspace (ADR-0002 +
   * ADR-0018). Reads the source cross-tenant via the permission-gated loader
   * (public, or caller is a member), copies its latest runnable (else tip)
   * snapshot — instanceIds PRESERVED so the Replications diff aligns by
   * identity — plus its conditions, pins lineage to that version, and emits the
   * `fork` event (notifies the source author + their Followers). The new study
   * is private by default. No participant data is ever copied (ADR-0002 §6).
   */
  fork: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const source = await loadForkSource(input.studyId, ctx.dbUser.id);
      const blocks = readBlocks(source.version.definitionSnapshot);
      const sourceConditions = await conditionsForVersion(source.version.id);

      const newId = await db.transaction(async (tx) => {
        const [exp] = await tx
          .insert(experiment)
          .values({
            tenantId: ctx.workspace.id,
            ownerId: ctx.dbUser.id,
            title: source.experiment.title,
            tags: source.experiment.tags ?? null,
            forkOfExperimentId: source.experiment.id,
            forkOfVersionId: source.version.id,
          })
          .returning();
        const [version] = await tx
          .insert(experimentVersion)
          .values({
            experimentId: exp.id,
            versionNumber: 0, // autosave is the unnumbered "Draft" (ADR-0012 amendment)
            kind: "autosave",
            definitionSnapshot: { blocks },
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
              allocationWeight: String(c.allocationWeight),
              position: c.position,
            })),
          );
        }
        await tx
          .update(experiment)
          .set({ currentVersionId: version.id })
          .where(eq(experiment.id, exp.id));
        return exp.id;
      });

      // Notify the source author + their Followers (ADR-0015). Best-effort.
      try {
        await emit({
          type: "fork",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "study",
          targetId: source.experiment.id,
          related: {
            authorUserId: source.experiment.ownerId,
            studyId: source.experiment.id,
            tagSlugs: source.experiment.tags ?? undefined,
          },
          data: {
            studyId: source.experiment.id,
            studyTitle: source.experiment.title,
            forkStudyId: newId,
            forkAuthorId: ctx.dbUser.id,
          },
        });
      } catch {
        // The fork succeeded; the notification is non-critical.
      }
      return { id: newId };
    }),

  /** Set a study's forkability (ADR-0002/0018) — owner-workspace only. */
  setForkable: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        forkableBy: z.enum(["public", "link-only", "private"]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ forkableBy: string }> => {
      const [row] = await db
        .update(experiment)
        .set({ forkableBy: input.forkableBy, updatedAt: new Date() })
        .where(
          and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)),
        )
        .returning({ forkableBy: experiment.forkableBy });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { forkableBy: row.forkableBy };
    }),
});
