import { TRPCError } from "@trpc/server";
import { and, arrayContains, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { jobs } from "@/server/adapters/jobs";
import { registry } from "@/server/adapters/registry";
import { trackEvent } from "@/server/analytics/track";
import { db } from "@/server/db/client";
import { deleteStudyResponses, StudyNotFoundError } from "@/server/db/delete-responses";
import { collectStudyParticipantMediaKeys } from "@/server/db/collect-study-media";
import { deleteStudy, StudyNotFoundError as StudyGoneError, TemplateExistsError } from "@/server/db/delete-study";
import { emit } from "@/server/events/emit";
import { createHash } from "node:crypto";

import {
  activityEvent,
  aiProviderConnection,
  condition as conditionTable,
  changeProposal,
  comment,
  condition,
  customModule,
  experiment,
  experimentVersion,
  member,
  mention,
  panelMember,
  payoutRecord,
  playgroundCard,
  previewToken,
  providerSubmission,
  qualityFlag,
  recruitmentSession,
  registryPush,
  response as responseTable,
  responseItem,
  savedRecord,
  studyEditEvent,
  studyPresence,
  studyRecord,
  user,
  workspaceTemplate,
} from "@/server/db/schema";
import { sanitizeLayout as sanitizeRecordLayout } from "@/lib/study-record/sections";
import { extractMaterials } from "@/lib/study-record/materials";
import {
  type CustomModuleDefinition,
  definitionToBlocks,
  groupToDefinition,
} from "@/lib/custom-modules";
import {
  openRecruitment as runtimeOpenRecruitment,
  setRecruitmentStatus as runtimeSetRecruitmentStatus,
  startResponse as runtimeStartResponse,
} from "@/server/runtime/participant";
import {
  type BlockDiff,
  type BlockInstance,
  alignBlocksForDiff,
  blockDisplay,
  diffBlocks,
  groupChangeLine,
  locksFromBlocks,
  readBlocks,
  readOverview,
  readGroups,
  readFactors,
  readVariantBindings,
  summarizeConfigDiff,
  validateConfig,
} from "@/server/modules/blocks";
import { cellLabel, pruneBindings, type VariantBinding, type VariantFactor } from "@/lib/variants/factorial";
import { changelogBetween, initialVersionSummary, DEFAULT_NEW_STUDY_SNAPSHOT } from "@/server/modules/changelog";
import { recordStudyEdit } from "@/server/modules/study-edits";
import { readConsent, type StudyConsent } from "@/server/modules/consent";
import { runPreflight, type PreflightCheck } from "@/server/modules/preflight";
import { BRANDING_GATE_MESSAGE, evaluateBrandingGate } from "@/server/modules/branding-gate";
import { registry as registryAdapter } from "@/server/adapters/registry";
import { divergenceAgainstPinned, injectReplicationRecipe, type DivergenceStatus } from "@/server/modules/replication";
import { getModuleDef } from "@/server/modules/registry";
import { protocolText } from "@/server/modules/protocol-text";
import { decryptSecret } from "@/server/crypto/tokens";
import { storage } from "@/server/adapters/storage";
import { runTts, AiBudgetExceededError } from "@/server/runtime/ai-gateway";
import { applyVisualContext, readTheme, requiresAcknowledgment, resolveSocialPost, socialPostSchema, studyThemeSchema } from "@/lib/themes/themes";
import { sanitizeUiCopy } from "@/lib/take/ui-copy";
import { resolvePanelIntegration, sanitizePanelIntegration } from "@/lib/take/panel-integration";
import { diffLines } from "@/lib/diff-lines";
import { publicProcedure, router, workspaceProcedure, writeProcedure } from "@/server/trpc/trpc";
import { demoStudyCondition } from "@/server/trpc/routers/_demo";
import type { MemberRole } from "@/server/workspace/active";

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

/**
 * ADR-0084 hard gate. Refuse to freeze (preregister / amend / publish) or make
 * live a study whose effectively-`branded` social-post blocks lack a researcher-
 * uploaded logo, or whose study lacks an IRB attestation. Mirrors the mimic-
 * acknowledgment rejection in setTheme (PRECONDITION_FAILED). Advisory-only on
 * the preflight; ENFORCED here.
 */
function assertBrandingGate(snapshot: unknown): void {
  if (!evaluateBrandingGate(snapshot).ok) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: BRANDING_GATE_MESSAGE });
  }
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
  // Optional edit-log entry (ADR-0086) — user-facing block mutations pass this so
  // the change appears in the changelog Detailed timeline; internal rewrites omit it.
  edit?: { actorUserId: string | null; summary: string },
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
  if (edit) await recordStudyEdit(studyId, edit.actorUserId, "blocks", edit.summary);
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

/** Stable JSON (recursively sorted keys) so snapshot/condition comparisons are
 *  order-insensitive — a key-reorder never reads as a meaningful change. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Everything a frozen version captures that reaches participants — the FULL
 * definition snapshot (blocks + consent + theme + overview + groups) AND the
 * per-version conditions (slug/name/weight/position). Comparing two versions'
 * fingerprints detects whether the editable tip has diverged from a frozen
 * version (ADR-0044). Comparing only blocks (the old check) missed consent /
 * theme / condition-weight edits — the same silent-drift failure, narrower.
 */
async function versionFingerprint(versionId: string, snapshot: unknown): Promise<string> {
  const raw = await conditionsForVersion(versionId);
  // Normalize empty → the implicit default control that ensureConditions seeds at
  // freeze/open time. Without this, a study that relied on the auto-seeded control
  // (no explicit conditions on the tip) would read as drift vs its frozen copy.
  const effective = raw.length
    ? raw
    : [{ slug: "control", name: "Control", allocationWeight: 1, position: 0 } as ConditionRow];
  const conds = effective
    .map((c) => ({ slug: c.slug, name: c.name, weight: c.allocationWeight, position: c.position }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.position - b.position));
  return stableStringify({ snapshot, conds });
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

  // Pin the latest runnable (frozen) version — what's meaningful to replicate.
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
  // Carve-out (ADR-0018 amendment 2026-06-14): only a same-workspace member may
  // replicate an unfrozen DRAFT — that's duplicating your own work-in-progress.
  // A public / cross-workspace replication requires a FROZEN version; you can't
  // replicate a moving draft.
  if (!version && isMember && exp.currentVersionId) {
    [version] = await db
      .select()
      .from(experimentVersion)
      .where(eq(experimentVersion.id, exp.currentVersionId))
      .limit(1);
  }
  if (!version) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This study isn’t frozen yet — preregister or publish it before it can be replicated.",
    });
  }
  return { experiment: exp, version };
}

/**
 * Where a replication/template lands (ADR-0055). Defaults to the active
 * workspace; when a different `targetWorkspaceId` is chosen (the global-Browse
 * "into which workspace?" picker), the caller must be an active, write-capable
 * member of it. Returns the validated tenant id.
 */
async function resolveTargetTenant(callerUserId: string, activeWorkspaceId: string, target: string | undefined): Promise<string> {
  if (!target || target === activeWorkspaceId) return activeWorkspaceId;
  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.workspaceId, target), eq(member.userId, callerUserId), eq(member.status, "active")))
    .limit(1);
  if (!m || m.role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can't create studies in that workspace." });
  }
  return target;
}

/** Current-tip blocks of an experiment (for the replication diff). */
async function studyTipSnapshot(exp: typeof experiment.$inferSelect): Promise<unknown> {
  if (!exp.currentVersionId) return {};
  const [v] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(eq(experimentVersion.id, exp.currentVersionId))
    .limit(1);
  return v?.snapshot ?? {};
}

async function studyTipBlocks(exp: typeof experiment.$inferSelect): Promise<BlockInstance[]> {
  return readBlocks(await studyTipSnapshot(exp));
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
    if (Array.isArray(a.selected)) {
      // multiple-choice / hot-spot. hot-spot setValue actions (ADR-0043) append
      // `| tags: key=value; …` so they surface in the CSV.
      const sel = a.selected.map(String).join("; ");
      const t = a.tags;
      if (t && typeof t === "object" && !Array.isArray(t)) {
        const tags = Object.entries(t as Record<string, unknown>)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        if (tags) return sel ? `${sel} | tags: ${tags}` : `tags: ${tags}`;
      }
      return sel;
    }
    if (Array.isArray(a.order)) return a.order.map(String).join(" > ");
    if (Array.isArray(a.messages)) {
      // ai-chat transcript (ADR-0061): "Participant: … ⏎ AI: …".
      return (a.messages as Array<{ role?: unknown; content?: unknown }>)
        .filter((m) => typeof m?.content === "string")
        .map((m) => `${m.role === "user" ? "Participant" : "AI"}: ${m.content as string}`)
        .join("\n");
    }
    if (typeof a.text === "string") return a.text;
    if (Array.isArray(a.points)) return `${(a.points as unknown[]).length} point(s)`; // heat-map
    if (typeof a.r2Key === "string") {
      const fn = typeof a.filename === "string" ? ` (${a.filename})` : "";
      return `${a.r2Key}${fn}`; // signature / file-upload / video-record
    }
    if (typeof a.value === "number" && a.value <= 1 && a.value >= 0 && !("values" in a)) return `${Math.round(a.value * 100)}%`; // graphic-slider
    if (typeof a.shownMs === "number") return `${a.shownMs} ms shown`; // timed-exposure
    if (typeof a.waitedMs === "number") return `${a.waitedMs} ms waited`; // forced-wait
    if (Array.isArray(a.path)) return (a.path as unknown[]).map(String).join(" > "); // drill-down
    if (typeof a.intention === "string") {
      // share-intention
      const why = typeof a.why === "string" && a.why ? ` — ${a.why}` : "";
      return `${a.intention}${why}`;
    }
    if (typeof a.accuracy === "string") {
      // accuracy-confidence
      return `${a.accuracy} (confidence: ${typeof a.confidence === "number" ? a.confidence : "?"})`;
    }
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

/** Sort order for the Studies list (feedback 01KW4SRZ). A–Z is the default. */
export const STUDY_SORTS = ["az", "za", "recent"] as const;
export type StudySort = (typeof STUDY_SORTS)[number];

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

/**
 * Enforce the "at most one OPEN recruitment session among a study's RUNNABLE
 * versions" invariant at the APPLICATION layer (ADR-0044). Deliberately not a DB
 * constraint — keeping it in code leaves room for future multi-version routing
 * (e.g. concurrent A/B versions) without a migration to undo. Closes any
 * open/paused session on the study's runnable versions EXCEPT `keepVersionId`.
 * Preview sessions live on the autosave tip (non-runnable) and are untouched.
 * `makeLive` enforces the same invariant inside its own transaction.
 */
async function closeOtherRunnableSessions(studyId: string, keepVersionId: string): Promise<void> {
  const runnable = await db
    .select({ id: experimentVersion.id })
    .from(experimentVersion)
    .where(and(eq(experimentVersion.experimentId, studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS)));
  const others = runnable.map((v) => v.id).filter((id) => id !== keepVersionId);
  if (others.length) {
    await db
      .update(recruitmentSession)
      .set({ status: "closed", closedAt: new Date() })
      .where(
        and(
          inArray(recruitmentSession.experimentVersionId, others),
          inArray(recruitmentSession.status, ["open", "paused"]),
        ),
      );
  }
}

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
  /** Finished (ADR-0054) — drives the consistent "Finished" tag on the card (ADR-0056). */
  finishedAt: string | null;
};

export type StudyBlock = {
  instanceId: string;
  /** ADR-0039: why this block differs from the pinned original (forks only). */
  divergenceNote: string | null;
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
  /** Question-group membership (ADR-0028); null = ungrouped. */
  groupId: string | null;
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
  /** Consent screen config (ADR-0035) — defaults merged on read. */
  consent: StudyConsent;
  /** Set when archived (ADR-0037 reversible path) — drives Unarchive in the ⋯ menu. */
  archivedAt: string | null;
  /** Question groups (ADR-0028); members reference these by `block.groupId`. */
  groups: import("@/server/modules/blocks").StudyGroup[];
  /** Factorial variants (ADR-0058) — factors/levels + field→factor bindings; empty = single-variant. */
  factors: import("@/lib/variants/factorial").VariantFactor[];
  variantBindings: import("@/lib/variants/factorial").VariantBinding[];
  /** Participant-facing chrome copy overrides (ADR-0066 labels slice); empty keys = default. */
  uiCopy: Record<string, string>;
  /** External research-panel / agency integration (ADR-0071) — operational recruitment config. */
  panelIntegration: import("@/lib/take/panel-integration").PanelIntegration;
  /** Participant-facing theme (ADR-0024); Academic defaults when never set. */
  theme: import("@/lib/themes/themes").StudyTheme;
  /** The caller's role in the owning workspace — drives client-side write gating (mirrors writeProcedure: viewers are read-only). */
  viewerRole: MemberRole;
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

/** A node in the replication lineage/tree (V1.12 E). `title` is null when the
 *  study is private to another workspace (link still resolves for the owner). */
export type ReplicationTreeNode = {
  studyId: string;
  title: string | null;
  authorName: string;
  visible: boolean;
  /** True when the study is in the caller's workspace (→ deep-link to Builder). */
  inWorkspace: boolean;
  generation: number;
  isCurrent: boolean;
  createdAt: string;
  children: ReplicationTreeNode[];
};
export type ReplicationTree = {
  /** Upstream lineage, root-first down to the immediate parent (may be empty). */
  ancestors: { studyId: string; title: string | null; authorName: string; visible: boolean; inWorkspace: boolean }[];
  /** The current study + its nested descendant forks. */
  root: ReplicationTreeNode;
};

/** One row in a study's version history (ADR-0012 amendment) — the Versions sub-tab. */
export type StudyVersion = {
  id: string;
  kind: "autosave" | "named" | "preregistered" | "published";
  versionNumber: number;
  name: string | null;
  createdAt: string;
  /** Who created this version (the changelog "by who"); null if the author is gone. */
  author: string | null;
  /** True for the autosave row — the live, editable working copy (the tip). */
  isWorkingCopy: boolean;
  /** True for the most recent conscious (frozen) save, if any. */
  isLatestSaved: boolean;
  /** True when the working copy's blocks differ from the latest frozen save. */
  hasUnsavedChanges: boolean;
  pushStatus: string | null;
  doi: string | null;
  /** Auto-changelog (ADR-0033): what this version changed vs the previous
   *  frozen one; for the working copy, the pending (unsaved) changes. */
  changes: string[];
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
  /** For `modified` nodes: human-readable lines of WHAT changed in the config
   *  (e.g. field-group fields added/removed/renamed). */
  changes?: string[];
  /** Screen-group membership on THIS side (ADR-0028) — drawn as a container. */
  groupId?: string;
  groupTitle?: string;
};

/** Side-by-side compare of the working copy (left) vs a chosen version (right). */
export type VersionCompare = {
  leftLabel: string;
  rightLabel: string;
  left: CompareNode[];
  right: CompareNode[];
  /** Saved Whiteboard node positions per side (keyed by instanceId / `cond:slug`),
   *  so the compare mirrors how the researcher arranged each version's canvas.
   *  Empty when that version was never laid out → the view falls back to a tidy
   *  auto-layout. */
  leftPositions: Record<string, { x: number; y: number }>;
  rightPositions: Record<string, { x: number; y: number }>;
  /** GitHub-style protocol-text diff (ADR-0031): old = right, new = left. */
  textDiff: import("@/lib/diff-lines").DiffLine[];
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
  /** ADR-0004: set when this preregistration is an amendment — the researcher's
   *  stated change + the version it supersedes. Null for an original. */
  changeSummary: string | null;
  amends: number | null;
  /** ADR-0005 am. 3: true once the registration is withdrawn/retracted on OSF. */
  withdrawn: boolean;
};

/** Run-stage state: whether the study is runnable (has a preregistered OR
 *  published immutable version), which kind, + recruitment status. */
export type RunInfo = {
  runnable: boolean;
  versionKind: "preregistered" | "published" | null;
  /** Version number of the frozen version participants actually get (ADR-0002). */
  liveVersionNumber: number | null;
  /** The editable draft (tip) has block changes not in the live frozen version —
   *  i.e. Build edits that won't reach participants until publish/amend. */
  divergedFromLive: boolean;
  recruitment: { status: "open" | "paused" | "closed"; currentN: number } | null;
  /** Study marked Finished (ADR-0054) — the badge shows "Finished" consistently (ADR-0056). */
  finishedAt: string | null;
};

/** Per-study Dashboard (ADR-0056) — "where are we with this study". */
export type StudyDashboardData = {
  title: string;
  /** Lifecycle steps in order, each with a reached flag; `current` is the furthest reached. */
  lifecycle: { key: string; label: string; done: boolean }[];
  currentStep: string;
  recruitment: { status: "open" | "paused" | "closed" | null; currentN: number; targetN: number | null };
  completedResponses: number;
  conditionBalance: { name: string; n: number }[];
  record: { visibility: "workspace" | "public"; hasAbstract: boolean; publishedAt: string | null } | null;
  replicationCount: number;
  /** Concrete prompts — what to do next / what's blocking. */
  nextActions: { label: string; href: string; tone: "primary" | "warning" | "muted" }[];
  activity: { id: string; type: string; at: string }[];
};

/** One row of the study changelog (ADR-0033 + ADR-0056): a frozen version save
 *  OR a non-versioned lifecycle event (recruitment, OSF push, finished, …),
 *  merged into one when/what/who timeline. */
export type ChangelogEntry = {
  id: string;
  at: string;
  /** Who did it (display name); null when the actor is unknown/gone. */
  actor: string | null;
  kind: "version" | "event";
  /** Headline — "Saved v2 — Pilot", "Opened recruitment", … */
  title: string;
  /** For version saves: the auto-changelog lines of what changed. */
  detail: string[];
};

/** Researcher-readable label for an activity_event type in the study changelog. */
function humanizeEventType(type: string): string {
  const MAP: Record<string, string> = {
    study_finished: "Marked the study finished",
    osf_push_complete: "Pushed to OSF",
    osf_registration_withdrawn: "Withdrew the OSF registration",
    fork: "Replicated to another workspace",
    review_request: "Requested a review",
    proposal_open: "Change proposed",
    proposal_decided: "Change proposal decided",
    comment_on_your_study: "New comment",
    comment_resolved: "Comment resolved",
    template_published: "Published as a template",
    template_used: "Used as a template",
    ownership_transferred: "Ownership transferred",
    member_role_changed: "Member role changed",
    member_left: "Member left the workspace",
    member_removed: "Member removed",
  };
  return MAP[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Per-condition + per-question results, plus per-response rows for CSV export. */
export type ResultsSummary = {
  /** The latest runnable version number (canonical label). */
  versionNumber: number;
  /** Which version this summary is scoped to; null = pooled across all
   *  runnable versions (ADR-0044). Drives the Results version filter. */
  selectedVersion: number | null;
  /** Every runnable version number, newest first (the version-filter list). */
  availableVersions: number[];
  totalCompleted: number;
  includesPreview: boolean;
  /** ADR-0082: true when an operator is in a "View as" support session — raw
   *  participant responses (`rows`, per-respondent spatial rows, exports) are
   *  withheld; aggregate counts/means/option-counts still resolve. The UI shows
   *  a "Hidden during support access" state instead of the dataset. */
  participantDataHidden?: boolean;
  conditions: { slug: string; name: string; completed: number }[];
  /** Per-variant-combination completed counts (ADR-0058); empty unless factorial. */
  combinations: { label: string; completed: number }[];
  questions: {
    instanceId: string;
    prompt: string;
    moduleKey: string;
    n: number;
    /** numeric → mean+n; categorical → per-option counts; text → n only. */
    kind: "numeric" | "categorical" | "text";
    mean: number | null;
    optionCounts: { value: string; count: number }[];
    /** V2.1 (ADR-0066 H3a): emotion-analysis aggregate when enabled on this
     *  block — mean emotion vector (top-N) + ok/failed/pending counts. */
    emotion?: { n: number; failed: number; pending: number; names: string[]; top: { name: string; score: number }[]; error?: string };
    /** Spatial overlay — the stimulus image + aggregated clicks/region hits
     *  (inline on Results, ADR-0041) plus per-respondent rows for the dedicated
     *  Explore surface (ADR-0041 amendment). `points`/`regions` stay pooled and
     *  backward-compatible; `kind` + `responses` are additive. */
    spatial?: {
      kind: "heat-map" | "hot-spot" | "graphic-slider" | "signature";
      imageUrl: string;
      points?: { x: number; y: number }[];
      regions?: { key: string; label: string; x: number; y: number; w: number; h: number; count: number }[];
      /** One row per completed respondent who reached this block — the basis for
       *  per-respondent + per-condition exploration. Derived, no migration. */
      responses?: {
        responseId: string;
        conditionSlug: string;
        externalPid: string | null;
        /** Which runnable version this respondent took (ADR-0044). */
        versionNumber?: number;
        /** heat-map */
        points?: { x: number; y: number }[];
        /** hot-spot — region keys this respondent selected */
        regionKeys?: string[];
        /** graphic-slider — 0..1 marker position */
        value?: number;
        /** signature — the resp/ R2 key of the captured PNG (served via /api/media,
         *  now workspace-gated, ADR-0003 am. 2026-06-14) */
        r2Key?: string;
      }[];
    };
  }[];
  rows: {
    responseId: string;
    conditionSlug: string;
    /** Factorial-variant cell label (ADR-0058), e.g. "low · gain"; null = no variants. */
    cell: string | null;
    externalPid: string | null;
    /** Which runnable version this respondent took (ADR-0044) — the export
     *  `version` column; lets a pooled dataset be split by version. */
    versionNumber: number;
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
  /** ADR-0005 am. 3 — true when that latest frozen version is a withdrawn preregistration. */
  registrationWithdrawn: boolean;
  replicationCount: number;
  /** Finished (ADR-0054) — gates Replicate vs Template on the card. */
  finishedAt: string | null;
  createdAt: string;
};

export type BrowsePage = { items: BrowseStudyCard[]; nextCursor: string | null };

/** Read-only public study detail / Study Record for `/browse/[studyId]` (ADR-0018 / ADR-0054). */
export type PublicStudyDetail = {
  studyId: string;
  title: string;
  authorId: string;
  authorName: string;
  tags: string[];
  latestKind: "published" | "preregistered";
  latestVersionNumber: number;
  /** ADR-0005 am. 3 — true once this study's preregistration was withdrawn/retracted on OSF. */
  registrationWithdrawn: boolean;
  replicationCount: number;
  /** Finished (ADR-0054) — Record reads as a finished artifact vs "preliminary". */
  finishedAt: string | null;
  /** Study creation timestamp — drives the citation year fallback (ADR-0056). */
  createdAt: string;
  /** Bound Record sections (auto-composed, read-only) — abstract + method narrative from the snapshot. */
  overview: { abstract: string; sections: { heading: string; contentMd: string }[] };
  conditions: { name: string }[];
  blocks: VersionPreviewBlock[];
  /** Researcher-uploaded stimuli for the Materials section (ADR-0056 E3) — ws/ assets only. */
  materials: { label: string; url: string; kind: string }[];
  /**
   * The composed Study Record (ADR-0054 §41) when its owner has **published** it
   * (visibility=public) — the page renders sections in this order, honouring
   * authored content + hide. Null when no record is published yet (the page
   * falls back to the default bound composition). Authored content only; bound
   * sections still resolve from the fields above (PII-safe).
   */
  record: {
    abstract: string | null;
    articleUrl: string | null;
    articleDoi: string | null;
    publishedAt: string | null;
    /** Researcher-published dataset snapshot (ADR-0056 E2) — null unless opted in. */
    dataTable: { headers: string[]; rows: string[][] } | null;
    layout: {
      type: string;
      title?: string;
      content?: string;
      hidden?: boolean;
      fields?: Record<string, string>;
    }[];
  } | null;
};

/** Tag + usage count for the Browse filter sidebar. */
export type BrowseTag = { tag: string; count: number };

type BrowseCursor = { c: string; i: string; r?: number; t?: string };

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
  groupId: z.string().optional(), // ADR-0028 question-group membership
  divergenceNote: z.string().max(1000).optional(), // ADR-0039 replication rationale
});

/**
 * Studies·Running tab data layer (studies-running-tab.md, V1.13.0 Stream C / N4.1).
 * The operational "is data collection going well right now?" board. Phase 1 only:
 * the KPI strip (`runningOverview`) + the per-study table (`runningList`). The
 * per-study drill-down (`runningDetail`) is Phase 2. Built on existing tables
 * (recruitment_session / response / condition) — no migration.
 */

/** Health verdict for a recruiting study (status badge).
 *  No "stalled" verdict: response cadence is the researcher's call, not ours, so
 *  we never flag a quiet study as needing attention (owner feedback 2026-06-28). */
export type RunningStatus = "healthy" | "imbalanced" | "target_reached";

/** Imbalanced = the gap between the smallest- and largest-arm n exceeds this share of the largest. */
const RUNNING_IMBALANCE_RATIO = 0.2;
/** One day in ms — the rolling window for "responses today". */
const DAY_MS = 24 * 60 * 60 * 1000;

export type RunningStudyRow = {
  studyId: string;
  title: string;
  conditionCount: number;
  /** Completed run responses on the open session (the recruitment counter). */
  currentN: number;
  targetN: number | null;
  /** ISO of the most recent completed run response, or null if none yet. */
  lastResponseAt: string | null;
  /** Smallest- and largest-arm completed-response counts; null when <2 conditions. */
  conditionBalance: { min: number; max: number } | null;
  /** >20% skew between the arms; always false when <2 conditions or no data yet. */
  imbalanced: boolean;
  status: RunningStatus;
};

/** KPI strip for the Running tab. `responsesToday`/`ThisWeek` are rolling 24h/7d windows. */
export type RunningOverview = {
  recruitingStudies: number;
  responsesToday: number;
  responsesThisWeek: number;
  /** Rows whose status is not "healthy" — the alert-center count. */
  needingAttention: number;
};

/**
 * Build one running-row per recruiting study in a workspace — the shared core
 * of `runningList` (returns the rows) and `runningOverview` (derives the KPIs).
 * Workspace-scoped. Dedupes by study like `me.recruitingStudies`/`activeRecruitment`
 * (the one-open-session invariant means there's normally a single open runnable
 * session per study; if a legacy duplicate exists we keep the most recently opened).
 *
 * Why a shared builder rather than deriving the attention count client-side from
 * `runningList`: the KPI strip's a11y live region reads "needing attention: N", so
 * that count should be server-authoritative and the strip should render before the
 * (heavier) table loads. Cost is one extra aggregation over a small set (a
 * workspace's handful of recruiting studies) — acceptable for Phase 1.
 */
async function buildRunningRows(workspaceId: string, showDemoContent: boolean): Promise<RunningStudyRow[]> {
  const sessions = await db
    .select({
      studyId: experiment.id,
      title: experiment.title,
      sessionId: recruitmentSession.id,
      versionId: experimentVersion.id,
      currentN: recruitmentSession.currentN,
      targetN: recruitmentSession.targetN,
      openedAt: recruitmentSession.openedAt,
    })
    .from(recruitmentSession)
    .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(
      and(
        eq(experiment.tenantId, workspaceId),
        eq(recruitmentSession.status, "open"),
        inArray(experimentVersion.kind, RUNNABLE_KINDS),
        isNull(experiment.archivedAt),
        // Demo studies' running rows hide with the workspace toggle (ADR-0023).
        demoStudyCondition(showDemoContent),
      ),
    )
    .orderBy(desc(recruitmentSession.openedAt));

  // One row per study (most-recently-opened session wins on a legacy duplicate).
  const seen = new Set<string>();
  const rows = sessions.filter((s) => (seen.has(s.studyId) ? false : (seen.add(s.studyId), true)));
  if (rows.length === 0) return [];

  const versionIds = [...new Set(rows.map((r) => r.versionId))];
  const sessionIds = rows.map((r) => r.sessionId);

  // All conditions for the involved versions — including zero-response arms, which
  // are exactly the ones that make a study imbalanced (min n = 0).
  const conds = await db
    .select({ versionId: conditionTable.experimentVersionId, conditionId: conditionTable.id })
    .from(conditionTable)
    .where(inArray(conditionTable.experimentVersionId, versionIds));
  const condIdsByVersion = new Map<string, string[]>();
  for (const c of conds) {
    const list = condIdsByVersion.get(c.versionId) ?? [];
    list.push(c.conditionId);
    condIdsByVersion.set(c.versionId, list);
  }

  // Completed run responses per (session, condition) + the session's last completion.
  const respAgg = sessionIds.length
    ? await db
        .select({
          sessionId: responseTable.recruitmentSessionId,
          conditionId: responseTable.conditionId,
          n: count(),
          lastAt: sql<string | null>`max(${responseTable.completedAt})`,
        })
        .from(responseTable)
        .where(
          and(
            inArray(responseTable.recruitmentSessionId, sessionIds),
            eq(responseTable.status, "completed"),
            eq(responseTable.mode, "run"),
          ),
        )
        .groupBy(responseTable.recruitmentSessionId, responseTable.conditionId)
    : [];
  const countBySessionCond = new Map<string, number>();
  const lastBySession = new Map<string, number>();
  for (const a of respAgg) {
    countBySessionCond.set(`${a.sessionId}:${a.conditionId}`, a.n);
    if (a.lastAt) {
      const t = new Date(a.lastAt).getTime();
      lastBySession.set(a.sessionId, Math.max(lastBySession.get(a.sessionId) ?? 0, t));
    }
  }

  return rows.map((r) => {
    const condIds = condIdsByVersion.get(r.versionId) ?? [];
    const conditionCount = condIds.length;
    const perArm = condIds.map((cid) => countBySessionCond.get(`${r.sessionId}:${cid}`) ?? 0);

    const lastMs = lastBySession.get(r.sessionId) ?? null;
    const lastResponseAt = lastMs ? new Date(lastMs).toISOString() : null;

    let conditionBalance: { min: number; max: number } | null = null;
    let imbalanced = false;
    if (conditionCount >= 2) {
      const min = Math.min(...perArm);
      const max = Math.max(...perArm);
      conditionBalance = { min, max };
      // Only judgeable once some data exists; >20% skew of the largest arm.
      imbalanced = max > 0 && (max - min) / max > RUNNING_IMBALANCE_RATIO;
    }

    const targetReached = r.targetN != null && r.currentN >= r.targetN;
    // target-reached (you have your data) > imbalanced > healthy. No "stalled":
    // a quiet study isn't a problem — cadence is the researcher's call.
    const status: RunningStatus = targetReached ? "target_reached" : imbalanced ? "imbalanced" : "healthy";

    return {
      studyId: r.studyId,
      title: r.title,
      conditionCount,
      currentN: r.currentN,
      targetN: r.targetN,
      lastResponseAt,
      conditionBalance,
      imbalanced,
      status,
    };
  });
}

export const studiesRouter = router({
  /**
   * Browse public studies (ADR-0018 + browse-public-studies wireframe). Public
   * — no workspace context needed to read the listing. The discoverable set is
   * `forkable_by = 'public'`, not archived, with at least one published or
   * preregistered (frozen) version. Filters (ADR-0055): title search (`q`), tag
   * intersection, author name, finished, preregistered. Sort (separate from
   * filtering): recent | oldest | replicated | alpha. Keyset (cursor) pagination.
   * Framework filtering is DEFERRED (no study→framework provenance in the
   * schema; owner decision 2026-06-07).
   */
  browsePublic: publicProcedure
    .input(
      z.object({
        tags: z.array(z.string()).optional(),
        authorQuery: z.string().trim().max(120).optional(),
        /** Free-text search over the study title (ADR-0055). Title-only for now;
            full-text over abstract/blocks arrives with the SearchAdapter (item 1b). */
        q: z.string().trim().max(120).optional(),
        /** Facets (ADR-0055). Finished = has a published Study Record; preregistered = has a prereg version. */
        finished: z.boolean().optional(),
        hasPreregistration: z.boolean().optional(),
        sort: z.enum(["recent", "oldest", "replicated", "alpha"]).default("recent"),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ input }): Promise<BrowsePage> => {
      const repCount = sql<number>`(select count(*)::int from ${experiment} c where c.fork_of_experiment_id = ${experiment.id})`;
      const latestNum = sql<number>`(select max(v.version_number) from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered'))`;
      const latestKind = sql<"published" | "preregistered">`(select v.kind from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered') order by v.version_number desc limit 1)`;
      const latestWithdrawn = sql<boolean>`coalesce((select v.registration_withdrawn from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind in ('published','preregistered') order by v.version_number desc limit 1), false)`;

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
      if (input.q) {
        // Search title + the published record's abstract + tags (ADR-0055 1b).
        const like = `%${input.q}%`;
        filters.push(
          sql`(${experiment.title} ilike ${like}
            or exists (select 1 from ${studyRecord} sr where sr.experiment_id = ${experiment.id} and sr.visibility = 'public' and sr.abstract ilike ${like})
            or exists (select 1 from unnest(${experiment.tags}) tg where tg ilike ${like}))`,
        );
      }
      if (input.finished) {
        filters.push(isNotNull(experiment.finishedAt));
      }
      if (input.hasPreregistration) {
        filters.push(sql`exists (select 1 from ${experimentVersion} v where v.experiment_id = ${experiment.id} and v.kind = 'preregistered')`);
      }

      // Keyset cursor — rows strictly "after" the cursor in the sort order.
      // Keyset comparator per sort — the row tuple must be strictly past the
      // cursor in the sort's direction (`<` for desc, `>` for asc).
      const cur = input.cursor ? decodeCursor(input.cursor) : null;
      if (cur) {
        if (input.sort === "replicated") {
          filters.push(
            sql`(${repCount}, ${experiment.createdAt}, ${experiment.id}) < (${cur.r ?? 0}, ${cur.c}::timestamptz, ${cur.i}::uuid)`,
          );
        } else if (input.sort === "oldest") {
          filters.push(
            sql`(${experiment.createdAt}, ${experiment.id}) > (${cur.c}::timestamptz, ${cur.i}::uuid)`,
          );
        } else if (input.sort === "alpha") {
          filters.push(
            sql`(lower(${experiment.title}), ${experiment.id}) > (${cur.t ?? ""}, ${cur.i}::uuid)`,
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
          : input.sort === "oldest"
            ? [asc(experiment.createdAt), asc(experiment.id)]
            : input.sort === "alpha"
              ? [asc(sql`lower(${experiment.title})`), asc(experiment.id)]
              : [desc(experiment.createdAt), desc(experiment.id)];

      const rows = await db
        .select({
          studyId: experiment.id,
          title: experiment.title,
          authorId: experiment.ownerId,
          authorName: user.displayName,
          tags: experiment.tags,
          createdAt: experiment.createdAt,
          finishedAt: experiment.finishedAt,
          replicationCount: repCount,
          latestVersionNumber: latestNum,
          latestKind: latestKind,
          latestWithdrawn: latestWithdrawn,
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
              t: input.sort === "alpha" ? last.title.toLowerCase() : undefined,
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
          registrationWithdrawn: r.latestKind === "preregistered" && !!r.latestWithdrawn,
          replicationCount: Number(r.replicationCount),
          finishedAt: r.finishedAt?.toISOString() ?? null,
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
          finishedAt: experiment.finishedAt,
          createdAt: experiment.createdAt,
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
          id: experimentVersion.id,
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          snapshot: experimentVersion.definitionSnapshot,
          withdrawn: experimentVersion.registrationWithdrawn,
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

      const ov = readOverview(ver.snapshot);
      const conditions = await conditionsForVersion(ver.id);

      // The composed Record overrides the default render only once published (ADR-0054).
      const [recRow] = await db
        .select({
          visibility: studyRecord.visibility,
          abstract: studyRecord.abstract,
          articleUrl: studyRecord.articleUrl,
          articleDoi: studyRecord.articleDoi,
          publishedAt: studyRecord.publishedAt,
          dataPublished: studyRecord.dataPublished,
          dataTable: studyRecord.dataTable,
          layout: studyRecord.layout,
        })
        .from(studyRecord)
        .where(eq(studyRecord.experimentId, input.studyId))
        .limit(1);
      const record =
        recRow && recRow.visibility === "public"
          ? {
              abstract: recRow.abstract,
              articleUrl: recRow.articleUrl,
              articleDoi: recRow.articleDoi,
              publishedAt: recRow.publishedAt?.toISOString() ?? null,
              dataTable: recRow.dataPublished ? recRow.dataTable ?? null : null,
              layout: sanitizeRecordLayout(recRow.layout ?? []),
            }
          : null;

      return {
        studyId: exp.id,
        title: exp.title,
        authorId: exp.authorId,
        authorName: exp.authorName ?? "",
        tags: exp.tags ?? [],
        latestKind: ver.kind as "published" | "preregistered",
        latestVersionNumber: ver.versionNumber,
        registrationWithdrawn: ver.kind === "preregistered" && !!ver.withdrawn,
        replicationCount: reps?.c ?? 0,
        finishedAt: exp.finishedAt?.toISOString() ?? null,
        createdAt: exp.createdAt.toISOString(),
        overview: { abstract: ov.abstract, sections: ov.sections.map((s) => ({ heading: s.heading, contentMd: s.contentMd })) },
        conditions: conditions.map((c) => ({ name: c.name })),
        blocks: readBlocks(ver.snapshot).map((b) => {
          const d = blockDisplay(b);
          return { instanceId: b.instanceId, name: d.name, ref: d.ref, complete: d.complete };
        }),
        materials: extractMaterials(readBlocks(ver.snapshot)),
        record,
      };
    }),

  /**
   * Read-only participant-style blocks for a PUBLIC study (feedback 01KW4PSR —
   * "I don't know what it looks like"). Same visibility guard as getPublicStudy;
   * returns the frozen version's blocks for a <BlockView> preview on Browse. The
   * design of a public/forkable study is already meant to be inspectable + copied.
   */
  publicStudyBlocks: publicProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ input }): Promise<{ blocks: import("@/server/modules/blocks").BlockInstance[] }> => {
      const [exp] = await db
        .select({ id: experiment.id })
        .from(experiment)
        .where(
          and(
            eq(experiment.id, input.studyId),
            eq(experiment.forkableBy, "public"),
            isNull(experiment.archivedAt),
            eq(experiment.isDemo, false),
          ),
        )
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      const [ver] = await db
        .select({ snapshot: experimentVersion.definitionSnapshot })
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

      return { blocks: readBlocks(ver.snapshot) };
    }),

  /**
   * Owner preview of the composed Record (ADR-0056 C) — the SAME `PublicStudyDetail`
   * shape the public read page renders, but tenant-gated and including the record
   * regardless of visibility (so the composer Preview shows exactly what would
   * publish). Tolerates a not-yet-frozen study (empty bound sections).
   */
  getRecordPreview: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<PublicStudyDetail> => {
      const [exp] = await db
        .select({
          id: experiment.id,
          title: experiment.title,
          authorId: experiment.ownerId,
          authorName: user.displayName,
          tags: experiment.tags,
          finishedAt: experiment.finishedAt,
          createdAt: experiment.createdAt,
        })
        .from(experiment)
        .innerJoin(user, eq(user.id, experiment.ownerId))
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });

      const [ver] = await db
        .select({ id: experimentVersion.id, kind: experimentVersion.kind, versionNumber: experimentVersion.versionNumber, snapshot: experimentVersion.definitionSnapshot, withdrawn: experimentVersion.registrationWithdrawn })
        .from(experimentVersion)
        .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, ["published", "preregistered"])))
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);

      const [reps] = await db
        .select({ c: count() })
        .from(experiment)
        .where(eq(experiment.forkOfExperimentId, input.studyId));

      const ov = ver ? readOverview(ver.snapshot) : { abstract: "", sections: [] };
      const conditions = ver ? await conditionsForVersion(ver.id) : [];
      const blocks = ver ? readBlocks(ver.snapshot) : [];

      const [recRow] = await db
        .select({
          abstract: studyRecord.abstract,
          articleUrl: studyRecord.articleUrl,
          articleDoi: studyRecord.articleDoi,
          publishedAt: studyRecord.publishedAt,
          dataPublished: studyRecord.dataPublished,
          dataTable: studyRecord.dataTable,
          layout: studyRecord.layout,
        })
        .from(studyRecord)
        .where(eq(studyRecord.experimentId, input.studyId))
        .limit(1);

      return {
        studyId: exp.id,
        title: exp.title,
        authorId: exp.authorId,
        authorName: exp.authorName ?? "",
        tags: exp.tags ?? [],
        latestKind: (ver?.kind as "published" | "preregistered") ?? "published",
        latestVersionNumber: ver?.versionNumber ?? 0,
        registrationWithdrawn: ver?.kind === "preregistered" && !!ver?.withdrawn,
        replicationCount: reps?.c ?? 0,
        finishedAt: exp.finishedAt?.toISOString() ?? null,
        createdAt: exp.createdAt.toISOString(),
        overview: { abstract: ov.abstract, sections: ov.sections.map((s) => ({ heading: s.heading, contentMd: s.contentMd })) },
        conditions: conditions.map((c) => ({ name: c.name })),
        blocks: blocks.map((b) => {
          const d = blockDisplay(b);
          return { instanceId: b.instanceId, name: d.name, ref: d.ref, complete: d.complete };
        }),
        materials: extractMaterials(blocks),
        // Preview includes the saved record regardless of visibility (so the owner
        // sees the composed layout pre-publish); dataset shows if opted-in.
        record: recRow
          ? {
              abstract: recRow.abstract,
              articleUrl: recRow.articleUrl,
              articleDoi: recRow.articleDoi,
              publishedAt: recRow.publishedAt?.toISOString() ?? null,
              dataTable: recRow.dataPublished ? recRow.dataTable ?? null : null,
              layout: sanitizeRecordLayout(recRow.layout ?? []),
            }
          : null,
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
    .input(
      z
        .object({
          filter: z.enum(STUDY_FILTERS).default("all"),
          // Feedback 01KW4SRZ: let researchers sort the list; A–Z by default.
          sort: z.enum(STUDY_SORTS).default("az"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }): Promise<StudyListItem[]> => {
      const filter: StudyFilter = input?.filter ?? "all";
      const sort: StudySort = input?.sort ?? "az";
      const orderBy =
        sort === "recent"
          ? desc(experiment.updatedAt)
          : sort === "za"
            ? sql`lower(${experiment.title}) desc`
            : sql`lower(${experiment.title}) asc`;

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
            demoStudyCondition(ctx.workspace.showDemoContent),
          ),
        )
        .orderBy(orderBy);

      // A study's stage is the FURTHEST milestone any of its versions reached
      // (published > preregistered > draft) — NOT the autosave working tip's
      // kind, which is always 'draft'. Otherwise a preregistered study (whose
      // tip stays an editable autosave) would never leave the Drafts filter.
      const expIds = rows.map((r) => r.experiment.id);
      const kindRows = expIds.length
        ? await db
            .select({ experimentId: experimentVersion.experimentId, kind: experimentVersion.kind, withdrawn: experimentVersion.registrationWithdrawn })
            .from(experimentVersion)
            .where(inArray(experimentVersion.experimentId, expIds))
        : [];
      const stageByExp = new Map<string, StudyStage>();
      const rank: Record<StudyStage, number> = { draft: 0, preregistered: 1, published: 2 };
      for (const { experimentId, kind, withdrawn } of kindRows) {
        // A withdrawn preregistration no longer counts as "preregistered" — its
        // plan is no longer frozen on the registry (item 3). It falls back to a
        // draft stage unless a published version carries the study further.
        const s = kind === "preregistered" && withdrawn ? "draft" : stageFromKind(kind);
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
        finishedAt: e.finishedAt?.toISOString() ?? null,
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
        // Merge the module's CURRENT defaults under the saved config so fields
        // added to a module after this block was created (e.g. social-post
        // engagement controls) surface in the Configure panel for old blocks too.
        const def = getModuleDef(b.source, b.key, b.version);
        return {
          divergenceNote: typeof b.divergenceNote === "string" ? b.divergenceNote : null,
          instanceId: b.instanceId,
          source: b.source,
          key: b.key,
          version: b.version,
          name: d.name,
          title: b.title ?? null,
          ref: d.ref,
          config: def ? { ...def.defaultConfig, ...b.config } : b.config,
          complete: d.complete,
          showIfCondition: b.visibility?.showIfCondition ?? [],
          branchRules: b.branchRules ?? [],
          showIf: b.showIf ?? null,
          groupId: b.groupId ?? null,
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
        consent: readConsent(row.version?.definitionSnapshot),
        archivedAt: row.experiment.archivedAt?.toISOString() ?? null,
        groups: readGroups(row.version?.definitionSnapshot),
        factors: readFactors(row.version?.definitionSnapshot),
        variantBindings: readVariantBindings(row.version?.definitionSnapshot),
        uiCopy: ((row.version?.definitionSnapshot as { uiCopy?: Record<string, string> } | null)?.uiCopy) ?? {},
        panelIntegration: resolvePanelIntegration(row.experiment.panelIntegration),
        theme: readTheme(row.version?.definitionSnapshot),
        viewerRole: ctx.role as MemberRole,
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
            // How THIS study diverged from its parent (content-aligned so
            // seeded/imported forks without preserved ids still diff sanely).
            diff: visible ? diffBlocks(meta.blocks, alignBlocksForDiff(meta.blocks, selfBlocks).aligned) : null,
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
          // How the child diverged from THIS study (content-aligned, as above).
          diff: meta ? diffBlocks(selfBlocks, alignBlocksForDiff(selfBlocks, meta.blocks).aligned) : null,
        });
      }
      return { parent, children };
    }),

  /**
   * Full replication lineage (V1.12 E): the upstream ancestry (root → parent) +
   * the nested descendant fork tree, via recursive CTEs over
   * experiment.fork_of_experiment_id. Titles are hidden for studies private to
   * another workspace (link still resolves for that owner).
   */
  getReplicationTree: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<ReplicationTree> => {
      const wsId = ctx.workspace.id;
      const [self] = await db
        .select({ tenantId: experiment.tenantId, forkableBy: experiment.forkableBy })
        .from(experiment)
        .where(eq(experiment.id, input.studyId))
        .limit(1);
      if (!self || (self.tenantId !== wsId && self.forkableBy !== "public")) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      type Row = {
        id: string;
        title: string;
        tenant_id: string;
        forkable_by: string;
        fork_of_experiment_id: string | null;
        created_at: string | Date;
        display_name: string | null;
        depth: number;
      };

      const descendants = (await db.execute(sql`
        WITH RECURSIVE tree AS (
          SELECT e.id, e.title, e.owner_id, e.tenant_id, e.forkable_by, e.fork_of_experiment_id, e.created_at, 0 AS depth
          FROM ${experiment} e WHERE e.id = ${input.studyId}
          UNION ALL
          SELECT c.id, c.title, c.owner_id, c.tenant_id, c.forkable_by, c.fork_of_experiment_id, c.created_at, t.depth + 1
          FROM ${experiment} c JOIN tree t ON c.fork_of_experiment_id = t.id
        )
        SELECT t.id, t.title, t.tenant_id, t.forkable_by, t.fork_of_experiment_id, t.created_at, u.display_name, t.depth
        FROM tree t JOIN ${user} u ON u.id = t.owner_id
        ORDER BY t.depth, t.created_at
      `)) as unknown as Row[];

      const ancestry = (await db.execute(sql`
        WITH RECURSIVE up AS (
          SELECT e.id, e.title, e.owner_id, e.tenant_id, e.forkable_by, e.fork_of_experiment_id, e.created_at, 0 AS depth
          FROM ${experiment} e WHERE e.id = ${input.studyId}
          UNION ALL
          SELECT p.id, p.title, p.owner_id, p.tenant_id, p.forkable_by, p.fork_of_experiment_id, p.created_at, up.depth + 1
          FROM ${experiment} p JOIN up ON up.fork_of_experiment_id = p.id
        )
        SELECT up.id, up.title, up.tenant_id, up.forkable_by, u.display_name, up.depth
        FROM up JOIN ${user} u ON u.id = up.owner_id
        WHERE up.id <> ${input.studyId}
        ORDER BY up.depth DESC
      `)) as unknown as Row[];

      const visible = (r: { tenant_id: string; forkable_by: string }) =>
        r.tenant_id === wsId || r.forkable_by === "public";
      const toNode = (r: Row): ReplicationTreeNode => ({
        studyId: r.id,
        title: visible(r) ? r.title : null,
        authorName: r.display_name ?? "",
        visible: visible(r),
        inWorkspace: r.tenant_id === wsId,
        generation: r.depth,
        isCurrent: r.id === input.studyId,
        createdAt: new Date(r.created_at).toISOString(),
        children: [],
      });

      const byId = new Map<string, ReplicationTreeNode>();
      for (const r of descendants) byId.set(r.id, toNode(r));
      let root: ReplicationTreeNode | null = null;
      for (const r of descendants) {
        const node = byId.get(r.id)!;
        if (r.id === input.studyId) root = node;
        else if (r.fork_of_experiment_id) byId.get(r.fork_of_experiment_id)?.children.push(node);
      }
      if (!root) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        ancestors: ancestry.map((r) => ({
          studyId: r.id,
          title: visible(r) ? r.title : null,
          authorName: r.display_name ?? "",
          visible: visible(r),
          inWorkspace: r.tenant_id === wsId,
        })),
        root,
      };
    }),

  /**
   * Every version of a study, oldest→newest (ADR-0012 amendment / V1.7.1 item 3).
   * Surfaces the full history behind the Builder's Versions sub-tab so "why does
   * it say v3?" is answerable: the Draft (autosave) + each conscious snapshot
   * with its kind, number, freeze status, and OSF DOI/status.
   */
  /** Two-way OSF sync (ADR-0005 am. 3): poll the pushed registration for
   *  approval + DOI and backfill the version. Owner-triggered (button) +
   *  called by the preregister page's pending poll. */
  refreshRegistration: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [ver] = await db
        .select({
          id: experimentVersion.id,
          url: experimentVersion.externalRegistrationUrl,
          doi: experimentVersion.externalRegistrationDoi,
        })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experiment.tenantId, ctx.workspace.id),
            isNotNull(experimentVersion.externalRegistrationUrl),
          ),
        )
        .orderBy(desc(experimentVersion.createdAt))
        .limit(1);
      if (!ver?.url) throw new TRPCError({ code: "NOT_FOUND", message: "No pushed registration to check." });
      const regId = ver.url.match(/osf\.io\/([a-z0-9]+)/i)?.[1];
      if (!regId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Couldn't read the registration id." });

      const status = await registryAdapter.getRegistrationStatus(ctx.dbUser.id, regId);
      // Sync the DOI and the withdrawn flag (ADR-0005 am. 3) so the Preregister
      // page reflects a finalized withdrawal (not just a pending request).
      await db
        .update(experimentVersion)
        .set({
          ...(status.doi && status.doi !== ver.doi ? { externalRegistrationDoi: status.doi } : {}),
          registrationWithdrawn: status.withdrawn,
        })
        .where(eq(experimentVersion.id, ver.id));
      return status;
    }),

  /** Withdraw (retract) the pushed registration on OSF (ADR-0005 am. 3). PATCHes
   *  the registration with pending_withdrawal + the researcher's justification;
   *  OSF then awaits the contributors' approval to finalize the public tombstone.
   *  Irreversible — the UI confirms first. */
  withdrawRegistration: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), reason: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const [ver] = await db
        .select({ url: experimentVersion.externalRegistrationUrl, doi: experimentVersion.externalRegistrationDoi })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            eq(experiment.tenantId, ctx.workspace.id),
            isNotNull(experimentVersion.externalRegistrationUrl),
          ),
        )
        .orderBy(desc(experimentVersion.createdAt))
        .limit(1);
      if (!ver?.url) throw new TRPCError({ code: "NOT_FOUND", message: "No pushed registration to withdraw." });
      const regId = ver.url.match(/osf\.io\/([a-z0-9]+)/i)?.[1];
      if (!regId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Couldn't read the registration id." });
      // The adapter accepts a DOI or a bare guid; prefer the DOI when minted.
      await registryAdapter.withdraw(ctx.dbUser.id, ver.doi ?? regId, input.reason);
      return { ok: true as const };
    }),

  /** Methodological pre-flight checks over the working tip (ADR-0034). Pure
   *  read — the gate is advisory; preregister/publish never enforce. */
  preflight: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), mode: z.enum(["preregister", "publish"]) }))
    .query(async ({ ctx, input }): Promise<PreflightCheck[]> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const conditions = (await conditionsForVersion(tip.version.id)).map((c) => ({
        slug: c.slug,
        name: c.name,
      }));
      // Replication-aware rows (ADR-0039): divergence vs the pinned original.
      let replication: Parameters<typeof runPreflight>[0]["replication"];
      if (tip.experiment.forkOfVersionId) {
        const [pinned] = await db
          .select({ snapshot: experimentVersion.definitionSnapshot })
          .from(experimentVersion)
          .where(eq(experimentVersion.id, tip.experiment.forkOfVersionId))
          .limit(1);
        if (pinned) {
          const d = divergenceAgainstPinned(tip.version.definitionSnapshot, pinned.snapshot);
          replication = {
            intent: readOverview(tip.version.definitionSnapshot).replicationIntent ?? null,
            diverged: d.diverged.map((x) => ({ name: x.name, hasNote: x.hasNote })),
          };
        }
      }
      return runPreflight({ snapshot: tip.version.definitionSnapshot, conditions, mode: input.mode, replication });
    }),

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
          author: user.displayName,
        })
        .from(experimentVersion)
        .leftJoin(user, eq(experimentVersion.createdBy, user.id))
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

      // Auto-changelog (ADR-0033, derived on read): each frozen version vs the
      // frozen one before it; the working copy vs the latest frozen (= the Save
      // dialog's "what you're about to freeze" preview).
      const changesFor = (r: (typeof rows)[number]): string[] => {
        if (r.kind === "autosave") {
          return latestSaved ? changelogBetween(latestSaved.snapshot, r.snapshot) : [];
        }
        const i = frozen.findIndex((f) => f.id === r.id);
        if (i === 0) return initialVersionSummary(r.snapshot);
        return changelogBetween(frozen[i - 1].snapshot, r.snapshot);
      };

      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        versionNumber: r.versionNumber,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        author: r.author ?? null,
        isWorkingCopy: r.kind === "autosave",
        isLatestSaved: !!latestSaved && r.id === latestSaved.id,
        hasUnsavedChanges: r.kind === "autosave" ? hasUnsavedChanges : false,
        pushStatus: r.pushStatus ?? null,
        doi: r.doi ?? null,
        changes: changesFor(r),
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
    .input(z.object({ studyId: z.string().uuid(), vs: z.union([z.string().uuid(), z.literal("origin")]) }))
    .query(async ({ ctx, input }): Promise<VersionCompare> => {
      const [exp] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      // vs = "origin" → juxtapose a replication against the study it was
      // replicated from (ADR-0018 gating: visible if public or same workspace).
      // Saved canvas positions per side (ADR-0020) → the compare mirrors how each
      // version was arranged on the Whiteboard. Empty = never laid out.
      const posOf = (vp: unknown): Record<string, { x: number; y: number }> =>
        ((vp as WhiteboardViewport | null)?.nodePositions ?? {}) as Record<string, { x: number; y: number }>;

      let rightBlocks: BlockInstance[];
      let rightSnapshot: unknown;
      let rightViewport: unknown = {};
      let verLabel: string;
      if (input.vs === "origin") {
        if (!exp.forkOfExperimentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Not a replication." });
        const meta = await studyMeta(exp.forkOfExperimentId);
        if (!meta || !(meta.exp.forkableBy === "public" || meta.exp.tenantId === ctx.workspace.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The original study isn’t visible to you." });
        }
        rightBlocks = meta.blocks;
        rightSnapshot = await studyTipSnapshot(meta.exp);
        if (meta.exp.currentVersionId) {
          const [ov] = await db
            .select({ vp: experimentVersion.whiteboardViewport })
            .from(experimentVersion)
            .where(eq(experimentVersion.id, meta.exp.currentVersionId))
            .limit(1);
          rightViewport = ov?.vp ?? {};
        }
        verLabel = `Original — “${meta.exp.title}”`;
      } else {
        const [ver] = await db
          .select({
            kind: experimentVersion.kind,
            versionNumber: experimentVersion.versionNumber,
            name: experimentVersion.name,
            snapshot: experimentVersion.definitionSnapshot,
            viewport: experimentVersion.whiteboardViewport,
          })
          .from(experimentVersion)
          .where(
            and(eq(experimentVersion.id, input.vs), eq(experimentVersion.experimentId, input.studyId)),
          )
          .limit(1);
        if (!ver) throw new TRPCError({ code: "NOT_FOUND" });
        rightBlocks = readBlocks(ver.snapshot);
        rightSnapshot = ver.snapshot;
        rightViewport = ver.viewport ?? {};
        verLabel =
          ver.kind === "autosave"
            ? "Draft"
            : ver.kind === "named"
              ? `v${ver.versionNumber}${ver.name ? ` — ${ver.name}` : ""}`
              : ver.kind === "preregistered"
                ? `Preregistration v${ver.versionNumber}`
                : `Published v${ver.versionNumber}`;
      }

      const leftSnapshot = await studyTipSnapshot(exp); // working copy (child)
      const leftBlocks = readBlocks(leftSnapshot);
      let leftViewport: unknown = {};
      if (exp.currentVersionId) {
        const [lv] = await db
          .select({ vp: experimentVersion.whiteboardViewport })
          .from(experimentVersion)
          .where(eq(experimentVersion.id, exp.currentVersionId))
          .limit(1);
        leftViewport = lv?.vp ?? {};
      }
      // Forks made in the product preserve instanceIds, but seeded/imported ones
      // may not — align by content first so identical blocks pair up (ADR-0018).
      const { aligned: alignedLeft, idMap } = alignBlocksForDiff(rightBlocks, leftBlocks);
      const alignedIdOf = (id: string) => idMap.get(id) ?? id;
      const diff = diffBlocks(rightBlocks, alignedLeft);
      const addedIds = new Set(diff.added.map((b) => b.instanceId));
      const removedIds = new Set(diff.removed.map((b) => b.instanceId));
      const changedIds = new Set(diff.changed.map((b) => b.instanceId));

      // Screen-group titles per side (ADR-0028) — drawn as containers; a block
      // whose membership differs counts as modified ("Grouped under …").
      const leftGroupTitle = new Map(readGroups(leftSnapshot).map((g) => [g.id, g.title ?? "Untitled group"]));
      const rightGroupTitle = new Map(readGroups(rightSnapshot).map((g) => [g.id, g.title ?? "Untitled group"]));
      const groupTitleOf = (b: BlockInstance, side: "left" | "right"): string | null =>
        b.groupId ? ((side === "left" ? leftGroupTitle : rightGroupTitle).get(b.groupId) ?? "Untitled group") : null;

      // For modified blocks: WHAT changed inside the config (field-group fields
      // added/removed/renamed, option edits, scalar old → new) + group moves.
      const rightById = new Map(rightBlocks.map((b) => [b.instanceId, b]));
      const changeLines = new Map<string, string[]>();
      const groupChanged = new Set<string>();
      for (const l of leftBlocks) {
        const r = rightById.get(alignedIdOf(l.instanceId));
        if (!r) continue;
        const lines = changedIds.has(alignedIdOf(l.instanceId)) ? summarizeConfigDiff(r, l) : [];
        const gLine = groupChangeLine(groupTitleOf(r, "right"), groupTitleOf(l, "left"));
        if (gLine) {
          lines.push(gLine);
          groupChanged.add(l.instanceId);
        }
        if (lines.length) changeLines.set(l.instanceId, lines);
      }

      const toNode = (b: BlockInstance, side: "left" | "right"): CompareNode => {
        const d = blockDisplay(b);
        const diffId = side === "left" ? alignedIdOf(b.instanceId) : b.instanceId;
        let status: CompareStatus = "unchanged";
        if (changedIds.has(diffId)) status = "modified";
        else if (side === "left" && addedIds.has(diffId)) status = "added";
        else if (side === "right" && removedIds.has(diffId)) status = "removed";
        if (side === "left" && status === "unchanged" && groupChanged.has(b.instanceId)) status = "modified";
        const gTitle = groupTitleOf(b, side);
        return {
          instanceId: b.instanceId,
          name: d.name,
          ref: d.ref,
          status,
          showIfCondition: b.visibility?.showIfCondition ?? [],
          ...(side === "left" && status === "modified" ? { changes: changeLines.get(b.instanceId) ?? [] } : {}),
          ...(b.groupId ? { groupId: b.groupId, groupTitle: gTitle ?? undefined } : {}),
        };
      };

      const leftPos = posOf(leftViewport);
      const rightPos = posOf(rightViewport);
      return {
        leftLabel: input.vs === "origin" ? "Your replication (working copy)" : "Working copy",
        rightLabel: verLabel,
        left: leftBlocks.map((b) => toNode(b, "left")),
        right: rightBlocks.map((b) => toNode(b, "right")),
        // Block instanceIds are stable across versions, so a version that was never
        // laid out on the Whiteboard (empty viewport — e.g. older frozen versions)
        // borrows the working copy's layout, keeping both sides mirroring the canvas.
        leftPositions: leftPos,
        rightPositions: Object.keys(rightPos).length ? rightPos : leftPos,
        // GitHub-style protocol text diff (ADR-0031): old = the chosen version /
        // original, new = the working copy.
        textDiff: diffLines(protocolText(rightSnapshot), protocolText(leftSnapshot)),
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
      await recordStudyEdit(row.id, ctx.dbUser.id, "title", `Renamed the study to "${input.title}"`);
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
        /** Insert position in the block array (library drag-to-position); appended when omitted. */
        atIndex: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ instanceId: string }> => {
      const def = getModuleDef(input.source, input.key, input.version);
      if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown module." });
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const instanceId = ulid();
      const at = input.atIndex == null ? blocks.length : Math.min(input.atIndex, blocks.length);
      blocks.splice(at, 0, {
        instanceId,
        source: def.source,
        key: def.key,
        version: def.version,
        config: def.defaultConfig,
      });
      await writeBlocks(tip.version.id, input.studyId, blocks, {
        actorUserId: ctx.dbUser.id,
        summary: `Added a ${def.key} block`,
      });
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
      await writeBlocks(tip.version.id, input.studyId, pruneForwardConditions(blocks), {
        actorUserId: ctx.dbUser.id,
        summary: "Removed a block",
      });
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
   * Persist question groups (ADR-0028) — writes the blocks (with their `groupId`)
   * and the `groups[]` metadata together into the snapshot, preserving overview.
   */
  /**
   * Set factorial variants (ADR-0058): factors/levels + field→factor bindings,
   * written additively into the snapshot. Bindings whose factor was removed are
   * pruned. Clearing all factors returns the study to a plain single-variant one.
   */
  setVariants: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        factors: z
          .array(
            z.object({
              id: z.string(),
              name: z.string().max(80),
              levels: z.array(z.object({ id: z.string(), name: z.string().max(80) })).max(8),
            }),
          )
          .max(6),
        variantBindings: z
          .array(
            z.object({
              instanceId: z.string(),
              path: z.string().min(1).max(120),
              factorId: z.string(),
              valuesByLevel: z.record(z.string(), z.unknown()),
            }),
          )
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const factors = input.factors as VariantFactor[];
      const variantBindings = pruneBindings(factors, input.variantBindings as VariantBinding[]);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, factors, variantBindings } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "variants", factors.length ? "Edited the variants" : "Removed all variants");
      return { ok: true };
    }),

  /**
   * Set participant-facing chrome copy overrides (editable labels, ADR-0066 slice:
   * Continue/Finish/Back, the required-answer error, progress, thank-you). Stored on
   * the version snapshot as `uiCopy`; the take runtime resolves overrides over the
   * defaults. Blank/unknown keys are dropped so a cleared field reverts to default.
   */
  setUiCopy: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), uiCopy: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, uiCopy: sanitizeUiCopy(input.uiCopy) } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "wording", "Edited the participant wording");
      return { ok: true };
    }),

  /**
   * Set the external research-panel / agency integration config (ADR-0071).
   * Operational recruitment settings stored on the experiment (NOT the version
   * snapshot — swapping the agency mid-study shouldn't fork the protocol). The
   * input is sanitized (URLs validated, delays clamped, no arbitrary code).
   */
  setPanelIntegration: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), config: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [exp] = await db
        .select({ id: experiment.id })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(experiment)
        .set({ panelIntegration: sanitizePanelIntegration(input.config), updatedAt: new Date() })
        .where(eq(experiment.id, input.studyId));
      return { ok: true };
    }),

  setGroups: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        blocks: z.array(blockInstanceSchema).max(200),
        groups: z
          .array(
            z.object({
              id: z.string(),
              title: z.string().max(200).optional(),
              showIf: conditionGroupSchema.optional(),
              moduleId: z.string().optional(),
            }),
          )
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = pruneForwardConditions(input.blocks as unknown as BlockInstance[]);
      // A group needs ≥2 members — dissolve any that fell to 1 (or 0): clear the
      // lone member's groupId so it becomes a normal block (ADR-0028).
      const counts = new Map<string, number>();
      for (const b of blocks) if (b.groupId) counts.set(b.groupId, (counts.get(b.groupId) ?? 0) + 1);
      const dissolve = new Set([...counts].filter(([, n]) => n < 2).map(([id]) => id));
      for (const b of blocks) if (b.groupId && dissolve.has(b.groupId)) delete b.groupId;
      const used = new Set(blocks.map((b) => b.groupId).filter(Boolean));
      const groups = input.groups.filter((g) => used.has(g.id));
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, blocks, groups }, moduleVersionLocks: locksFromBlocks(blocks) })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return { ok: true };
    }),

  /* ---------- Custom composite modules (ADR-0029) ---------- */

  /** Workspace's saved group templates (newest first). */
  listCustomModules: workspaceProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ id: customModule.id, name: customModule.name, definition: customModule.definition, isPublic: customModule.isPublic })
      .from(customModule)
      .where(eq(customModule.tenantId, ctx.workspace.id))
      .orderBy(desc(customModule.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      definition: r.definition as CustomModuleDefinition,
      blockCount: (r.definition as CustomModuleDefinition).blocks?.length ?? 0,
      isPublic: r.isPublic,
    }));
  }),

  /** Delete a saved module (tenant-scoped). */
  removeCustomModule: writeProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      await db
        .delete(customModule)
        .where(and(eq(customModule.id, input.id), eq(customModule.tenantId, ctx.workspace.id)));
      return { ok: true };
    }),

  /** Save a study group as a reusable workspace module (copy-on-save template). */
  saveGroupAsModule: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), groupId: z.string(), name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const members = (readBlocks(tip.version.definitionSnapshot) as BlockInstance[]).filter(
        (b) => b.groupId === input.groupId,
      );
      if (members.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "That group has no blocks." });
      const title = readGroups(tip.version.definitionSnapshot).find((g) => g.id === input.groupId)?.title;
      const definition = groupToDefinition(members, title);
      const [row] = await db
        .insert(customModule)
        .values({ tenantId: ctx.workspace.id, name: input.name, definition, createdBy: ctx.dbUser.id })
        .returning({ id: customModule.id });
      return { id: row.id };
    }),

  /** Save ONE configured block as a reusable workspace module (ADR-0030) — a
   *  1-block template; insertCustomModule adds those as a plain block (no group). */
  saveBlockAsModule: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string(), name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const block = (readBlocks(tip.version.definitionSnapshot) as BlockInstance[]).find(
        (b) => b.instanceId === input.instanceId,
      );
      if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Block not found." });
      const definition = groupToDefinition([block], input.name);
      const [row] = await db
        .insert(customModule)
        .values({ tenantId: ctx.workspace.id, name: input.name, definition, createdBy: ctx.dbUser.id })
        .returning({ id: customModule.id });
      return { id: row.id };
    }),

  /**
   * Overwrite an existing module from a (now-edited) group it was inserted from,
   * then PROPAGATE the new definition into every other group across the
   * workspace's working drafts that was inserted from this module — re-materialised
   * with fresh ids in place. Frozen versions (preregistrations/named) are separate
   * snapshots and are never touched, so preregistration-safety holds (ADR-0029).
   */
  updateCustomModule: writeProcedure
    .input(z.object({ moduleId: z.string().uuid(), studyId: z.string().uuid(), groupId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true; propagated: number }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const members = (readBlocks(tip.version.definitionSnapshot) as BlockInstance[]).filter(
        (b) => b.groupId === input.groupId,
      );
      if (members.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "That group has no blocks." });
      const title = readGroups(tip.version.definitionSnapshot).find((g) => g.id === input.groupId)?.title;
      const definition = groupToDefinition(members, title);
      const res = await db
        .update(customModule)
        .set({ definition, updatedAt: new Date() })
        .where(and(eq(customModule.id, input.moduleId), eq(customModule.tenantId, ctx.workspace.id)))
        .returning({ id: customModule.id });
      if (res.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Module not found." });

      // Propagate into other working-draft usages (replace each usage group's
      // member blocks; keep its own title/condition/group id). Skip the source group.
      const exps = await db
        .select({ id: experiment.id, versionId: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
        .from(experiment)
        .innerJoin(experimentVersion, eq(experiment.currentVersionId, experimentVersion.id))
        .where(eq(experiment.tenantId, ctx.workspace.id));
      let propagated = 0;
      for (const e of exps) {
        const groups = readGroups(e.snapshot);
        const targetIds = new Set(
          groups
            .filter((g) => g.moduleId === input.moduleId && !(e.id === input.studyId && g.id === input.groupId))
            .map((g) => g.id),
        );
        if (targetIds.size === 0) continue;
        const blocks = readBlocks(e.snapshot) as BlockInstance[];
        const out: BlockInstance[] = [];
        const done = new Set<string>();
        for (const b of blocks) {
          if (b.groupId && targetIds.has(b.groupId)) {
            if (!done.has(b.groupId)) {
              out.push(...definitionToBlocks(definition, b.groupId, () => ulid()));
              done.add(b.groupId);
            }
          } else {
            out.push(b);
          }
        }
        const snap = e.snapshot && typeof e.snapshot === "object" ? (e.snapshot as Record<string, unknown>) : {};
        await db
          .update(experimentVersion)
          .set({ definitionSnapshot: { ...snap, blocks: out }, moduleVersionLocks: locksFromBlocks(out) })
          .where(eq(experimentVersion.id, e.versionId));
        await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, e.id));
        propagated += targetIds.size;
      }
      return { ok: true, propagated };
    }),

  /** Insert a saved module into a study as a new group (fresh ids — copy). */
  insertCustomModule: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), customModuleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ groupId: string }> => {
      // Own workspace's module OR a published community module (ADR-0038) —
      // either way it's copy-on-insert; nothing links back to the source.
      const [mod] = await db
        .select()
        .from(customModule)
        .where(eq(customModule.id, input.customModuleId))
        .limit(1);
      if (!mod || (mod.tenantId !== ctx.workspace.id && !mod.isPublic)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found." });
      }
      const def = mod.definition as CustomModuleDefinition;
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const existing = readBlocks(tip.version.definitionSnapshot) as BlockInstance[];
      // A 1-block template (ADR-0030) inserts as a plain block — no 1-member
      // group (those auto-dissolve by design). Multi-block → a new group.
      const single = def.blocks.length === 1;
      const groupId = ulid();
      const inserted = definitionToBlocks(def, groupId, () => ulid()).map((b) =>
        single ? { ...b, groupId: undefined } : b,
      );
      const blocks = [...existing, ...inserted];
      // Remember the source module so the group can later Update it vs Save-as-new.
      const groups = single
        ? readGroups(tip.version.definitionSnapshot)
        : [...readGroups(tip.version.definitionSnapshot), { id: groupId, title: def.title ?? mod.name, moduleId: mod.id }];
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, blocks, groups }, moduleVersionLocks: locksFromBlocks(blocks) })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return { groupId };
    }),

  /** Save the study's participant theme (ADR-0024) — rides in the snapshot
   *  (frozen by preregistration, copied by fork). Allowlist-validated. */
  setTheme: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), theme: studyThemeSchema }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      // Mimicking presets carry methodological/ethics warnings — saving one
      // requires the researcher's explicit acknowledgment (ADR-0024).
      if (requiresAcknowledgment(input.theme)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This look mimics a real platform — please acknowledge the disclosure requirements first.",
        });
      }
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      // Overview auto-injection (ADR-0024): keep the auto "Visual context"
      // methodology section in sync with the chosen mimicking look.
      const overview = applyVisualContext(readOverview(tip.version.definitionSnapshot), input.theme);
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, theme: input.theme, overview } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "theme", `Adjusted the design (${input.theme.presetKey})`);
      return { ok: true };
    }),

  /**
   * Record (or clear) the IRB attestation for fully-branded stimuli (ADR-0084).
   * Rides `theme.socialPost.irbAttestation` on the working tip's snapshot, so it
   * freezes with preregistration + copies on fork. The byUserId + timestamp ARE
   * the audit record. The freeze mutations hard-gate on this (assertBrandingGate).
   */
  setIrbAttestation: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        attested: z.boolean(),
        statement: z.string().max(2000),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      const theme = readTheme(tip.version.definitionSnapshot);
      const social = resolveSocialPost(theme);
      const nextSocial = {
        ...social,
        irbAttestation: input.attested
          ? { attested: true, byUserId: ctx.dbUser.id, at: new Date().toISOString(), statement: input.statement }
          : null,
      };
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, theme: { ...theme, socialPost: nextSocial } } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "irb", input.attested ? "Recorded the IRB attestation" : "Withdrew the IRB attestation");
      return { ok: true };
    }),

  /**
   * Save the social-post design (ADR-0085, Design → Social) — appearance +
   * interactions + slots under `theme.socialPost`. Rides the snapshot like
   * setTheme; no mimic guard (that's the preset's job in setTheme). The IRB
   * attestation is managed separately (setIrbAttestation) but preserved here
   * because the editor round-trips the full resolved socialPost object.
   */
  setSocialPostDesign: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), socialPost: socialPostSchema }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const snap =
        tip.version.definitionSnapshot && typeof tip.version.definitionSnapshot === "object"
          ? (tip.version.definitionSnapshot as Record<string, unknown>)
          : {};
      const theme = readTheme(tip.version.definitionSnapshot);
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...snap, theme: { ...theme, socialPost: input.socialPost } } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "social-post", "Edited the social-post design");
      return { ok: true };
    }),

  /** Save the consent screen (ADR-0035) — rides definition_snapshot.consent;
   *  empty fields mean "use the default" (merged on read). */
  setConsent: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        consent: z.object({
          body: z.string().max(5000),
          agreeLabel: z.string().max(80),
          disagreeLabel: z.string().max(80),
          declineMessage: z.string().max(2000),
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
        .set({ definitionSnapshot: { ...snap, consent: input.consent } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "consent", "Edited the consent screen");
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
          replicationIntent: z.enum(["direct", "conceptual", "extension"]).optional(),
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
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "overview", "Edited the overview");
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
   *
   * `workspaceProcedure` (not write): viewers can preview a study they can see —
   * it's just the participant view, and preview responses never reach results.
   */
  startPreview: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), variantCell: z.record(z.string(), z.string()).nullish() }))
    .mutation(async ({ ctx, input }): Promise<{ responseId: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const rec = await runtimeOpenRecruitment(tip.version.id);
      // A chosen cell (the live-preview selector, ADR-0058) forces that variant;
      // omitted → random like a real participant.
      const res = await runtimeStartResponse({
        recruitmentSessionId: rec.id,
        mode: "preview",
        ...(input.variantCell !== undefined ? { variantCell: input.variantCell } : {}),
      });
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
      await writeBlocks(tip.version.id, input.studyId, reordered, { actorUserId: ctx.dbUser.id, summary: "Reordered the blocks" });
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
      await writeBlocks(tip.version.id, input.studyId, blocks, { actorUserId: ctx.dbUser.id, summary: `Edited the ${target.key} block` });
      return { ok: true };
    }),

  /**
   * Generate the audio for an `audio-stimulus` block (ADR-0069): read the saved
   * script + delivery direction, hash them, reuse the cached R2 clip on an
   * identical input, otherwise synthesize via the AI gateway (`runTts` — audited,
   * metered, budget-enforced) using the workspace's BYO Hume key and store the
   * mp3 in R2. Writes the resulting `/api/media` URL + hash back onto the block
   * config so the Take surface plays it with no run-time vendor call.
   */
  generateStimulusAudio: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ url: string; cached: boolean }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot);
      const idx = blocks.findIndex((b) => b.instanceId === input.instanceId);
      if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const target = blocks[idx];
      if (target.key !== "audio-stimulus") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not an audio-stimulus block." });
      }
      const cfg = (target.config ?? {}) as { script?: string; description?: string };
      const script = (cfg.script ?? "").trim();
      const description = (cfg.description ?? "").trim();
      if (!script) throw new TRPCError({ code: "BAD_REQUEST", message: "Write a script first." });

      // Resolve the workspace's Hume key (BYO; ADR-0067).
      const [conn] = await db
        .select({ apiKey: aiProviderConnection.apiKey })
        .from(aiProviderConnection)
        .where(
          and(
            eq(aiProviderConnection.workspaceId, ctx.workspace.id),
            eq(aiProviderConnection.provider, "hume"),
          ),
        )
        .limit(1);
      if (!conn) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect Hume in Settings → Workspace to generate audio.",
        });
      }

      // Deterministic cache key from the inputs that change the audio. The two
      // free-text fields are joined with a NUL delimiter so ("ab","c") and
      // ("a","bc") can't produce the same key. We emit the NUL via
      // String.fromCharCode(0) rather than a literal NUL byte in source — a raw
      // NUL once made git/grep treat this whole file as binary. Same bytes hashed,
      // so existing cached audio keys stay valid.
      const sep = String.fromCharCode(0);
      const hash = createHash("sha256").update(`${script}${sep}${description}`).digest("hex").slice(0, 32);
      const key = `ws/${ctx.workspace.id}/audio-stimulus/${hash}.mp3`;
      const url = `/api/media/${key}`;

      const persist = async (cached: boolean) => {
        blocks[idx] = { ...target, config: { ...target.config, audioUrl: url, audioHash: hash } };
        await writeBlocks(tip.version.id, input.studyId, blocks);
        return { url, cached };
      };

      // Cache hit: the clip for these exact inputs already exists in R2.
      try {
        const head = await fetch(await storage.presignDownload(key), { method: "HEAD" });
        if (head.ok) return persist(true);
      } catch {
        // fall through to generate
      }

      let audio: { audioBase64: string; mimeType: string };
      try {
        audio = await runTts(
          {
            workspaceId: ctx.workspace.id,
            studyId: input.studyId,
            blockInstanceId: input.instanceId,
            feature: "audio-stimulus",
            sensitivity: "researcher_content",
          },
          { script, description: description || undefined },
          { provider: "hume", apiKey: decryptSecret(conn.apiKey) },
        );
      } catch (err) {
        if (err instanceof AiBudgetExceededError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Monthly AI budget cap reached." });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Audio generation failed — check your Hume key." });
      }

      // Upload the bytes to R2 via a presigned PUT (server-side; no adapter change).
      const putUrl = await storage.presignUpload(key, audio.mimeType);
      const put = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": audio.mimeType },
        body: Buffer.from(audio.audioBase64, "base64"),
      });
      if (!put.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't store the generated audio." });

      return persist(false);
    }),

  /**
   * Generate (or cache-hit) a TTS clip for an ARBITRARY script — used for
   * per-variant audio (ADR-0058/0069): the variants editor calls this once per
   * level's script and stores the resulting URLs as an `audioUrl` binding, so each
   * variant plays its own clip (the runtime already resolves the bound audioUrl per
   * cell). Unlike `generateStimulusAudio` it does NOT mutate a block — it just
   * returns the cached `/api/media` URL. Same R2 cache key, so identical scripts
   * are free and shared with the single-block generator.
   */
  generateAudioClip: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), script: z.string().min(1).max(2000), description: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }): Promise<{ url: string; cached: boolean }> => {
      await loadWorkingTip(input.studyId, ctx.workspace.id); // authz: study ∈ workspace
      const script = input.script.trim();
      const description = (input.description ?? "").trim();
      if (!script) throw new TRPCError({ code: "BAD_REQUEST", message: "Empty script." });

      const [conn] = await db
        .select({ apiKey: aiProviderConnection.apiKey })
        .from(aiProviderConnection)
        .where(and(eq(aiProviderConnection.workspaceId, ctx.workspace.id), eq(aiProviderConnection.provider, "hume")))
        .limit(1);
      if (!conn) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect Hume in Settings → Workspace to generate audio." });
      }

      const hash = createHash("sha256").update(`${script} ${description}`).digest("hex").slice(0, 32);
      const key = `ws/${ctx.workspace.id}/audio-stimulus/${hash}.mp3`;
      const url = `/api/media/${key}`;

      // Cache hit: identical (script, description) already rendered.
      try {
        const head = await fetch(await storage.presignDownload(key), { method: "HEAD" });
        if (head.ok) return { url, cached: true };
      } catch {
        /* fall through to generate */
      }

      let audio: { audioBase64: string; mimeType: string };
      try {
        audio = await runTts(
          { workspaceId: ctx.workspace.id, studyId: input.studyId, feature: "audio-stimulus", sensitivity: "researcher_content" },
          { script, description: description || undefined },
          { provider: "hume", apiKey: decryptSecret(conn.apiKey) },
        );
      } catch (err) {
        if (err instanceof AiBudgetExceededError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Monthly AI budget cap reached." });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Audio generation failed — check your Hume key." });
      }

      const putUrl = await storage.presignUpload(key, audio.mimeType);
      const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": audio.mimeType }, body: Buffer.from(audio.audioBase64, "base64") });
      if (!put.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't store the generated audio." });
      return { url, cached: false };
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
      await writeBlocks(tip.version.id, input.studyId, blocks, { actorUserId: ctx.dbUser.id, summary: "Renamed a block" });
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
      await writeBlocks(tip.version.id, input.studyId, blocks, { actorUserId: ctx.dbUser.id, summary: "Changed a block's branching rule" });
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
      await writeBlocks(tip.version.id, input.studyId, blocks, { actorUserId: ctx.dbUser.id, summary: "Changed a block's visibility condition" });
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
      await writeBlocks(tip.version.id, input.studyId, blocks, { actorUserId: ctx.dbUser.id, summary: "Changed a block's condition visibility" });
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
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "conditions", `Added the "${input.name}" condition`);
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
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean; reason?: string }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const all = await conditionsForVersion(tip.version.id);
      const target = all.find((c) => c.id === input.conditionId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // A condition that participants have been assigned to can't be hard-deleted —
      // response.conditionId references it (including PREVIEW runs), so a raw DELETE
      // throws an FK error that leaked to the UI. Refuse gracefully (RETURNED, not
      // thrown, so the global autosave indicator doesn't read it as a lost edit)
      // and point at the non-destructive workaround.
      const [refs] = await db
        .select({ n: count() })
        .from(responseTable)
        .where(eq(responseTable.conditionId, target.id));
      if ((refs?.n ?? 0) > 0) {
        return {
          ok: false,
          reason:
            "This group already has responses recorded against it (including any preview runs), so it can’t be deleted. Rename it, or set its weight to 0 to stop assigning new participants to it.",
        };
      }

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
      await recordStudyEdit(input.studyId, ctx.dbUser.id, "conditions", `Removed the "${target.name}" condition`);
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
          whiteboardViewport: tip.version.whiteboardViewport,
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
          whiteboardViewport: tip.version.whiteboardViewport,
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
        assertBrandingGate(tip.version.definitionSnapshot);

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
            whiteboardViewport: tip.version.whiteboardViewport,
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

        await trackEvent({
          userId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          event: "study_preregistered",
          sensitivity: "researcher_behavior",
        });

        return { versionNumber: pre.versionNumber, pushStatus };
      },
    ),

  /**
   * Amend a preregistered study (ADR-0004) — freeze the current working tip as a
   * NEW preregistered version that SUPERSEDES the latest preregistration, with a
   * required change summary + optional classification. Re-pushes to OSF as an
   * amendment on the same project node. Migration-free: the lineage columns
   * (supersedes_version_id / change_summary / amendment_classification) exist.
   */
  amend: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        changeSummary: z.string().trim().min(1, "Describe what changed.").max(2000),
        classification: z
          .enum(["typo", "methodological-correction", "clarification", "scope-change", "other"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ versionNumber: number; pushStatus: "pending" | "no_credentials" }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      assertBrandingGate(tip.version.definitionSnapshot);

      // The amendment supersedes the latest preregistered version.
      const [prior] = await db
        .select({ id: experimentVersion.id })
        .from(experimentVersion)
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(experimentVersion.kind, "preregistered")))
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (!prior) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Preregister this study before filing an amendment.",
        });
      }

      const nextNumber = await nextVersionNumber(input.studyId);
      const connection = await registry.getConnection(ctx.dbUser.id);
      const pushStatus = connection.connected ? "pending" : "no_credentials";

      const [pre] = await db
        .insert(experimentVersion)
        .values({
          experimentId: input.studyId,
          versionNumber: nextNumber,
          kind: "preregistered",
          name: `Amendment v${nextNumber}`,
          definitionSnapshot: tip.version.definitionSnapshot,
          whiteboardViewport: tip.version.whiteboardViewport,
          moduleVersionLocks: tip.version.moduleVersionLocks,
          createdBy: ctx.dbUser.id,
          registryPushStatus: pushStatus,
          // ADR-0004 lineage (the CHECK requires supersedes + non-empty summary together).
          supersedesVersionId: prior.id,
          changeSummary: input.changeSummary,
          amendmentClassification: input.classification ?? null,
        })
        .returning();

      // Freeze conditions into the immutable version (same as preregister).
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

      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));

      if (connection.connected) {
        await jobs.enqueue("registry.push", {
          experimentVersionId: pre.id,
          registryKey: "osf",
          userId: ctx.dbUser.id,
          isAmendment: true,
        });
      }

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
        data: { studyTitle: tip.experiment.title, versionName: pre.name, versionNumber: pre.versionNumber },
      });

      return { versionNumber: pre.versionNumber, pushStatus };
    }),

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
      assertBrandingGate(tip.version.definitionSnapshot);

      const nextNumber = await nextVersionNumber(input.studyId);

      const [pub] = await db
        .insert(experimentVersion)
        .values({
          experimentId: input.studyId,
          versionNumber: nextNumber,
          kind: "published",
          name: `Published v${nextNumber}`,
          definitionSnapshot: tip.version.definitionSnapshot,
          whiteboardViewport: tip.version.whiteboardViewport,
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
      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        event: "study_published",
        sensitivity: "researcher_behavior",
      });

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
          changeSummary: experimentVersion.changeSummary,
          supersedesVersionId: experimentVersion.supersedesVersionId,
          withdrawn: experimentVersion.registrationWithdrawn,
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
      // For an amendment, resolve the superseded version's number for the lineage line.
      let amends: number | null = null;
      if (pre.supersedesVersionId) {
        const [sup] = await db
          .select({ n: experimentVersion.versionNumber })
          .from(experimentVersion)
          .where(eq(experimentVersion.id, pre.supersedesVersionId))
          .limit(1);
        amends = sup?.n ?? null;
      }
      return {
        versionNumber: pre.versionNumber,
        name: pre.name ?? `Preregistration v${pre.versionNumber}`,
        pushStatus: pre.pushStatus,
        url: pre.url,
        doi: pre.doi,
        lastError: pre.lastError,
        changeSummary: pre.changeSummary,
        amends,
        withdrawn: pre.withdrawn,
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
        .select({ id: experimentVersion.id, kind: experimentVersion.kind, n: experimentVersion.versionNumber, snapshot: experimentVersion.definitionSnapshot, finishedAt: experiment.finishedAt })
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
      if (!ver) return { runnable: false, versionKind: null, liveVersionNumber: null, divergedFromLive: false, recruitment: null, finishedAt: null };

      // Drift: the editable autosave tip vs the frozen live version — edits made
      // after freezing don't reach participants until publish/amend/make-live.
      // Compares the FULL snapshot + conditions, not just blocks (ADR-0044), so a
      // consent / theme / condition-weight edit also reads as drift.
      const [tip] = await db
        .select({ id: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(experimentVersion.kind, "autosave")))
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      const divergedFromLive =
        !!tip &&
        (await versionFingerprint(tip.id, tip.snapshot)) !== (await versionFingerprint(ver.id, ver.snapshot));

      // Status from the latest session of the live version; the response count is
      // POOLED across every runnable version's sessions, so a make-live cutover
      // doesn't make the collected total appear to reset to 0 (ADR-0044).
      const [rs] = await db
        .select({ status: recruitmentSession.status })
        .from(recruitmentSession)
        .where(eq(recruitmentSession.experimentVersionId, ver.id))
        .orderBy(desc(recruitmentSession.openedAt))
        .limit(1);
      const sessionCounts = await db
        .select({ currentN: recruitmentSession.currentN })
        .from(recruitmentSession)
        .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
        .where(
          and(
            eq(experimentVersion.experimentId, input.studyId),
            inArray(experimentVersion.kind, RUNNABLE_KINDS),
          ),
        );
      const pooledN = sessionCounts.reduce((sum, s) => sum + s.currentN, 0);
      return {
        runnable: true,
        versionKind: ver.kind as "preregistered" | "published",
        liveVersionNumber: ver.n,
        divergedFromLive,
        recruitment: rs ? { status: rs.status, currentN: pooledN } : null,
        finishedAt: ver.finishedAt?.toISOString() ?? null,
      };
    }),

  /**
   * Per-study Dashboard (ADR-0056) — the first stage tab: a lifecycle tracker,
   * recruitment/data at a glance, concrete next-actions, and a recent-activity
   * timeline. Read-only aggregate over existing tables; no new data.
   */
  studyDashboard: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<StudyDashboardData> => {
      const [exp] = await db
        .select({ id: experiment.id, title: experiment.title, finishedAt: experiment.finishedAt })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });

      const versions = await db
        .select({ kind: experimentVersion.kind, withdrawn: experimentVersion.registrationWithdrawn })
        .from(experimentVersion)
        .where(eq(experimentVersion.experimentId, input.studyId));
      // A withdrawn registration no longer counts as "preregistered" anywhere in
      // the app (item 3): the plan is no longer frozen on the registry.
      const hasPrereg = versions.some((v) => v.kind === "preregistered" && !v.withdrawn);
      const wasWithdrawn = versions.some((v) => v.kind === "preregistered" && v.withdrawn);
      const hasPublished = versions.some((v) => v.kind === "published");

      // Recruitment + responses must reflect the LIVE study only — never the
      // ephemeral artifacts a Preview leaves behind. Preview opens a recruitment
      // session on the DRAFT version and writes a `mode:"preview"` response
      // (startPreview → runtime openRecruitment), so the dashboard restricts to
      // recruitment on a frozen runnable version and to `mode:"run"` responses —
      // matching what Run/Results consider "running" (otherwise the dashboard
      // showed Recruiting/Data-in/1-response for a study that was only previewed).
      const [rs] = await db
        .select({ status: recruitmentSession.status, targetN: recruitmentSession.targetN })
        .from(recruitmentSession)
        .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS)))
        .orderBy(desc(recruitmentSession.openedAt))
        .limit(1);

      const [{ done }] = await db
        .select({ done: count() })
        .from(responseTable)
        .innerJoin(experimentVersion, eq(responseTable.experimentVersionId, experimentVersion.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(responseTable.status, "completed"), eq(responseTable.mode, "run")));
      const completedResponses = Number(done);

      // Conditions live per version; pool by name across the study's versions.
      const balanceRows = await db
        .select({ name: condition.name, n: count(responseTable.id) })
        .from(condition)
        .innerJoin(experimentVersion, eq(condition.experimentVersionId, experimentVersion.id))
        .leftJoin(
          responseTable,
          and(eq(responseTable.conditionId, condition.id), eq(responseTable.status, "completed"), eq(responseTable.mode, "run")),
        )
        .where(eq(experimentVersion.experimentId, input.studyId))
        .groupBy(condition.name);

      const [recRow] = await db
        .select({ visibility: studyRecord.visibility, abstract: studyRecord.abstract, publishedAt: studyRecord.publishedAt })
        .from(studyRecord)
        .where(eq(studyRecord.experimentId, input.studyId))
        .limit(1);

      const [reps] = await db
        .select({ c: count() })
        .from(experiment)
        .where(eq(experiment.forkOfExperimentId, input.studyId));

      const events = await db
        .select({ id: activityEvent.id, type: activityEvent.type, createdAt: activityEvent.createdAt })
        .from(activityEvent)
        .where(eq(activityEvent.relatedStudyId, input.studyId))
        .orderBy(desc(activityEvent.createdAt))
        .limit(8);

      const recordPublic = recRow?.visibility === "public";
      const recruiting = rs?.status === "open";
      const hasData = completedResponses > 0;
      const finished = !!exp.finishedAt;

      // Lifecycle spine (ADR-0056).
      const lifecycle = [
        { key: "draft", label: "Draft", done: true },
        { key: "preregistered", label: wasWithdrawn && !hasPrereg ? "Preregistration withdrawn" : "Preregistered", done: hasPrereg },
        { key: "recruiting", label: "Recruiting", done: recruiting || hasData || finished },
        { key: "data", label: "Data in", done: hasData },
        { key: "finished", label: "Finished", done: finished },
        { key: "published", label: "Record published", done: recordPublic },
      ];
      const currentStep = [...lifecycle].reverse().find((s) => s.done)?.key ?? "draft";

      // Concrete next-actions / blockers.
      const nextActions: StudyDashboardData["nextActions"] = [];
      const base = `/studies/${input.studyId}`;
      // Only prompt to "make it runnable" before the study is actually running —
      // not once it's recruiting or already has responses (item 5).
      if (!hasPrereg && !hasPublished && !recruiting && !hasData) {
        nextActions.push({ label: "Preregister or publish to make it runnable", href: `${base}/preregister`, tone: "primary" });
      } else if (!recruiting && !hasData) {
        nextActions.push({ label: "Open recruitment to start collecting data", href: `${base}/run`, tone: "primary" });
      }
      // Surface a withdrawn registration explicitly rather than silently dropping
      // the "Preregistered" step (item 3).
      if (wasWithdrawn && !hasPrereg) {
        nextActions.push({ label: "Registration withdrawn — re-register to restore the frozen plan", href: `${base}/preregister`, tone: "warning" });
      }
      if (rs?.status === "open" && rs.targetN != null && completedResponses >= rs.targetN) {
        nextActions.push({ label: "Target reached — review and finish", href: `${base}/results`, tone: "warning" });
      }
      if (hasData && !finished) {
        nextActions.push({ label: "Mark the study as finished", href: `${base}/results`, tone: "muted" });
      }
      if (finished && !recordPublic) {
        nextActions.push({
          label: recRow?.abstract ? "Publish your study record" : "Add an abstract, then publish your record",
          href: `${base}/record`,
          tone: "primary",
        });
      }

      return {
        title: exp.title,
        lifecycle,
        currentStep,
        recruitment: { status: rs?.status ?? null, currentN: completedResponses, targetN: rs?.targetN ?? null },
        completedResponses,
        conditionBalance: balanceRows.map((r) => ({ name: r.name, n: Number(r.n) })),
        record: recRow
          ? { visibility: recRow.visibility === "public" ? "public" : "workspace", hasAbstract: !!recRow.abstract?.trim(), publishedAt: recRow.publishedAt?.toISOString() ?? null }
          : null,
        replicationCount: Number(reps?.c ?? 0),
        nextActions,
        activity: events.map((e) => ({ id: e.id, type: e.type, at: e.createdAt.toISOString() })),
      };
    }),

  /**
   * Study changelog (ADR-0033 + ADR-0056) — one when/what/who timeline merging
   * frozen version saves (with their auto-changelog) and non-versioned lifecycle
   * events (recruitment opened/closed, OSF push, finished, replication, …).
   * The Versions sub-tab shows only saves; the Dashboard shows this fuller story.
   */
  changelog: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }): Promise<ChangelogEntry[]> => {
      const [exp] = await db
        .select({ id: experiment.id, updatedAt: experiment.updatedAt })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      // Frozen version saves. Author + snapshot, oldest→newest so the diff is vs
      // the previous frozen version. (The autosave draft is handled separately
      // below so unsaved edits still show — feedback: "nothing in changelog".)
      const vrows = await db
        .select({
          id: experimentVersion.id,
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          name: experimentVersion.name,
          createdAt: experimentVersion.createdAt,
          snapshot: experimentVersion.definitionSnapshot,
          author: user.displayName,
        })
        .from(experimentVersion)
        .leftJoin(user, eq(experimentVersion.createdBy, user.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), sql`${experimentVersion.kind} <> 'autosave'`))
        .orderBy(experimentVersion.createdAt);

      const versionEntries: ChangelogEntry[] = vrows.map((r, i) => {
        const title =
          r.kind === "preregistered"
            ? `Preregistered v${r.versionNumber}${r.name ? ` — ${r.name}` : ""}`
            : r.kind === "published"
              ? `Published v${r.versionNumber}${r.name ? ` — ${r.name}` : ""}`
              : `Saved v${r.versionNumber}${r.name ? ` — ${r.name}` : ""}`;
        const detail = i === 0 ? initialVersionSummary(r.snapshot) : changelogBetween(vrows[i - 1].snapshot, r.snapshot);
        return { id: `v:${r.id}`, at: r.createdAt.toISOString(), actor: r.author ?? null, kind: "version", title, detail };
      });

      // Working draft (autosave tip): show edits the researcher has made since the
      // last frozen version but NOT yet saved as a new version — otherwise overview/
      // hypotheses/design changes never appear until a save (feedback bug).
      const draftEntries: ChangelogEntry[] = [];
      const [draft] = await db
        .select({ snapshot: experimentVersion.definitionSnapshot, author: user.displayName })
        .from(experimentVersion)
        .leftJoin(user, eq(experimentVersion.createdBy, user.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(experimentVersion.kind, "autosave")))
        .orderBy(desc(experimentVersion.versionNumber))
        .limit(1);
      if (draft) {
        const lastFrozen = vrows.length ? vrows[vrows.length - 1] : null;
        // Never-frozen draft: diff against the default-new-study baseline so the
        // full differ enumerates the researcher's edits (blocks, design, consent,
        // overview, config) instead of a bare "Initial version — N blocks" that
        // hid them (ADR-0033 amendment, owner: "changelog missing a lot of changes").
        const detail = lastFrozen
          ? changelogBetween(lastFrozen.snapshot, draft.snapshot)
          : changelogBetween(DEFAULT_NEW_STUDY_SNAPSHOT, draft.snapshot);
        // Only when there's actually something pending (a frozen baseline that
        // differs, or a brand-new study with any edits yet).
        if (detail.length) {
          draftEntries.push({
            id: "draft",
            at: exp.updatedAt.toISOString(),
            actor: draft.author ?? null,
            kind: "version",
            title: lastFrozen ? "Working draft — unsaved changes" : "Working draft",
            detail,
          });
        }
      }

      // Non-versioned lifecycle events. Skip the types that merely echo a version
      // save (those are already version entries above) to avoid duplicate rows.
      const ECHOES_VERSION = new Set(["new_named_version", "preregister_complete"]);
      const erows = await db
        .select({
          id: activityEvent.id,
          type: activityEvent.type,
          createdAt: activityEvent.createdAt,
          actor: user.displayName,
        })
        .from(activityEvent)
        .leftJoin(user, eq(activityEvent.actorUserId, user.id))
        .where(eq(activityEvent.relatedStudyId, input.studyId))
        .orderBy(desc(activityEvent.createdAt))
        .limit(input.limit);

      const eventEntries: ChangelogEntry[] = erows
        .filter((e) => !ECHOES_VERSION.has(e.type))
        .map((e) => ({
          id: `e:${e.id}`,
          at: e.createdAt.toISOString(),
          actor: e.actor ?? null,
          kind: "event" as const,
          title: humanizeEventType(e.type),
          detail: [],
        }));

      // Recruitment open/close aren't activity events — synthesize them from the
      // session rows so "start/stop" shows in the timeline (owner request).
      // Only sessions on a frozen runnable version are real recruitment — a
      // Preview opens a session on the DRAFT version, which must NOT surface as
      // "Opened recruitment" in the timeline.
      const sessions = await db
        .select({ id: recruitmentSession.id, status: recruitmentSession.status, openedAt: recruitmentSession.openedAt, closedAt: recruitmentSession.closedAt })
        .from(recruitmentSession)
        .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS)));
      // Recruitment open/close aren't activity events — synthesize from the
      // LATEST session only (the one the Dashboard reflects). Reopening makes a
      // NEW session, so older closed sessions would otherwise surface a stale
      // "Closed recruitment" while currently recruiting (owner bug). Pause sets
      // closedAt=null (no timestamp), so only open + actual-close are shown.
      const recruitmentEntries: ChangelogEntry[] = [];
      const latestSession = [...sessions].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
      if (latestSession) {
        recruitmentEntries.push({ id: `r:${latestSession.id}:open`, at: latestSession.openedAt.toISOString(), actor: null, kind: "event", title: "Opened recruitment", detail: [] });
        if (latestSession.status === "closed" && latestSession.closedAt) {
          recruitmentEntries.push({ id: `r:${latestSession.id}:close`, at: latestSession.closedAt.toISOString(), actor: null, kind: "event", title: "Closed recruitment", detail: [] });
        }
      }

      return [...draftEntries, ...versionEntries, ...eventEntries, ...recruitmentEntries]
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .slice(0, input.limit);
    }),

  /**
   * The granular, time-ordered edit trail (ADR-0086) — the changelog "Detailed"
   * view. Each row is one (coalesced) researcher edit to the working draft. This
   * is the provenance layer that complements the snapshot-diff Summary; fetched
   * lazily by the client only when the reader opens Detailed.
   */
  editTimeline: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(80) }))
    .query(async ({ ctx, input }): Promise<ChangelogEntry[]> => {
      const [exp] = await db
        .select({ id: experiment.id })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await db
        .select({
          id: studyEditEvent.id,
          summary: studyEditEvent.summary,
          createdAt: studyEditEvent.createdAt,
          actor: user.displayName,
        })
        .from(studyEditEvent)
        .leftJoin(user, eq(studyEditEvent.actorUserId, user.id))
        .where(eq(studyEditEvent.experimentId, input.studyId))
        .orderBy(desc(studyEditEvent.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        id: `edit:${r.id}`,
        at: r.createdAt.toISOString(),
        actor: r.actor ?? null,
        kind: "event" as const,
        title: r.summary,
        detail: [],
      }));
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
      // One-open-session invariant (ADR-0044): if an older runnable version still
      // has a live session, close it so recruitment can't silently fork.
      await closeOtherRunnableSessions(input.studyId, ver.id);
      await runtimeOpenRecruitment(ver.id);
      return { ok: true };
    }),

  /**
   * Pause, resume, or close (stop) data collection for the study's latest
   * runnable version (run-stage.md). Non-destructive — paused/closed gate the
   * public /take link immediately (the runtime only begins on an `open` session)
   * while keeping every collected response. `resume` reopens the same session so
   * data isn't split. Migration-free: recruitment_session.status + closedAt exist.
   */
  setRecruitmentStatus: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), status: z.enum(["open", "paused", "closed"]) }))
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
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This study isn't running." });
      }
      const res = await runtimeSetRecruitmentStatus(ver.id, input.status);
      if (!res.ok) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Recruitment hasn't been opened yet." });
      }
      return { ok: true };
    }),

  /**
   * Studies·Running KPI strip (studies-running-tab.md, Phase 1). Recruiting
   * studies / responses today (rolling 24h) / responses this week (rolling 7d) /
   * studies needing attention (rows with a non-healthy status). Polled ~60s while
   * the tab is visible. Read-only — `workspaceProcedure` so viewers see it too.
   */
  runningOverview: workspaceProcedure.query(async ({ ctx }): Promise<RunningOverview> => {
    const wsId = ctx.workspace.id;
    const now = Date.now();
    const dayAgo = new Date(now - DAY_MS);
    const weekAgo = new Date(now - 7 * DAY_MS);

    const windowCount = (since: Date) =>
      db
        .select({ c: count() })
        .from(responseTable)
        .innerJoin(experimentVersion, eq(responseTable.experimentVersionId, experimentVersion.id))
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(
          and(
            eq(experiment.tenantId, wsId),
            eq(responseTable.status, "completed"),
            eq(responseTable.mode, "run"),
            gte(responseTable.completedAt, since),
            // Demo responses don't inflate the KPI strip when demo is hidden (ADR-0023).
            demoStudyCondition(ctx.workspace.showDemoContent),
          ),
        );

    const [rows, [today], [week]] = await Promise.all([
      buildRunningRows(wsId, ctx.workspace.showDemoContent),
      windowCount(dayAgo),
      windowCount(weekAgo),
    ]);

    return {
      recruitingStudies: rows.length,
      responsesToday: today?.c ?? 0,
      responsesThisWeek: week?.c ?? 0,
      needingAttention: rows.filter((r) => r.status !== "healthy").length,
    };
  }),

  /**
   * Studies·Running recruitment table (studies-running-tab.md, Phase 1). One row
   * per recruiting study with the at-a-glance health metrics (n/target, last
   * response + stalled, condition balance + imbalance, status badge). The alert
   * center is the client-side filter of these rows to non-healthy status, so it
   * needs no separate query. Read-only; the per-row Pause/Stop actions are the
   * write-gated `setRecruitmentStatus`. Drill-down (`runningDetail`) is Phase 2.
   */
  runningList: workspaceProcedure.query(
    async ({ ctx }): Promise<RunningStudyRow[]> =>
      buildRunningRows(ctx.workspace.id, ctx.workspace.showDemoContent),
  ),

  /**
   * Make the current draft live mid-recruitment (ADR-0044). ONE transaction:
   * (1) freeze the working tip into a new immutable version — an `amend` for a
   * preregistered study (requires `changeSummary`, re-pushes to OSF per ADR-0004)
   * or a `publish` for a published study; (2) close EVERY open recruitment
   * session on the study's prior runnable versions; (3) open a fresh session on
   * the new version. The studyId-based public link instantly serves the new
   * version (resolveOpenRecruitment picks newest-with-open-session), so the link
   * never changes and never goes dark. In-flight participants finish on their
   * pinned version (response.experimentVersionId is immutable). Refused unless
   * the study is runnable AND the draft diverges from the live version (no no-op
   * amendments). Keeps standalone `amend`/`publish` (freeze without recruitment).
   * Freeze inserts mirror amend (L2662) / publish (L2737) — keep them in sync.
   */
  makeLive: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        changeSummary: z.string().trim().max(2000).optional(),
        classification: z
          .enum(["typo", "methodological-correction", "clarification", "scope-change", "other"])
          .optional(),
      }),
    )
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ versionNumber: number; versionKind: "preregistered" | "published"; pushStatus: "pending" | "no_credentials" | null }> => {
        const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
        assertBrandingGate(tip.version.definitionSnapshot);

        // The live frozen version we're superseding (latest runnable). Tenancy is
        // already enforced by loadWorkingTip, so this can be experimentId-scoped.
        const [live] = await db
          .select({ id: experimentVersion.id, kind: experimentVersion.kind, snapshot: experimentVersion.definitionSnapshot })
          .from(experimentVersion)
          .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS)))
          .orderBy(desc(experimentVersion.versionNumber))
          .limit(1);
        if (!live) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Freeze and open recruitment before making edits live.",
          });
        }

        // No-op guard: the editable draft must actually differ from the live
        // version — compares the FULL snapshot + conditions (ADR-0044), so a
        // consent / theme / condition-weight edit also counts as a change.
        const diverged =
          (await versionFingerprint(tip.version.id, tip.version.definitionSnapshot)) !==
          (await versionFingerprint(live.id, live.snapshot));
        if (!diverged) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No unpublished changes to make live." });
        }

        const versionKind = live.kind as "preregistered" | "published";

        // Preregistered → this IS an amendment (ADR-0004): require a change summary,
        // supersede the live (== latest preregistered) version, and re-push to OSF.
        let changeSummary: string | null = null;
        let supersedesVersionId: string | null = null;
        let pushStatus: "pending" | "no_credentials" | null = null;
        let connected = false;
        if (versionKind === "preregistered") {
          const summary = input.changeSummary?.trim();
          if (!summary) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Describe what changed — amendments to a preregistration require a summary.",
            });
          }
          changeSummary = summary;
          supersedesVersionId = live.id;
          const connection = await registry.getConnection(ctx.dbUser.id);
          connected = connection.connected;
          pushStatus = connected ? "pending" : "no_credentials";
        }

        const nextNumber = await nextVersionNumber(input.studyId);
        const versionName = versionKind === "preregistered" ? `Amendment v${nextNumber}` : `Published v${nextNumber}`;
        const tipConditions = await conditionsForVersion(tip.version.id);

        // Prior runnable versions whose live sessions we supersede, so the new
        // version is the only one with a live session (no DB partial-unique
        // guard, ADR-0044).
        const priorRunnable = await db
          .select({ id: experimentVersion.id })
          .from(experimentVersion)
          .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS)));
        const priorIds = priorRunnable.map((v) => v.id);

        // Inherit the prior recruitment INTENT (ADR-0044): if the study was
        // paused or stopped, making edits live must NOT silently re-open it. The
        // new session carries forward open/paused/closed from the latest prior
        // session (default open when none existed). Resume/Reopen then acts on
        // the new version's session as usual.
        const [priorSession] = priorIds.length
          ? await db
              .select({ status: recruitmentSession.status })
              .from(recruitmentSession)
              .where(inArray(recruitmentSession.experimentVersionId, priorIds))
              .orderBy(desc(recruitmentSession.openedAt))
              .limit(1)
          : [];
        const newStatus = priorSession?.status ?? "open";

        const newVersionId = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(experimentVersion)
            .values({
              experimentId: input.studyId,
              versionNumber: nextNumber,
              kind: versionKind,
              name: versionName,
              definitionSnapshot: tip.version.definitionSnapshot,
              whiteboardViewport: tip.version.whiteboardViewport,
              moduleVersionLocks: tip.version.moduleVersionLocks,
              createdBy: ctx.dbUser.id,
              ...(versionKind === "preregistered"
                ? {
                    registryPushStatus: pushStatus ?? undefined,
                    // ADR-0004 lineage (CHECK: supersedes + non-empty summary together).
                    supersedesVersionId,
                    changeSummary,
                    amendmentClassification: input.classification ?? null,
                  }
                : {}),
            })
            .returning({ id: experimentVersion.id });

          // Freeze conditions into the immutable version (mirror amend/publish); if
          // the draft had none, seed a default control so assignment works.
          if (tipConditions.length) {
            await tx.insert(conditionTable).values(
              tipConditions.map((c) => ({
                id: ulid(),
                experimentVersionId: created.id,
                slug: c.slug,
                name: c.name,
                allocationWeight: String(c.allocationWeight),
                position: c.position,
              })),
            );
          } else {
            await tx.insert(conditionTable).values({
              id: ulid(),
              experimentVersionId: created.id,
              slug: "control",
              name: "Control",
              allocationWeight: "1.0",
              position: 0,
            });
          }

          // Supersede the old version: terminate any live (open/paused) prior
          // session so the new version's session is the only live one.
          if (priorIds.length) {
            await tx
              .update(recruitmentSession)
              .set({ status: "closed", closedAt: new Date() })
              .where(
                and(
                  inArray(recruitmentSession.experimentVersionId, priorIds),
                  inArray(recruitmentSession.status, ["open", "paused"]),
                ),
              );
          }

          // Open the new version's session carrying forward the prior INTENT —
          // open keeps recruiting, paused stays inactive, closed stays terminal.
          await tx.insert(recruitmentSession).values({
            id: ulid(),
            experimentVersionId: created.id,
            status: newStatus,
            closedAt: newStatus === "closed" ? new Date() : null,
          });

          await tx.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
          return created.id;
        });

        // Side effects after commit (a preregistered make-live is an amendment).
        if (versionKind === "preregistered") {
          if (connected) {
            await jobs.enqueue("registry.push", {
              experimentVersionId: newVersionId,
              registryKey: "osf",
              userId: ctx.dbUser.id,
              isAmendment: true,
            });
          }
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
            data: { studyTitle: tip.experiment.title, versionName, versionNumber: nextNumber },
          });
        }

        return { versionNumber: nextNumber, versionKind, pushStatus };
      },
    ),

  /**
   * Hard-delete the study's collected participant responses, keeping the design
   * (ADR-0082 data-lifecycle). The researcher-controlled erasure primitive:
   * removes response + responseItem + qualityFlag rows and recomputes each
   * recruitment session's currentN (see server/db/delete-responses.ts). NOT
   * reversible — guarded three ways: writeProcedure blocks viewers and all
   * mutations during operator support-access (ADR-0075); only the workspace
   * owner/admin OR the study's own author may run it; and the caller must type
   * the study title back as `confirmTitle`. `olderThanDays` (optional) scopes to
   * a retention window; omitted = erase everything.
   */
  deleteResponses: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        confirmTitle: z.string(),
        mode: z.enum(["run", "preview", "all"]).default("all"),
        olderThanDays: z.number().int().positive().nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ responses: number; items: number; flags: number }> => {
      const [study] = await db
        .select({ title: experiment.title, ownerId: experiment.ownerId })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!study) throw new TRPCError({ code: "NOT_FOUND" });

      // Destructive: restrict beyond writeProcedure (which allows editors) to the
      // workspace owner/admin or the study's own author.
      const isPrivileged =
        ctx.role === "owner" || ctx.role === "admin" || study.ownerId === ctx.dbUser.id;
      if (!isPrivileged) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the study author or a workspace owner/admin can delete responses.",
        });
      }

      // Typed-title confirmation (trimmed; exact match) — the last guard against
      // an accidental irreversible wipe.
      if (input.confirmTitle.trim() !== study.title.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Study title confirmation did not match." });
      }

      try {
        return await deleteStudyResponses(input.studyId, ctx.workspace.id, {
          mode: input.mode,
          olderThanDays: input.olderThanDays,
        });
      } catch (e) {
        if (e instanceof StudyNotFoundError) throw new TRPCError({ code: "NOT_FOUND" });
        throw e;
      }
    }),

  /**
   * Preflight for whole-study deletion (ADR-0083) — counts the delete would
   * affect, so the confirm dialog can warn accurately + show the template
   * opt-in. Read-only (deleteStudy dryRun, which skips the template guard).
   */
  deleteStudyPreflight: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(
      async ({
        ctx,
        input,
      }): Promise<{ responses: number; externalReplications: number; templates: number }> => {
        try {
          const { responses, externalReplications, templates } = await deleteStudy(
            input.studyId,
            ctx.workspace.id,
            { dryRun: true },
          );
          return { responses, externalReplications, templates };
        } catch (e) {
          if (e instanceof StudyGoneError) throw new TRPCError({ code: "NOT_FOUND" });
          throw e;
        }
      },
    ),

  /**
   * Hard-delete an ENTIRE study (ADR-0083 data-lifecycle) — design, all
   * versions, responses, and participant files (R2). Irreversible; the
   * reversible option is `archive`. Guards mirror deleteResponses: writeProcedure
   * blocks viewers + all mutations during operator support access; only the
   * study author OR a workspace owner/admin may run it; typed-title confirm.
   * `deleteTemplates` opts in to also deleting saved templates derived from the
   * study (else TemplateExistsError → PRECONDITION_FAILED so the UI can ask).
   * Participant R2 objects are collected first, then best-effort deleted after
   * the DB transaction commits (researcher-uploaded stimuli are retained — they
   * may be shared across studies; see ADR-0083).
   */
  deleteStudy: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        confirmTitle: z.string(),
        deleteTemplates: z.boolean().default(false),
      }),
    )
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{ responses: number; externalReplications: number; templates: number; mediaDeleted: number }> => {
        const [study] = await db
          .select({ title: experiment.title, ownerId: experiment.ownerId })
          .from(experiment)
          .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
          .limit(1);
        if (!study) throw new TRPCError({ code: "NOT_FOUND" });

        const isPrivileged =
          ctx.role === "owner" || ctx.role === "admin" || study.ownerId === ctx.dbUser.id;
        if (!isPrivileged) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the study author or a workspace owner/admin can delete a study.",
          });
        }
        if (input.confirmTitle.trim() !== study.title.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Study title confirmation did not match." });
        }

        // Collect participant R2 keys BEFORE the delete (response_items + AI
        // payloads cascade away in the transaction).
        const mediaKeys = await collectStudyParticipantMediaKeys(input.studyId);

        let result;
        try {
          result = await deleteStudy(input.studyId, ctx.workspace.id, { deleteTemplates: input.deleteTemplates });
        } catch (e) {
          if (e instanceof TemplateExistsError) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `This study backs ${e.count} saved template${e.count === 1 ? "" : "s"}. Confirm deleting them too.`,
            });
          }
          if (e instanceof StudyGoneError) throw new TRPCError({ code: "NOT_FOUND" });
          throw e;
        }

        // Best-effort R2 cleanup after the DB commit — never fail the delete if a
        // blob delete errors (the DB rows are already gone; orphaned blobs are
        // unreachable). storage.delete is idempotent + no-op when unconfigured.
        let mediaDeleted = 0;
        if (mediaKeys.length > 0) {
          const settled = await Promise.allSettled(mediaKeys.map((k) => storage.delete(k)));
          mediaDeleted = settled.filter((s) => s.status === "fulfilled").length;
        }

        return { ...result, mediaDeleted };
      },
    ),

  /**
   * Results (results-stage.md): per-condition completion counts, per-question
   * summaries (likert mean + n), and per-response rows for CSV export. By default
   * POOLS all runnable versions (preregistered OR published) so a made-live v2
   * never silently hides v1's data (ADR-0044); `version` scopes to one. Each row
   * carries its versionNumber. Excludes preview unless asked. Aggregated
   * in-memory (V1 study sizes are small). Null only when the study has no
   * runnable version yet.
   */
  getResults: workspaceProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        includePreview: z.boolean().default(false),
        /** Scope to one runnable version; omit/null = pool ALL versions (ADR-0044). */
        version: z.number().int().positive().nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }): Promise<ResultsSummary | null> => {
      // All runnable versions (newest first), tenant-scoped. Pooling across them
      // is the default so a made-live v2 never silently hides v1's data (ADR-0044).
      const versions = await db
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
        .orderBy(desc(experimentVersion.versionNumber));
      if (!versions.length) return null;

      const latest = versions[0];
      const availableVersions = versions.map((v) => v.n);
      const verNumById = new Map(versions.map((v) => [v.id, v.n]));
      // Selected scope: a specific version (if it exists) or all pooled (null).
      const selected = input.version != null ? versions.find((v) => v.n === input.version) ?? null : null;
      const scopeVersions = selected ? [selected] : versions; // newest-first
      const scopeIds = scopeVersions.map((v) => v.id);

      // Conditions across the scoped versions; the per-condition aggregate merges
      // by slug (below), per-response rows resolve their own condition by id.
      const conditionRows = await db
        .select({ id: conditionTable.id, slug: conditionTable.slug, name: conditionTable.name, position: conditionTable.position, versionId: conditionTable.experimentVersionId })
        .from(conditionTable)
        .where(inArray(conditionTable.experimentVersionId, scopeIds))
        .orderBy(conditionTable.position);
      const condById = new Map(conditionRows.map((c) => [c.id, c]));

      const modes: ("run" | "preview")[] = input.includePreview ? ["run", "preview"] : ["run"];
      const completed = await db
        .select({
          id: responseTable.id,
          conditionId: responseTable.conditionId,
          externalPid: responseTable.externalPid,
          variantCell: responseTable.variantCell,
          startedAt: responseTable.startedAt,
          completedAt: responseTable.completedAt,
          experimentVersionId: responseTable.experimentVersionId,
        })
        .from(responseTable)
        .where(
          and(
            inArray(responseTable.experimentVersionId, scopeIds),
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
              emotionAnalysis: responseItem.emotionAnalysis,
              emotionStatus: responseItem.emotionStatus,
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
      // a stringified per-response value for the CSV. Block catalog spans the
      // scoped versions, deduped by instanceId NEWEST-first so the latest
      // version's prompt/config labels a merged question; a block only in an
      // older version still appears (its responses are never dropped).
      const seenInstance = new Set<string>();
      const blocks: ReturnType<typeof readBlocks> = [];
      for (const v of scopeVersions) {
        for (const b of readBlocks(v.snapshot)) {
          if (seenInstance.has(b.instanceId)) continue;
          seenInstance.add(b.instanceId);
          blocks.push(b);
        }
      }
      const questionBlocks = blocks.filter(
        (b) => getModuleDef(b.source, b.key, b.version)?.collectsResponse,
      );
      const kindOf = (key: string): "numeric" | "categorical" | "text" =>
        key === "multiple-choice" || key === "attention-check"
          ? "categorical"
          : key === "free-text" ||
              key === "ranking" ||
              key === "demographics" ||
              key === "accuracy-confidence" ||
              key === "share-intention" ||
              key === "constant-sum" ||
              key === "drill-down" ||
              key === "side-by-side" ||
              key === "timed-exposure" ||
              key === "forced-wait" ||
              key === "heat-map" ||
              key === "hot-spot" ||
              key === "graphic-slider" ||
              key === "signature" ||
              key === "file-upload" ||
              key === "video-record"
            ? "text"
            : "numeric"; // likert-7, slider

      // Per-respondent identity for spatial exploration (ADR-0041 amendment):
      // condition slug + external PID keyed by responseId. Derived from the
      // already-loaded `completed` rows — no extra query, no migration.
      // Factors per scoped version → label each response's variant cell (ADR-0058).
      const factorsByVersion = new Map(scopeVersions.map((v) => [v.id, readFactors(v.snapshot)]));
      const labelCell = (versionId: string, cell: Record<string, string> | null): string | null => {
        if (!cell || Object.keys(cell).length === 0) return null;
        return cellLabel(cell, factorsByVersion.get(versionId) ?? []);
      };
      const respMeta = new Map(
        completed.map((r) => [
          r.id,
          {
            conditionSlug: condById.get(r.conditionId)?.slug ?? "?",
            cell: labelCell(r.experimentVersionId, r.variantCell),
            externalPid: r.externalPid,
            versionNumber: verNumById.get(r.experimentVersionId) ?? latest.n,
          },
        ]),
      );

      const itemsByBlock = new Map<string, unknown[]>();
      // Parallel to itemsByBlock but KEEPS responseId — spatial per-respondent
      // views need it; the pooled map deliberately threw it away.
      const itemsByBlockResp = new Map<string, { responseId: string; answer: unknown }[]>();
      const answersByResponse = new Map<string, Record<string, string>>();
      for (const it of items) {
        const arr = itemsByBlock.get(it.blockInstanceId) ?? [];
        arr.push(it.answer);
        itemsByBlock.set(it.blockInstanceId, arr);
        const arrR = itemsByBlockResp.get(it.blockInstanceId) ?? [];
        arrR.push({ responseId: it.responseId, answer: it.answer });
        itemsByBlockResp.set(it.blockInstanceId, arrR);
        const row = answersByResponse.get(it.responseId) ?? {};
        row[it.blockInstanceId] = stringifyAnswer(it.answer);
        answersByResponse.set(it.responseId, row);
      }

      // Field-group blocks (ADR-0030) export one column PER FIELD (owner request):
      // sub-question keys are `${instanceId}.${fieldKey}`, row values come from
      // answer.values[fieldKey]. Number fields summarize numerically.
      type FieldSpec = { key?: unknown; label?: unknown; type?: unknown };
      const fieldSpecs = (b: (typeof questionBlocks)[number]): { key: string; label: string; type: string }[] =>
        Array.isArray(b.config?.fields)
          ? (b.config.fields as FieldSpec[])
              .filter((f) => typeof f.key === "string" && f.key)
              .map((f) => ({
                key: String(f.key),
                label: typeof f.label === "string" && f.label ? f.label : String(f.key),
                type: typeof f.type === "string" ? f.type : "text",
              }))
          : [];
      for (const b of questionBlocks) {
        if (b.key !== "field-group") continue;
        for (const it of items) {
          if (it.blockInstanceId !== b.instanceId) continue;
          const values = (it.answer as { values?: Record<string, unknown> } | null)?.values ?? {};
          const row = answersByResponse.get(it.responseId) ?? {};
          for (const f of fieldSpecs(b)) {
            row[`${b.instanceId}.${f.key}`] = values[f.key] == null ? "" : String(values[f.key]);
          }
          answersByResponse.set(it.responseId, row);
        }
      }

      // Social-post (ADR-0085): each engagement signal gets its OWN export cell
      // instead of one packed "liked=…; shared=…; comment=…" string (owner: split
      // into dedicated columns). `reaction:<inst>` (which of the 7 reactions),
      // `spshared:<inst>` (true/false), `spcomment:<inst>` (the comment text),
      // `spreplies:<inst>` (any replies, joined). `liked` is dropped — the reaction
      // column already captures whether/how they reacted. dataset.ts reads these
      // keys directly and omits the packed per-block column for social-post.
      for (const b of questionBlocks) {
        if (b.key !== "social-post") continue;
        for (const it of items) {
          if (it.blockInstanceId !== b.instanceId) continue;
          const a = (it.answer ?? {}) as { reaction?: unknown; shared?: unknown; comment?: unknown; replies?: unknown };
          const row = answersByResponse.get(it.responseId) ?? {};
          row[`reaction:${b.instanceId}`] = typeof a.reaction === "string" ? a.reaction : "";
          row[`spshared:${b.instanceId}`] = typeof a.shared === "boolean" ? String(a.shared) : "";
          row[`spcomment:${b.instanceId}`] = typeof a.comment === "string" ? a.comment : "";
          row[`spreplies:${b.instanceId}`] = Array.isArray(a.replies)
            ? (a.replies as unknown[]).map(String).filter((s) => s.trim() !== "").join(" | ")
            : "";
          answersByResponse.set(it.responseId, row);
        }
      }

      type QResult = ResultsSummary["questions"][number];
      const questions: QResult[] = questionBlocks.flatMap((b): QResult[] => {
        if (b.key === "field-group") {
          const blockTitle =
            (typeof b.title === "string" && b.title.trim()) ||
            (typeof b.config?.prompt === "string" && b.config.prompt) ||
            "Form";
          const answers = itemsByBlock.get(b.instanceId) ?? [];
          return fieldSpecs(b).map((f) => {
            const raw = answers.map((a) => (a as { values?: Record<string, unknown> } | null)?.values?.[f.key]);
            if (f.type === "number") {
              const vals = raw.map(Number).filter((v) => Number.isFinite(v));
              return {
                instanceId: `${b.instanceId}.${f.key}`,
                prompt: `${blockTitle} — ${f.label}`,
                moduleKey: "field-group",
                n: vals.length,
                kind: "numeric" as const,
                mean: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null,
                optionCounts: [],
              };
            }
            const n = raw.filter((v) => v != null && String(v).trim() !== "").length;
            return {
              instanceId: `${b.instanceId}.${f.key}`,
              prompt: `${blockTitle} — ${f.label}`,
              moduleKey: "field-group",
              n,
              kind: "text" as const,
              mean: null,
              optionCounts: [],
            };
          });
        }
        return [((b): QResult => {
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
        // Spatial blocks (ADR-0041 + amendment): pooled aggregate for the inline
        // overlay + per-respondent rows (responseId → condition/PID) for Explore.
        const withResp = itemsByBlockResp.get(b.instanceId) ?? [];
        if (b.key === "heat-map") {
          const imageUrl = typeof b.config?.imageUrl === "string" ? b.config.imageUrl : "";
          const responses = withResp.map(({ responseId, answer }) => {
            const m = respMeta.get(responseId);
            const pts = (answer as { points?: unknown[] })?.points;
            const points = Array.isArray(pts)
              ? pts
                  .map((pt) => pt as { x?: unknown; y?: unknown })
                  .filter((pt) => typeof pt.x === "number" && typeof pt.y === "number")
                  .map((pt) => ({ x: pt.x as number, y: pt.y as number }))
              : [];
            return { responseId, conditionSlug: m?.conditionSlug ?? "?", externalPid: m?.externalPid ?? null, versionNumber: m?.versionNumber, points };
          });
          const points = responses.flatMap((r) => r.points);
          const responders = responses.filter((r) => r.points.length > 0).length;
          return { instanceId: b.instanceId, prompt, moduleKey: b.key, n: responders, kind, mean: null, optionCounts: [], spatial: { kind: "heat-map", imageUrl, points, responses } };
        }
        if (b.key === "hot-spot") {
          const imageUrl = typeof b.config?.imageUrl === "string" ? b.config.imageUrl : "";
          const regionDefs = (Array.isArray(b.config?.regions) ? b.config!.regions : []) as { key: string; label: string; x: number; y: number; w: number; h: number }[];
          const counts = new Map<string, number>();
          let responders = 0;
          const responses = withResp.map(({ responseId, answer }) => {
            const m = respMeta.get(responseId);
            const sel = (answer as { selected?: unknown[] })?.selected;
            const regionKeys = Array.isArray(sel) ? sel.map(String) : [];
            if (regionKeys.length) {
              responders++;
              for (const k of regionKeys) counts.set(k, (counts.get(k) ?? 0) + 1);
            }
            return { responseId, conditionSlug: m?.conditionSlug ?? "?", externalPid: m?.externalPid ?? null, versionNumber: m?.versionNumber, regionKeys };
          });
          const regions = regionDefs.map((r) => ({ ...r, count: counts.get(r.key) ?? 0 }));
          return { instanceId: b.instanceId, prompt, moduleKey: b.key, n: responders, kind, mean: null, optionCounts: [], spatial: { kind: "hot-spot", imageUrl, regions, responses } };
        }
        if (b.key === "graphic-slider") {
          const imageUrl = typeof b.config?.imageUrl === "string" ? b.config.imageUrl : "";
          const responses = withResp.map(({ responseId, answer }) => {
            const m = respMeta.get(responseId);
            const v = (answer as { value?: unknown })?.value;
            return { responseId, conditionSlug: m?.conditionSlug ?? "?", externalPid: m?.externalPid ?? null, versionNumber: m?.versionNumber, value: typeof v === "number" ? v : undefined };
          });
          const valued = responses.filter((r) => typeof r.value === "number");
          // Synthesized pooled strip so the inline overlay shows the spread of
          // marker positions along the track (y fixed mid-height).
          const points = valued.map((r) => ({ x: r.value as number, y: 0.5 }));
          return { instanceId: b.instanceId, prompt, moduleKey: b.key, n: valued.length, kind, mean: null, optionCounts: [], spatial: { kind: "graphic-slider", imageUrl, points, responses } };
        }
        if (b.key === "signature") {
          // Per-respondent captured PNG keys (resp/, served via the now-gated
          // /api/media). No stimulus image; the viewer renders each signature.
          const responses = withResp
            .map(({ responseId, answer }) => {
              const m = respMeta.get(responseId);
              const r2Key = typeof (answer as { r2Key?: unknown })?.r2Key === "string" ? ((answer as { r2Key: string }).r2Key) : "";
              return r2Key
                ? { responseId, conditionSlug: m?.conditionSlug ?? "?", externalPid: m?.externalPid ?? null, versionNumber: m?.versionNumber, r2Key }
                : null;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);
          return { instanceId: b.instanceId, prompt, moduleKey: b.key, n: responses.length, kind, mean: null, optionCounts: [], spatial: { kind: "signature", imageUrl: "", responses } };
        }
        // text (free-text / ranking / demographics) — count any non-empty answer
        const n = answers.filter((a) => stringifyAnswer(a).trim().length > 0).length;
        return { instanceId: b.instanceId, prompt, moduleKey: b.key, n, kind, mean: null, optionCounts: [] };
        })(b)];
      });

      // V2.1 (ADR-0066 H3a): attach a per-block emotion aggregate to any question
      // whose block has emotion analysis enabled — mean of the per-response
      // emotion vectors (top-7) + ok/failed/pending counts.
      const emotionEnabled = new Map(
        blocks
          .filter((b) => (b.config as { emotionAnalysis?: { enabled?: boolean } } | undefined)?.emotionAnalysis?.enabled)
          .map((b) => [b.instanceId, true as const]),
      );
      if (emotionEnabled.size) {
        for (const q of questions) {
          if (!emotionEnabled.has(q.instanceId)) continue;
          const rows = items.filter((it) => it.blockInstanceId === q.instanceId);
          const sums = new Map<string, number>();
          const names = new Set<string>();
          let ok = 0;
          let failed = 0;
          let pending = 0;
          let error: string | undefined; // a sample failure reason to show in Results
          for (const r of rows) {
            // Per-respondent emotion lands in the export matrix via answersByResponse:
            // a `emostatus:<inst>` status cell + one `emo:<inst>:<name>` score cell per
            // emotion. cell() resolves these through row.answers (ADR-0066 H3a export).
            const row = answersByResponse.get(r.responseId) ?? {};
            if (r.emotionStatus === "ok") {
              ok++;
              const emo = (r.emotionAnalysis as { emotions?: Record<string, number> } | null)?.emotions ?? {};
              for (const [name, score] of Object.entries(emo)) {
                if (typeof score === "number") {
                  sums.set(name, (sums.get(name) ?? 0) + score);
                  names.add(name);
                  row[`emo:${q.instanceId}:${name}`] = score.toFixed(4);
                }
              }
            } else if (r.emotionStatus === "failed") {
              failed++;
              const e = (r.emotionAnalysis as { error?: unknown } | null)?.error;
              if (!error && typeof e === "string" && e) error = e;
            } else if (r.emotionStatus === "pending" || r.emotionStatus == null) pending++;
            row[`emostatus:${q.instanceId}`] = r.emotionStatus ?? "pending";
            answersByResponse.set(r.responseId, row);
          }
          q.emotion = {
            n: ok,
            failed,
            pending,
            names: [...names].sort(),
            top: [...sums.entries()]
              .map(([name, total]) => ({ name, score: total / Math.max(1, ok) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 7),
            ...(error ? { error } : {}),
          };
        }
      }

      // Per-condition aggregate: merge by slug across scoped versions (the newest
      // version's name/position wins). Every condition appears, even at 0.
      const condAgg = new Map<string, { slug: string; name: string; completed: number; position: number; verN: number }>();
      for (const c of conditionRows) {
        const verN = verNumById.get(c.versionId) ?? 0;
        const add = completedByCondition.get(c.id) ?? 0;
        const cur = condAgg.get(c.slug);
        if (!cur) {
          condAgg.set(c.slug, { slug: c.slug, name: c.name, completed: add, position: c.position, verN });
        } else {
          cur.completed += add;
          if (verN > cur.verN) {
            cur.name = c.name;
            cur.position = c.position;
            cur.verN = verN;
          }
        }
      }
      const conditions = [...condAgg.values()]
        .sort((a, b) => a.position - b.position)
        .map(({ slug, name, completed }) => ({ slug, name, completed }));

      // Per-combination aggregate (ADR-0058): count completed responses by their
      // factorial variant-combination label (e.g. "low · gain"). Empty when the
      // study declares no factors — so the Results UI only shows it for factorial
      // designs. Labelled off each response's run-version factors.
      const combAgg = new Map<string, number>();
      for (const r of completed) {
        const label = labelCell(r.experimentVersionId, r.variantCell);
        if (label) combAgg.set(label, (combAgg.get(label) ?? 0) + 1);
      }
      const combinations = [...combAgg.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, completed: count }));

      // ADR-0082: during operator "View as" support access, never expose raw
      // participant responses. Aggregate/structural data (version list, counts,
      // per-condition + per-combination tallies, question means/option-counts/
      // emotion aggregates) stays visible; only row-level participant data is
      // withheld — the per-response `rows` (PID + raw answers) and the
      // per-respondent spatial `responses` rows (incl. signature R2 keys).
      if (ctx.isImpersonating) {
        const redactedQuestions = questions.map((q) =>
          q.spatial ? { ...q, spatial: { ...q.spatial, responses: undefined } } : q,
        );
        return {
          versionNumber: latest.n,
          selectedVersion: selected ? selected.n : null,
          availableVersions,
          totalCompleted: completed.length,
          includesPreview: input.includePreview,
          participantDataHidden: true,
          conditions,
          combinations,
          questions: redactedQuestions,
          rows: [],
        };
      }

      return {
        versionNumber: latest.n,
        selectedVersion: selected ? selected.n : null,
        availableVersions,
        totalCompleted: completed.length,
        includesPreview: input.includePreview,
        conditions,
        combinations,
        questions,
        rows: completed.map((r) => ({
          responseId: r.id,
          conditionSlug: condById.get(r.conditionId)?.slug ?? "?",
          cell: labelCell(r.experimentVersionId, r.variantCell),
          externalPid: r.externalPid,
          versionNumber: verNumById.get(r.experimentVersionId) ?? latest.n,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          answers: answersByResponse.get(r.id) ?? {},
        })),
      };
    }),

  /**
   * Re-run emotion analysis (ADR-0066 H3a amendment) for a study's NOT-yet-ok
   * emotion items — clears rows stuck `pending`/`failed` (e.g. from a transient
   * vendor error or a pre-fix timeout). Resets each to `pending` and re-enqueues
   * the `hume.analyze` job (idempotent: a re-run on an `ok` item is a no-op).
   * Tenant-scoped; only emotion-enabled blocks of the study are touched.
   */
  reanalyzeEmotion: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ requeued: number }> => {
      // ALL versions of the study (tenant-scoped) — not just runnable: a stuck
      // emotion item should be re-runnable whatever version its response is on.
      const versions = await db
        .select({ id: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(experiment.tenantId, ctx.workspace.id)));
      if (!versions.length) return { requeued: 0 };

      // Emotion-enabled block instanceIds per version (config drives it, not module).
      const emotionByVersion = new Map<string, Set<string>>();
      for (const v of versions) {
        const set = new Set<string>();
        for (const b of readBlocks(v.snapshot)) {
          if ((b.config as { emotionAnalysis?: { enabled?: boolean } } | undefined)?.emotionAnalysis?.enabled) set.add(b.instanceId);
        }
        if (set.size) emotionByVersion.set(v.id, set);
      }
      if (!emotionByVersion.size) return { requeued: 0 };

      const responses = await db
        .select({ id: responseTable.id, versionId: responseTable.experimentVersionId })
        .from(responseTable)
        .where(inArray(responseTable.experimentVersionId, [...emotionByVersion.keys()]));
      if (!responses.length) return { requeued: 0 };
      const versionByResponse = new Map(responses.map((r) => [r.id, r.versionId]));

      const items = await db
        .select({ responseId: responseItem.responseId, blockInstanceId: responseItem.blockInstanceId, emotionStatus: responseItem.emotionStatus })
        .from(responseItem)
        .where(inArray(responseItem.responseId, responses.map((r) => r.id)));

      let requeued = 0;
      for (const it of items) {
        if (it.emotionStatus === "ok") continue; // already analyzed
        const vId = versionByResponse.get(it.responseId);
        if (!vId || !emotionByVersion.get(vId)?.has(it.blockInstanceId)) continue; // not an emotion block
        await db
          .update(responseItem)
          .set({ emotionStatus: "pending" })
          .where(and(eq(responseItem.responseId, it.responseId), eq(responseItem.blockInstanceId, it.blockInstanceId)));
        await jobs.enqueue("hume.analyze", { responseId: it.responseId, blockInstanceId: it.blockInstanceId });
        requeued++;
      }
      return { requeued };
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
        title: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      // A new study starts blank — no blocks. (Starting from a curated study is
      // now Templates: studies are cloned via templates.useTemplate, ADR-0063.)
      const blocks: BlockInstance[] = [];
      const title = input.title?.trim() || "Untitled study";
      const created = await db.transaction(async (tx) => {
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
      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        event: "study_created",
        sensitivity: "researcher_behavior",
        properties: { kind: input.kind },
      });
      return created;
    }),

  /**
   * Replicate (fork) a study into the caller's active workspace — or a chosen
   * one when replicating from the global Browse (ADR-0002 + ADR-0018 + ADR-0055).
   * Reads the source cross-tenant via the permission-gated loader
   * (public, or caller is a member), copies its latest runnable (else tip)
   * snapshot — instanceIds PRESERVED so the Replications diff aligns by
   * identity — plus its conditions, pins lineage to that version, and emits the
   * `fork` event (notifies the source author + their Followers). The new study
   * is private by default. No participant data is ever copied (ADR-0002 §6).
   */
  fork: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        /** Declared replication kind (ADR-0039) — optional; skippable dialog. */
        intent: z.enum(["direct", "conceptual", "extension"]).optional(),
        /** Where it lands (ADR-0055 global Browse). Defaults to the active workspace. */
        targetWorkspaceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const source = await loadForkSource(input.studyId, ctx.dbUser.id);
      const tenantId = await resolveTargetTenant(ctx.dbUser.id, ctx.workspace.id, input.targetWorkspaceId);
      // Cross-workspace replication is for FINISHED studies (ADR-0054): you
      // replicate a *finding*, not a plan. Same-workspace duplication (forking
      // into the source's own workspace) stays open — that's iteration, not a
      // scientific replication. Borrowing an unfinished study's design uses
      // `useAsTemplate`, which shares loadForkSource but skips this gate.
      if (source.experiment.tenantId !== tenantId && !source.experiment.finishedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only a finished study can be replicated. Use “Use as template” to start from its design instead.",
        });
      }
      const blocks = readBlocks(source.version.definitionSnapshot);
      // A replication carries the WHOLE protocol: groups (minus moduleId — a
      // workspace-local custom-module link) + the Overview document (ADR-0028/0029).
      const groups = readGroups(source.version.definitionSnapshot).map(({ moduleId: _drop, ...g }) => g);
      const overview = input.intent
        ? injectReplicationRecipe(readOverview(source.version.definitionSnapshot), source.experiment.title, input.intent)
        : readOverview(source.version.definitionSnapshot);
      const theme = readTheme(source.version.definitionSnapshot);
      const consent = readConsent(source.version.definitionSnapshot);
      const sourceConditions = await conditionsForVersion(source.version.id);

      const newId = await db.transaction(async (tx) => {
        const [exp] = await tx
          .insert(experiment)
          .values({
            tenantId,
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
      await trackEvent({
        userId: ctx.dbUser.id,
        workspaceId: ctx.workspace.id,
        event: "study_forked",
        sensitivity: "researcher_behavior",
        properties: { sourceStudyId: source.experiment.id },
      });
      return { id: newId };
    }),

  /** Set a study's forkability (ADR-0002/0018) — owner-workspace only. */
  /** Archive a study (focused-mode ⋯ menu, IA v0.4) — sets archived_at; the
   *  Studies "Archived" filter is the only place it then appears. Nothing is
   *  deleted; unarchive ships with the Wave 6 bulk-operations slice. */
  archive: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .update(experiment)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)),
        )
        .returning({ id: experiment.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),

  /** Publish/unpublish a saved module to the cross-workspace Community library
   *  (ADR-0038 — the gists analogue). Own workspace only. */
  setModulePublic: writeProcedure
    .input(z.object({ id: z.string().uuid(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .update(customModule)
        .set({ isPublic: input.isPublic, updatedAt: new Date() })
        .where(and(eq(customModule.id, input.id), eq(customModule.tenantId, ctx.workspace.id)))
        .returning({ id: customModule.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),

  /** Community modules: published by ANY workspace (ADR-0038 — the third
   *  sanctioned cross-tenant read: public definitions only, author-attributed). */
  listCommunityModules: workspaceProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: customModule.id,
        name: customModule.name,
        definition: customModule.definition,
        authorName: user.displayName,
        tenantId: customModule.tenantId,
      })
      .from(customModule)
      .innerJoin(user, eq(customModule.createdBy, user.id))
      .where(eq(customModule.isPublic, true))
      .orderBy(desc(customModule.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      definition: r.definition as CustomModuleDefinition,
      blockCount: (r.definition as CustomModuleDefinition).blocks?.length ?? 0,
      authorName: r.authorName ?? "",
      mine: r.tenantId === ctx.workspace.id,
    }));
  }),

  /** Replication mode (ADR-0039): banner + per-block divergence badges vs the
   *  version pinned at fork time. Null for non-replications. */
  replicationStatus: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const pinnedId = tip.experiment.forkOfVersionId;
      if (!pinnedId) return null;
      const [pinned] = await db
        .select({ snapshot: experimentVersion.definitionSnapshot, experimentId: experimentVersion.experimentId })
        .from(experimentVersion)
        .where(eq(experimentVersion.id, pinnedId))
        .limit(1);
      if (!pinned) return { sourceTitle: null, sourceAuthor: null, sourceStudyId: null as string | null, intent: readOverview(tip.version.definitionSnapshot).replicationIntent ?? null, badges: {} as Record<string, DivergenceStatus>, removedCount: 0, divergedCount: 0, sourceUnavailable: true };
      const [src] = await db
        .select({ id: experiment.id, title: experiment.title, ownerId: experiment.ownerId, forkableBy: experiment.forkableBy })
        .from(experiment)
        .where(eq(experiment.id, pinned.experimentId))
        .limit(1);
      const [author] = src?.ownerId
        ? await db.select({ name: user.displayName }).from(user).where(eq(user.id, src.ownerId)).limit(1)
        : [];
      const d = divergenceAgainstPinned(tip.version.definitionSnapshot, pinned.snapshot);
      return {
        sourceTitle: src?.title ?? null,
        sourceAuthor: author?.name ?? null,
        sourceStudyId: src?.forkableBy === "public" ? src.id : null,
        intent: readOverview(tip.version.definitionSnapshot).replicationIntent ?? null,
        badges: d.badges,
        removedCount: d.removedCount,
        divergedCount: d.diverged.length + d.removedCount,
        sourceUnavailable: false,
      };
    }),

  /** The pinned original of one block (Show-original toggle, ADR-0039). The
   *  pinned version is the fork's own lineage pointer — the ADR-0018 read. */
  upstreamBlock: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      if (!tip.experiment.forkOfVersionId) return null;
      const [pinned] = await db
        .select({ snapshot: experimentVersion.definitionSnapshot })
        .from(experimentVersion)
        .where(eq(experimentVersion.id, tip.experiment.forkOfVersionId))
        .limit(1);
      if (!pinned) return null;
      const b = readBlocks(pinned.snapshot).find((x) => x.instanceId === input.instanceId);
      if (!b) return null;
      return { title: b.title ?? null, config: b.config };
    }),

  /** Save why a block differs from the original (ADR-0039 rationale). */
  setBlockDivergenceNote: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string(), note: z.string().max(1000) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const blocks = readBlocks(tip.version.definitionSnapshot).map((b) =>
        b.instanceId === input.instanceId
          ? input.note.trim()
            ? { ...b, divergenceNote: input.note.trim() }
            : (({ divergenceNote: _d, ...rest }) => rest)(b)
          : b,
      );
      await db
        .update(experimentVersion)
        .set({
          definitionSnapshot: {
            ...(tip.version.definitionSnapshot as Record<string, unknown>),
            blocks,
          },
        })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return { ok: true };
    }),

  /** Change the declared replication kind (banner chip, ADR-0039). */
  setReplicationIntent: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), intent: z.enum(["direct", "conceptual", "extension"]) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const tip = await loadWorkingTip(input.studyId, ctx.workspace.id);
      const overview = { ...readOverview(tip.version.definitionSnapshot), replicationIntent: input.intent };
      await db
        .update(experimentVersion)
        .set({ definitionSnapshot: { ...(tip.version.definitionSnapshot as Record<string, unknown>), overview } })
        .where(eq(experimentVersion.id, tip.version.id));
      await db.update(experiment).set({ updatedAt: new Date() }).where(eq(experiment.id, input.studyId));
      return { ok: true };
    }),

  /** Per-block provenance (ADR-0038 — the blame analogue): which conscious
   *  save introduced/last-touched this block, and whether it changed since
   *  the latest preregistration. Derived on read (ADR-0033 philosophy). */
  blockProvenance: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          snapshot: experimentVersion.definitionSnapshot,
          createdAt: experimentVersion.createdAt,
        })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .orderBy(experimentVersion.createdAt);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });

      const label = (r: (typeof rows)[number]) =>
        r.kind === "preregistered" ? `Preregistration v${r.versionNumber}` : r.kind === "published" ? `Published v${r.versionNumber}` : `v${r.versionNumber}`;
      const stable = (snapshot: unknown): string | null => {
        const b = readBlocks(snapshot).find((x) => x.instanceId === input.instanceId);
        return b ? JSON.stringify({ ...b, instanceId: "" }) : null;
      };

      const frozen = rows.filter((r) => r.kind !== "autosave");
      const tip = rows.find((r) => r.kind === "autosave");
      let createdIn: string | null = null;
      let lastChangedIn: string | null = null;
      let prev: string | null = null;
      for (const r of frozen) {
        const cur = stable(r.snapshot);
        if (cur !== null && prev === null) createdIn = label(r);
        if (cur !== null && cur !== prev) lastChangedIn = label(r);
        prev = cur;
      }
      const tipState = tip ? stable(tip.snapshot) : null;
      const lastFrozenState = prev;
      const editedSinceLastSave = tipState !== null && lastFrozenState !== null && tipState !== lastFrozenState;

      const lastPrereg = [...frozen].reverse().find((r) => r.kind === "preregistered");
      const sincePreregistration: "unchanged" | "changed" | null = lastPrereg
        ? stable(lastPrereg.snapshot) === tipState
          ? "unchanged"
          : "changed"
        : null;

      return { createdIn, lastChangedIn, editedSinceLastSave, sincePreregistration };
    }),

  /** Per-block history (ADR-0038 companion to blockProvenance): what each
   *  conscious save changed about THIS block, newest first — block-level
   *  release notes derived from the frozen snapshots. */
  blockHistory: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid(), instanceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          kind: experimentVersion.kind,
          versionNumber: experimentVersion.versionNumber,
          snapshot: experimentVersion.definitionSnapshot,
          createdAt: experimentVersion.createdAt,
        })
        .from(experimentVersion)
        .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .orderBy(experimentVersion.createdAt);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });

      const label = (r: (typeof rows)[number]) =>
        r.kind === "preregistered"
          ? `Preregistration v${r.versionNumber}`
          : r.kind === "published"
            ? `Published v${r.versionNumber}`
            : `v${r.versionNumber}`;
      const find = (snapshot: unknown) =>
        readBlocks(snapshot).find((x) => x.instanceId === input.instanceId) ?? null;

      type Entry = { label: string; date: string; kind: "introduced" | "changed" | "removed"; changes: string[] };
      const entries: Entry[] = [];
      let prev: BlockInstance | null = null;
      for (const r of rows.filter((x) => x.kind !== "autosave")) {
        const cur = find(r.snapshot);
        if (cur && !prev) {
          entries.push({ label: label(r), date: r.createdAt.toISOString(), kind: "introduced", changes: [] });
        } else if (cur && prev) {
          const changes = summarizeConfigDiff(prev, cur);
          const titleChanged = (prev.title ?? "") !== (cur.title ?? "");
          if (changes.length || titleChanged) {
            entries.push({
              label: label(r),
              date: r.createdAt.toISOString(),
              kind: "changed",
              changes: [...(titleChanged ? [`~ Title: ${prev.title || "(module name)"} → ${cur.title || "(module name)"}`] : []), ...changes],
            });
          }
        } else if (!cur && prev) {
          entries.push({ label: label(r), date: r.createdAt.toISOString(), kind: "removed", changes: [] });
        }
        prev = cur;
      }
      const tip = rows.find((x) => x.kind === "autosave");
      if (tip) {
        const cur = find(tip.snapshot);
        if (cur && !prev) {
          entries.push({ label: "Working copy", date: tip.createdAt.toISOString(), kind: "introduced", changes: ["Not in any saved version yet"] });
        } else if (cur && prev) {
          const changes = summarizeConfigDiff(prev, cur);
          if (changes.length) {
            entries.push({ label: "Working copy (unsaved)", date: tip.createdAt.toISOString(), kind: "changed", changes });
          }
        }
      }
      return entries.reverse();
    }),

  /** Copy a public study as a fresh starting point — NO lineage, fresh block
   *  identities (ADR-0038 — the template-repo analogue; vs Replicate/ADR-0018
   *  which preserves ids for diffing). */
  useAsTemplate: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), targetWorkspaceId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      const source = await loadForkSource(input.studyId, ctx.dbUser.id); // same public/member gate as fork
      const tenantId = await resolveTargetTenant(ctx.dbUser.id, ctx.workspace.id, input.targetWorkspaceId);
      const blocks = readBlocks(source.version.definitionSnapshot);
      const groups = readGroups(source.version.definitionSnapshot).map(({ moduleId: _m, ...g }) => g);
      const overview = readOverview(source.version.definitionSnapshot);
      const theme = readTheme(source.version.definitionSnapshot);
      const consent = readConsent(source.version.definitionSnapshot);

      // Fresh identities: new instanceIds + group ids; remap groupId and
      // answer-rule references; strip arm gating (conditions are copied fresh
      // but slugs are study-local — the researcher re-wires what they keep).
      const idMap = new Map(blocks.map((b) => [b.instanceId, ulid()]));
      const groupMap = new Map(groups.map((g) => [g.id, ulid()]));
      const freshBlocks = blocks.map((b) => ({
        ...b,
        instanceId: idMap.get(b.instanceId)!,
        ...(b.groupId ? { groupId: groupMap.get(b.groupId) ?? b.groupId } : {}),
        ...(b.showIf
          ? {
              showIf: {
                ...b.showIf,
                clauses: b.showIf.clauses.map((c) => ({
                  ...c,
                  fromInstanceId: idMap.get(c.fromInstanceId) ?? c.fromInstanceId,
                })),
              },
            }
          : {}),
      }));
      const freshGroups = groups.map((g) => ({ ...g, id: groupMap.get(g.id)! }));
      const sourceConditions = await conditionsForVersion(source.version.id);

      const newId = await db.transaction(async (tx) => {
        const [exp] = await tx
          .insert(experiment)
          .values({
            tenantId,
            ownerId: ctx.dbUser.id,
            title: `${source.experiment.title} (from template)`,
            tags: source.experiment.tags ?? null,
          })
          .returning();
        const [ver] = await tx
          .insert(experimentVersion)
          .values({
            experimentId: exp.id,
            versionNumber: 0,
            kind: "autosave",
            definitionSnapshot: { blocks: freshBlocks, groups: freshGroups, overview, theme, consent },
            moduleVersionLocks: locksFromBlocks(freshBlocks),
            createdBy: ctx.dbUser.id,
          })
          .returning();
        await tx.update(experiment).set({ currentVersionId: ver.id }).where(eq(experiment.id, exp.id));
        if (sourceConditions.length) {
          await tx.insert(conditionTable).values(
            sourceConditions.map((c) => ({
              id: ulid(),
              experimentVersionId: ver.id,
              slug: c.slug,
              name: c.name,
              allocationWeight: String(c.allocationWeight),
              position: c.position,
            })),
          );
        }
        return exp.id;
      });
      return { id: newId };
    }),

  /** Reverse of archive (ADR-0037 companion — the reversible path). */
  unarchive: writeProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const [row] = await db
        .update(experiment)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .returning({ id: experiment.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),


  setForkable: writeProcedure
    .input(
      z.object({
        studyId: z.string().uuid(),
        forkableBy: z.enum(["public", "link-only", "private"]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ forkableBy: string }> => {
      // Offering a study for replication (public/link-only) requires a FROZEN
      // version — you can't expose a moving draft for others to replicate
      // (ADR-0018 amendment 2026-06-14). Setting back to private is always fine.
      if (input.forkableBy !== "private") {
        const [frozen] = await db
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
          .limit(1);
        if (!frozen) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Preregister or publish this study before opening it for replication.",
          });
        }
      }
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

  /**
   * Finished-state for the Results-stage CTA (ADR-0054). Reports whether the
   * study is finished + whether it CAN be finished (no open recruitment +
   * >=1 completed response — "there's something to report").
   */
  finishedState: workspaceProcedure
    .input(z.object({ studyId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<{ finishedAt: string | null; completedResponses: number; hasOpenRecruitment: boolean }> => {
      const [exp] = await db
        .select({ finishedAt: experiment.finishedAt })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });
      // Exclude Preview artifacts (recruitment session on the draft + mode:"preview"
      // responses) so a previewed-but-never-run study isn't shown as recruiting/with data.
      const [open] = await db
        .select({ id: recruitmentSession.id })
        .from(recruitmentSession)
        .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS), eq(recruitmentSession.status, "open")))
        .limit(1);
      const [{ n }] = await db
        .select({ n: count() })
        .from(responseTable)
        .innerJoin(experimentVersion, eq(responseTable.experimentVersionId, experimentVersion.id))
        .where(and(eq(experimentVersion.experimentId, input.studyId), eq(responseTable.status, "completed"), eq(responseTable.mode, "run")));
      return { finishedAt: exp.finishedAt?.toISOString() ?? null, completedResponses: Number(n), hasOpenRecruitment: !!open };
    }),

  /**
   * Mark a study Finished / reopen it (ADR-0054). Finishing requires recruitment
   * closed + >=1 completed response; it gates Replicate + the Study Record.
   * Reversible: reopen clears the state. writeProcedure.
   */
  setFinished: writeProcedure
    .input(z.object({ studyId: z.string().uuid(), finished: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<{ finishedAt: string | null }> => {
      const [exp] = await db
        .select({ id: experiment.id, title: experiment.title, ownerId: experiment.ownerId, tags: experiment.tags })
        .from(experiment)
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .limit(1);
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Study not found." });

      if (input.finished) {
        const [open] = await db
          .select({ id: recruitmentSession.id })
          .from(recruitmentSession)
          .innerJoin(experimentVersion, eq(recruitmentSession.experimentVersionId, experimentVersion.id))
          .where(and(eq(experimentVersion.experimentId, input.studyId), inArray(experimentVersion.kind, RUNNABLE_KINDS), eq(recruitmentSession.status, "open")))
          .limit(1);
        if (open) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stop recruitment before marking the study finished." });
        }
        // Real (mode:"run") responses only — a Preview response must not satisfy the
        // "collect at least one response" gate.
        const [{ n }] = await db
          .select({ n: count() })
          .from(responseTable)
          .innerJoin(experimentVersion, eq(responseTable.experimentVersionId, experimentVersion.id))
          .where(and(eq(experimentVersion.experimentId, input.studyId), eq(responseTable.status, "completed"), eq(responseTable.mode, "run")));
        if (Number(n) === 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Collect at least one completed response before marking the study finished." });
        }
      }

      const [row] = await db
        .update(experiment)
        .set(
          input.finished
            ? { finishedAt: new Date(), finishedByUserId: ctx.dbUser.id, updatedAt: new Date() }
            : { finishedAt: null, finishedByUserId: null, updatedAt: new Date() },
        )
        .where(and(eq(experiment.id, input.studyId), eq(experiment.tenantId, ctx.workspace.id)))
        .returning({ finishedAt: experiment.finishedAt });

      // Follows-only activity event when a study becomes finished (ADR-0054/0056).
      if (input.finished && row?.finishedAt) {
        await emit({
          type: "study_finished",
          actorUserId: ctx.dbUser.id,
          workspaceId: ctx.workspace.id,
          targetType: "study",
          targetId: input.studyId,
          related: { authorUserId: exp.ownerId, studyId: input.studyId, tagSlugs: exp.tags ?? undefined },
          data: { studyTitle: exp.title },
        });
      }
      return { finishedAt: row?.finishedAt?.toISOString() ?? null };
    }),
});
