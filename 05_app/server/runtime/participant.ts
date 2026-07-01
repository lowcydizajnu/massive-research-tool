import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import { readConsent, type StudyConsent } from "@/server/modules/consent";
import {
  condition as conditionTable,
  experiment,
  experimentVersion,
  recruitmentSession,
  response,
  responseItem,
} from "@/server/db/schema";
import { conditionWithSources, evaluateCondition, normalizeCondition } from "@/lib/whiteboard/conditions";
import { deriveScreens, type Screen } from "@/lib/whiteboard/screens";
import { readBlocks, readGroups, readFactors, readVariantBindings, type BlockInstance } from "@/server/modules/blocks";
import { jobs } from "@/server/adapters/jobs";
import { pickCell, resolveConfigForCell, type VariantBinding, type VariantCell } from "@/lib/variants/factorial";
import { readTheme, type StudyTheme } from "@/lib/themes/themes";
import { readBlockCopy, resolveUiCopy, type BlockCopyKey, type UiCopyKey } from "@/lib/take/ui-copy";
import { fillPanelPlaceholders, resolvePanelIntegration, type PanelIntegration } from "@/lib/take/panel-integration";
import { getModuleDef } from "@/server/modules/registry";

/**
 * Participant runtime backend (ADR-0013/0014). Plain server functions (no tRPC,
 * no Clerk) — the `/take/*` routes are public and call these from server
 * components + server actions. All correctness-critical logic lives here:
 * weighted-random condition assignment, condition-gated block visibility,
 * durable per-answer writes, resume, and completion.
 */

export type ResponseMode = "run" | "preview";

/** A block plus its optional condition-visibility rule (ADR-0014). */
export type RuntimeBlock = BlockInstance & {
  visibility?: { showIfCondition?: string[] };
};

/** Visible if it has no condition rule, or the rule includes this condition. */
function isVisible(block: RuntimeBlock, conditionSlug: string): boolean {
  const gate = block.visibility?.showIfCondition;
  return !gate || gate.length === 0 || gate.includes(conditionSlug);
}

/** The blocks a participant in `conditionSlug` actually sees, in order (arm only). */
/** Flow blocks (ADR-0042) are not participant screens — they act at start
 *  (embedded-data) or on completion (end-redirect). */
const NON_SCREEN_KEYS = new Set(["embedded-data", "end-redirect"]);

/** Apply the participant's assigned variant cell to a block's config (ADR-0058).
 *  No-op when the study has no variant bindings or the block has none. */
function applyCell<T extends BlockInstance>(block: T, cell: VariantCell, bindings: VariantBinding[]): T {
  if (bindings.length === 0) return block;
  const cfg = resolveConfigForCell(block.instanceId, block.config, cell, bindings);
  return cfg === block.config ? block : { ...block, config: cfg };
}

export function visibleBlocks(snapshot: unknown, conditionSlug: string): RuntimeBlock[] {
  return (readBlocks(snapshot) as RuntimeBlock[]).filter((b) => isVisible(b, conditionSlug) && !NON_SCREEN_KEYS.has(b.key));
}

/**
 * The comparable string value(s) of a recorded answer, normalized across module
 * shapes (likert/slider `{value}`, free-text `{text}`, multi-select `{selected:[]}`
 * or a bare array, scalars). Used for branch-rule equality (ADR-0021).
 */
export function answerValues(answer: unknown): string[] {
  if (answer == null) return [];
  if (Array.isArray(answer)) return answer.map((a) => String(a));
  if (typeof answer === "object") {
    const o = answer as Record<string, unknown>;
    const out: string[] = [];
    for (const k of ["value", "text", "selected", "choice", "rank", "options"]) {
      const v = o[k];
      if (Array.isArray(v)) out.push(...v.map((x) => String(x)));
      else if (v != null && typeof v !== "object") out.push(String(v));
    }
    if (out.length === 0) {
      for (const v of Object.values(o)) {
        if (v != null && typeof v !== "object") out.push(String(v));
        else if (Array.isArray(v)) out.push(...v.map((x) => String(x)));
      }
    }
    return out;
  }
  return [String(answer)];
}

/** Does a recorded answer satisfy a branch rule's equality (ADR-0021)? */
export function answerMatches(answer: unknown, equals: string): boolean {
  return answerValues(answer).includes(equals);
}


/**
 * The blocks a participant actually sees given their arm AND the answers
 * recorded so far (ADR-0021). The path is dynamic — recompute after each answer.
 */
export function resolveVisibleBlocks(
  snapshot: unknown,
  conditionSlug: string,
  answers: Record<string, unknown>,
): RuntimeBlock[] {
  const all = readBlocks(snapshot) as RuntimeBlock[];
  const earlier = new Set<string>(); // instanceIds positionally before the current block
  const out: RuntimeBlock[] = [];
  for (const b of all) {
    // Only clauses referencing earlier blocks count — a "forward" clause (e.g.
    // left over after a reorder) is invalid and ignored (ADR-0021 amendment).
    const cond = conditionWithSources(b.showIf, b.branchRules, earlier);
    if (isVisible(b, conditionSlug) && !NON_SCREEN_KEYS.has(b.key) && evaluateCondition(cond, answers)) out.push(b);
    earlier.add(b.instanceId);
  }
  return out;
}

/**
 * The visible SCREENS for a response (ADR-0028) — the runtime's per-screen
 * navigation unit. Arm-filters blocks, derives screens (contiguous group runs +
 * lone blocks), then evaluates each screen's condition against answers from
 * EARLIER screens (a group's `showIf` governs the whole screen; a single
 * screen's is the lone block's `showIf`/legacy branchRules). A strict
 * generalization of `resolveVisibleBlocks`: with no groups, screens map 1:1 to
 * visible blocks with identical visibility.
 */
export function resolveVisibleScreens(
  snapshot: unknown,
  conditionSlug: string,
  answers: Record<string, unknown>,
): Screen[] {
  const armBlocks = (readBlocks(snapshot) as RuntimeBlock[]).filter((b) => isVisible(b, conditionSlug) && !NON_SCREEN_KEYS.has(b.key));
  const screens = deriveScreens(armBlocks, readGroups(snapshot));
  const earlier = new Set<string>();
  const out: Screen[] = [];
  for (const sc of screens) {
    const branchRules = sc.kind === "single" ? sc.blocks[0]?.branchRules : undefined;
    const cond = conditionWithSources(sc.showIf, branchRules, earlier);
    if (evaluateCondition(cond, answers)) out.push(sc);
    for (const b of sc.blocks) earlier.add(b.instanceId);
  }
  return out;
}

/**
 * Could answering the CURRENT screen reveal a later screen? True when some block
 * that is hidden now has an answer-condition referencing a block on this screen
 * — so submitting it might unlock a new screen (forward branching). Used to show
 * "Continue" instead of a premature "Finish" on the last currently-visible screen.
 * Biased toward "Continue": if uncertain (the answer might not match), showing
 * Continue-then-end is less jarring than Finish-then-more.
 */
export function pathMayExtend(
  snapshot: unknown,
  conditionSlug: string,
  answers: Record<string, unknown>,
  current: Screen,
): boolean {
  const armBlocks = (readBlocks(snapshot) as RuntimeBlock[]).filter(
    (b) => isVisible(b, conditionSlug) && !NON_SCREEN_KEYS.has(b.key),
  );
  const visibleIds = new Set(resolveVisibleBlocks(snapshot, conditionSlug, answers).map((b) => b.instanceId));
  const currentIds = new Set(current.blocks.map((b) => b.instanceId));
  return armBlocks.some((b) => {
    if (visibleIds.has(b.instanceId)) return false; // already shown
    const cond = normalizeCondition(b.showIf, b.branchRules);
    return Boolean(cond?.clauses.some((c) => currentIds.has(c.fromInstanceId)));
  });
}

/** Recorded answers for a response, keyed by block instanceId (for branching). */
async function answersFor(responseId: string): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ block: responseItem.blockInstanceId, answer: responseItem.answer })
    .from(responseItem)
    .where(eq(responseItem.responseId, responseId));
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.block] = r.answer;
  return map;
}

/**
 * Ensure the version has at least one condition. A study that defined none runs
 * as a single implicit "control" group (the condition-builder UI is a later
 * surface; this keeps any preregistered study runnable). Returns all conditions.
 */
export async function ensureConditions(experimentVersionId: string) {
  const existing = await db
    .select()
    .from(conditionTable)
    .where(eq(conditionTable.experimentVersionId, experimentVersionId))
    .orderBy(conditionTable.position);
  if (existing.length > 0) return existing;

  await db
    .insert(conditionTable)
    .values({
      id: ulid(),
      experimentVersionId,
      slug: "control",
      name: "Control",
      allocationWeight: "1.0",
      position: 0,
    })
    .onConflictDoNothing();
  return db
    .select()
    .from(conditionTable)
    .where(eq(conditionTable.experimentVersionId, experimentVersionId))
    .orderBy(conditionTable.position);
}

type ConditionRow = Awaited<ReturnType<typeof ensureConditions>>[number];

/** Weighted-random pick over conditions by allocation_weight (ADR-0014). */
export function pickCondition(
  conditions: ConditionRow[],
  rng: () => number = Math.random,
): ConditionRow {
  const weights = conditions.map((c) => Math.max(0, Number(c.allocationWeight) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return conditions[0];
  let r = rng() * total;
  for (let i = 0; i < conditions.length; i++) {
    r -= weights[i];
    if (r < 0) return conditions[i];
  }
  return conditions[conditions.length - 1];
}

/**
 * Open (or reuse) a recruitment session for a preregistered version. Ensures a
 * default condition exists. Idempotent: returns the existing open session if one
 * already exists. Called from the researcher Run stage.
 */
export async function openRecruitment(experimentVersionId: string): Promise<{ id: string }> {
  await ensureConditions(experimentVersionId);
  const [open] = await db
    .select({ id: recruitmentSession.id })
    .from(recruitmentSession)
    .where(
      and(
        eq(recruitmentSession.experimentVersionId, experimentVersionId),
        eq(recruitmentSession.status, "open"),
      ),
    )
    .limit(1);
  if (open) return open;

  const id = ulid();
  await db.insert(recruitmentSession).values({ id, experimentVersionId, status: "open" });
  return { id };
}

/**
 * Transition the latest recruitment session for a version: pause (stop new
 * participants, keep data), close (terminal + closedAt), or resume (open again).
 * Participants can only begin when the session is `open` (resolveOpenRecruitment
 * requires it), so pausing/closing immediately gates the public /take link. A
 * paused session is reused on resume — data stays on one session, not split.
 */
export async function setRecruitmentStatus(
  experimentVersionId: string,
  status: "open" | "paused" | "closed",
): Promise<{ ok: boolean }> {
  const [latest] = await db
    .select({ id: recruitmentSession.id })
    .from(recruitmentSession)
    .where(eq(recruitmentSession.experimentVersionId, experimentVersionId))
    .orderBy(desc(recruitmentSession.openedAt))
    .limit(1);
  if (!latest) return { ok: false }; // nothing opened yet
  await db
    .update(recruitmentSession)
    .set({ status, closedAt: status === "closed" ? new Date() : null })
    .where(eq(recruitmentSession.id, latest.id));
  return { ok: true };
}

/**
 * Resolve the open recruitment for a study (its latest preregistered version's
 * open session) — what the public `/take/[studyId]/start` URL points at. Null
 * when the study isn't preregistered or recruitment isn't open.
 */
export async function resolveOpenRecruitment(studyId: string): Promise<
  { recruitmentSessionId: string; versionId: string; studyTitle: string; consent: StudyConsent; embeddedParams: string[]; panelIntegration: PanelIntegration } | null
> {
  const [study] = await db
    .select({ title: experiment.title, panelIntegration: experiment.panelIntegration })
    .from(experiment)
    .where(eq(experiment.id, studyId))
    .limit(1);
  if (!study) return null;

  const [ver] = await db
    .select({ id: experimentVersion.id, snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(
      and(
        eq(experimentVersion.experimentId, studyId),
        // Runnable = preregistered (OSF) OR published (no OSF). ADR-0013.
        inArray(experimentVersion.kind, ["preregistered", "published"]),
      ),
    )
    .orderBy(desc(experimentVersion.versionNumber))
    .limit(1);
  if (!ver) return null;

  const [rs] = await db
    .select({ id: recruitmentSession.id })
    .from(recruitmentSession)
    .where(
      and(
        eq(recruitmentSession.experimentVersionId, ver.id),
        eq(recruitmentSession.status, "open"),
      ),
    )
    .limit(1);
  if (!rs) return null;

  const embeddedParams = readBlocks(ver.snapshot)
    .filter((b) => b.key === "embedded-data")
    .flatMap((b) => (Array.isArray(b.config?.params) ? (b.config!.params as unknown[]) : []))
    .map(String)
    .filter((n) => n.trim() !== "");
  return { recruitmentSessionId: rs.id, versionId: ver.id, studyTitle: study.title, consent: readConsent(ver.snapshot), embeddedParams, panelIntegration: resolvePanelIntegration(study.panelIntegration) };
}

/**
 * Begin (or resume) a participant attempt. Assigns a condition once, immutably.
 * Resumes if the same external PID already has a response in this session.
 */
export async function startResponse(input: {
  recruitmentSessionId: string;
  mode: ResponseMode;
  externalPid?: string | null;
  /** Declared URL params captured into response.clientMetadata.embedded (ADR-0042). */
  embedded?: Record<string, string>;
  /** Preview-only: force a specific variant cell instead of random (ADR-0058). */
  variantCell?: VariantCell | null;
}): Promise<{ responseId: string } | { error: "closed" | "not_found" }> {
  const [rs] = await db
    .select()
    .from(recruitmentSession)
    .where(eq(recruitmentSession.id, input.recruitmentSessionId))
    .limit(1);
  if (!rs) return { error: "not_found" };
  if (rs.status !== "open") return { error: "closed" };

  // Resume an existing attempt for this PID rather than violating the unique index.
  const pid = input.externalPid?.trim() || null;
  if (pid) {
    const [existing] = await db
      .select({ id: response.id })
      .from(response)
      .where(
        and(eq(response.recruitmentSessionId, rs.id), eq(response.externalPid, pid)),
      )
      .limit(1);
    if (existing) return { responseId: existing.id };
  }

  const conditions = await ensureConditions(rs.experimentVersionId);
  const chosen = pickCondition(conditions);
  // Factorial variants (ADR-0058): assign a cell once, immutably (uniform random
  // across cells, between-subjects). Null when the study declares no factors.
  const [verRow] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot })
    .from(experimentVersion)
    .where(eq(experimentVersion.id, rs.experimentVersionId))
    .limit(1);
  const factors = readFactors(verRow?.snapshot);
  // Preview can force a cell (the live-preview selector); real runs always randomize.
  const variantCell = input.variantCell !== undefined ? input.variantCell : factors.length ? pickCell(factors) : null;
  const id = ulid();
  await db.insert(response).values({
    id,
    recruitmentSessionId: rs.id,
    experimentVersionId: rs.experimentVersionId,
    conditionId: chosen.id,
    variantCell,
    externalPid: pid,
    mode: input.mode,
    status: "started",
    currentQuestionIndex: 0,
    // Declared URL params (ADR-0042) live under clientMetadata.embedded — the
    // `response` table has no `metadata` column (that's recruitment_session), so
    // the old `metadata:` key was silently dropped by Drizzle. clientMetadata is
    // jsonb and otherwise unused, so the `embedded` namespace is safe.
    ...(input.embedded && Object.keys(input.embedded).length > 0
      ? { clientMetadata: { embedded: input.embedded } }
      : {}),
  });
  return { responseId: id };
}

export type RuntimeQuestion = {
  studyTitle: string;
  mode: ResponseMode;
  conditionSlug: string;
  block: RuntimeBlock;
  position: number;
  total: number;
  currentQuestionIndex: number;
};

/**
 * Resolve the question at `questionIndex` for a response. Returns `done` when
 * the index is past the last visible block (caller redirects to /complete),
 * or `not_found` when the response/study don't match.
 */
export async function getRuntimeQuestion(input: {
  studyId: string;
  responseId: string;
  questionIndex: number;
}): Promise<RuntimeQuestion | { done: true } | { error: "not_found" }> {
  const [row] = await db
    .select({
      resp: response,
      snapshot: experimentVersion.definitionSnapshot,
      versionExperimentId: experimentVersion.experimentId,
      title: experiment.title,
      conditionSlug: conditionTable.slug,
    })
    .from(response)
    .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .innerJoin(conditionTable, eq(response.conditionId, conditionTable.id))
    .where(eq(response.id, input.responseId))
    .limit(1);
  if (!row || row.versionExperimentId !== input.studyId) return { error: "not_found" };

  const answers = await answersFor(input.responseId);
  const blocks = resolveVisibleBlocks(row.snapshot, row.conditionSlug, answers);
  if (input.questionIndex >= blocks.length) return { done: true };
  if (input.questionIndex < 0) return { error: "not_found" };

  const bindings = readVariantBindings(row.snapshot);
  const cell = (row.resp.variantCell ?? {}) as VariantCell;
  return {
    studyTitle: row.title,
    mode: row.resp.mode as ResponseMode,
    conditionSlug: row.conditionSlug,
    block: applyCell(blocks[input.questionIndex], cell, bindings),
    position: input.questionIndex,
    total: blocks.length,
    currentQuestionIndex: row.resp.currentQuestionIndex,
  };
}

export type RecordResult =
  | { ok: true; done: boolean; nextIndex: number }
  | { ok: false; error: "not_found" | "invalid_answer" | "answer_required" };

/**
 * Record (or overwrite) the answer to the block at `questionIndex`, advance the
 * pointer, and complete the response when the last visible block is answered.
 * Validates the answer against the module's responseSchema. Idempotent per block
 * (upsert on (response_id, block_instance_id)).
 */
export async function recordAnswer(input: {
  responseId: string;
  questionIndex: number;
  answer: unknown;
}): Promise<RecordResult> {
  const [resp] = await db
    .select()
    .from(response)
    .where(eq(response.id, input.responseId))
    .limit(1);
  if (!resp) return { ok: false, error: "not_found" };

  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot, slug: conditionTable.slug })
    .from(experimentVersion)
    .innerJoin(conditionTable, eq(conditionTable.id, resp.conditionId))
    .where(eq(experimentVersion.id, resp.experimentVersionId))
    .limit(1);
  if (!ver) return { ok: false, error: "not_found" };

  // Resolve the path against answers recorded so far (ADR-0021 branching).
  const answersBefore = await answersFor(input.responseId);
  const blocks = resolveVisibleBlocks(ver.snapshot, ver.slug, answersBefore);
  const block = blocks[input.questionIndex];
  if (!block) return { ok: false, error: "not_found" };

  const def = getModuleDef(block.source, block.key, block.version);
  // Track the value recorded this call so we can re-resolve the (possibly
  // branched) path for the done/next decision.
  let recordedValue: unknown | undefined;

  // Validate + store the answer for question modules; stimuli store nothing.
  if (def?.collectsResponse && def.responseSchema) {
    const required = block.config?.required !== false;
    const empty = def.isAnswerEmpty
      ? def.isAnswerEmpty(input.answer)
      : input.answer == null ||
        (typeof input.answer === "object" && Object.keys(input.answer).length === 0);
    if (empty) {
      if (required) return { ok: false, error: "answer_required" };
    } else {
      const parsed = def.responseSchema.safeParse(input.answer);
      if (!parsed.success) return { ok: false, error: "invalid_answer" };
      // Config-dependent validation (option membership, slider range, …) that
      // the static schema can't express — a crafted POST can't bypass it.
      if (def.validateAnswer && !def.validateAnswer(parsed.data, block.config)) {
        return { ok: false, error: "invalid_answer" };
      }
      await db
        .insert(responseItem)
        .values({
          id: ulid(),
          responseId: resp.id,
          blockInstanceId: block.instanceId,
          blockPosition: input.questionIndex,
          moduleSource: block.source,
          moduleKey: block.key,
          moduleVersion: block.version,
          answer: parsed.data,
        })
        .onConflictDoUpdate({
          target: [responseItem.responseId, responseItem.blockInstanceId],
          set: { answer: parsed.data, blockPosition: input.questionIndex, answeredAt: new Date() },
        });
      recordedValue = parsed.data;
    }
  }

  const nextIndex = input.questionIndex + 1;
  // Re-resolve with the answer just recorded — it may unlock or skip later
  // blocks (ADR-0021), so completion is decided against the updated path.
  const answersAfter =
    recordedValue === undefined
      ? answersBefore
      : { ...answersBefore, [block.instanceId]: recordedValue };
  const blocksAfter = resolveVisibleBlocks(ver.snapshot, ver.slug, answersAfter);
  const done = nextIndex >= blocksAfter.length;

  // Advance the pointer (monotonic — never rewind on a re-answered earlier page).
  const advancedIndex = Math.max(resp.currentQuestionIndex, nextIndex);
  if (done) {
    await completeResponse(resp.id);
  } else {
    await db
      .update(response)
      .set({ currentQuestionIndex: advancedIndex })
      .where(eq(response.id, resp.id));
  }
  return { ok: true, done, nextIndex };
}

export type RuntimeScreenView = {
  studyTitle: string;
  /** Per-study participant theme (ADR-0024), from the session version's snapshot. */
  theme: StudyTheme;
  mode: ResponseMode;
  conditionSlug: string;
  screen: Screen;
  position: number;
  total: number;
  /** A later screen may still appear after answering this one (forward branching)
   *  — so show "Continue" not "Finish" even on the last currently-visible screen. */
  mayContinue: boolean;
  /** Resolved participant-facing chrome copy (study overrides + defaults). */
  uiCopy: Record<UiCopyKey, string>;
  /** Set block-internal copy overrides (e.g. social-post labels); blank = native. */
  blockCopy: Partial<Record<BlockCopyKey, string>>;
};

/**
 * Resolve the SCREEN at `screenIndex` (ADR-0028) — a group (several blocks) or a
 * single block — for a response. The per-screen analogue of getRuntimeQuestion;
 * `done` past the last visible screen, `not_found` on a mismatch.
 */
export async function getRuntimeScreen(input: {
  studyId: string;
  responseId: string;
  screenIndex: number;
}): Promise<RuntimeScreenView | { done: true } | { error: "not_found" }> {
  const [row] = await db
    .select({
      resp: response,
      snapshot: experimentVersion.definitionSnapshot,
      versionExperimentId: experimentVersion.experimentId,
      title: experiment.title,
      conditionSlug: conditionTable.slug,
    })
    .from(response)
    .innerJoin(experimentVersion, eq(response.experimentVersionId, experimentVersion.id))
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .innerJoin(conditionTable, eq(response.conditionId, conditionTable.id))
    .where(eq(response.id, input.responseId))
    .limit(1);
  if (!row || row.versionExperimentId !== input.studyId) return { error: "not_found" };

  const answers = await answersFor(input.responseId);
  const screens = resolveVisibleScreens(row.snapshot, row.conditionSlug, answers);
  if (input.screenIndex < 0) return { error: "not_found" };
  if (input.screenIndex >= screens.length) return { done: true };

  const rawScreen = screens[input.screenIndex];
  const isLastKnown = input.screenIndex + 1 >= screens.length;
  // Resolve this screen's blocks for the participant's assigned variant cell.
  const bindings = readVariantBindings(row.snapshot);
  const cell = (row.resp.variantCell ?? {}) as VariantCell;
  const screen = bindings.length
    ? { ...rawScreen, blocks: rawScreen.blocks.map((b) => applyCell(b, cell, bindings)) }
    : rawScreen;
  return {
    studyTitle: row.title,
    theme: readTheme(row.snapshot),
    mode: row.resp.mode as ResponseMode,
    conditionSlug: row.conditionSlug,
    screen,
    position: input.screenIndex,
    total: screens.length,
    // Only worth computing on the last known screen — earlier screens already show "Continue".
    mayContinue: isLastKnown && pathMayExtend(row.snapshot, row.conditionSlug, answers, screen),
    uiCopy: resolveUiCopy((row.snapshot as { uiCopy?: unknown } | null)?.uiCopy),
    blockCopy: readBlockCopy((row.snapshot as { uiCopy?: unknown } | null)?.uiCopy),
  };
}

/** Validate one block's answer against its module (shape + config-dependent +
 *  required). Returns the parsed value to write, `null` to skip (empty optional /
 *  stimulus), or an error. */
function validateBlockAnswer(
  block: BlockInstance,
  answer: unknown,
): { write: unknown } | { skip: true } | { error: "invalid_answer" | "answer_required" } {
  const def = getModuleDef(block.source, block.key, block.version);
  if (!def?.collectsResponse || !def.responseSchema) return { skip: true };
  const required = block.config?.required !== false;
  const empty = def.isAnswerEmpty
    ? def.isAnswerEmpty(answer)
    : answer == null || (typeof answer === "object" && Object.keys(answer).length === 0);
  if (empty) return required ? { error: "answer_required" } : { skip: true };
  const parsed = def.responseSchema.safeParse(answer);
  if (!parsed.success) return { error: "invalid_answer" };
  if (def.validateAnswer && !def.validateAnswer(parsed.data, block.config)) {
    return { error: "invalid_answer" };
  }
  return { write: parsed.data };
}

/**
 * Record every block on a screen at once (ADR-0028), then advance by screen.
 * Validates ALL blocks first (no partial writes), upserts each collecting block's
 * answer, re-resolves the screen path with the new answers (branching), and
 * completes when the last visible screen is done. `answers` is keyed by block
 * instanceId.
 */
export async function recordScreenAnswers(input: {
  responseId: string;
  screenIndex: number;
  answers: Record<string, unknown>;
}): Promise<RecordResult> {
  const [resp] = await db.select().from(response).where(eq(response.id, input.responseId)).limit(1);
  if (!resp) return { ok: false, error: "not_found" };
  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot, slug: conditionTable.slug })
    .from(experimentVersion)
    .innerJoin(conditionTable, eq(conditionTable.id, resp.conditionId))
    .where(eq(experimentVersion.id, resp.experimentVersionId))
    .limit(1);
  if (!ver) return { ok: false, error: "not_found" };

  const answersBefore = await answersFor(input.responseId);
  const screens = resolveVisibleScreens(ver.snapshot, ver.slug, answersBefore);
  const screen = screens[input.screenIndex];
  if (!screen) return { ok: false, error: "not_found" };

  // In-screen reveal (ADR-0088): a grouped block whose `showIf` targets a
  // same-screen sibling is only SHOWN once that answer satisfies the condition.
  // When it isn't shown it's absent — never required — so a conditionally-revealed
  // block must not block Continue (owner: "it's optional, not mandatory"). We
  // evaluate each block's condition against this screen's submitted answers (plus
  // earlier ones) and skip validating/recording any block that isn't revealed.
  const merged: Record<string, unknown> = { ...answersBefore };
  for (const b of screen.blocks) {
    const raw = input.answers[b.instanceId];
    if (raw !== undefined) merged[b.instanceId] = raw;
  }
  const isRevealed = (block: BlockInstance): boolean => {
    const cond = normalizeCondition(block.showIf, block.branchRules);
    return !cond || cond.clauses.length === 0 || evaluateCondition(cond, merged);
  };

  // Validate every SHOWN block first — no partial writes on a screen with one bad field.
  const toWrite: { block: BlockInstance; value: unknown }[] = [];
  for (const block of screen.blocks) {
    if (!isRevealed(block)) continue; // unrevealed → optional/absent
    const r = validateBlockAnswer(block, input.answers[block.instanceId]);
    if ("error" in r) return { ok: false, error: r.error };
    if ("write" in r) toWrite.push({ block, value: r.write });
  }

  for (const { block, value } of toWrite) {
    await db
      .insert(responseItem)
      .values({
        id: ulid(),
        responseId: resp.id,
        blockInstanceId: block.instanceId,
        blockPosition: input.screenIndex,
        moduleSource: block.source,
        moduleKey: block.key,
        moduleVersion: block.version,
        answer: value,
      })
      .onConflictDoUpdate({
        target: [responseItem.responseId, responseItem.blockInstanceId],
        set: { answer: value, blockPosition: input.screenIndex, answeredAt: new Date() },
      });
  }

  // V2.1 (ADR-0066 H3a): kick off emotion analysis for any submitted block that
  // has it enabled. Best-effort — a job-enqueue failure must never break the
  // answer write or the participant's flow.
  for (const { block } of toWrite) {
    const ea = (block.config as { emotionAnalysis?: { enabled?: boolean } } | undefined)?.emotionAnalysis;
    if (ea?.enabled) {
      void jobs.enqueue("hume.analyze", { responseId: resp.id, blockInstanceId: block.instanceId }).catch(() => {});
    }
  }

  const nextIndex = input.screenIndex + 1;
  const answersAfter = { ...answersBefore };
  for (const { block, value } of toWrite) answersAfter[block.instanceId] = value;
  const screensAfter = resolveVisibleScreens(ver.snapshot, ver.slug, answersAfter);
  const done = nextIndex >= screensAfter.length;

  const advancedIndex = Math.max(resp.currentQuestionIndex, nextIndex);
  if (done) {
    await completeResponse(resp.id);
  } else {
    await db.update(response).set({ currentQuestionIndex: advancedIndex }).where(eq(response.id, resp.id));
  }
  return { ok: true, done, nextIndex };
}

/** Mark a response complete + bump the session's completed count (run mode). */
export async function completeResponse(responseId: string): Promise<void> {
  const [resp] = await db
    .select()
    .from(response)
    .where(eq(response.id, responseId))
    .limit(1);
  if (!resp || resp.status === "completed") return;

  await db
    .update(response)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(response.id, responseId));

  if (resp.mode === "run") {
    await db
      .update(recruitmentSession)
      .set({ currentN: sql`${recruitmentSession.currentN} + 1` })
      .where(eq(recruitmentSession.id, resp.recruitmentSessionId));
  }
}

/** Mode + completion for the terminal page (null if the response is unknown). */
export async function getCompletionInfo(
  responseId: string,
): Promise<{
  mode: ResponseMode;
  completed: boolean;
  redirect: { url: string; code: string; label: string } | null;
  /** External-panel completion redirect (ADR-0071) — auto-redirect with delay +
   *  sticky box. Takes precedence over `redirect` when set. */
  panelRedirect: { url: string; delaySec: number; stickyText: string } | null;
  uiCopy: Record<UiCopyKey, string>;
} | null> {
  const [resp] = await db
    .select({ status: response.status, mode: response.mode, versionId: response.experimentVersionId, externalPid: response.externalPid })
    .from(response)
    .where(eq(response.id, responseId))
    .limit(1);
  if (!resp) return null;
  const [ver] = await db
    .select({ snapshot: experimentVersion.definitionSnapshot, panelIntegration: experiment.panelIntegration })
    .from(experimentVersion)
    .innerJoin(experiment, eq(experimentVersion.experimentId, experiment.id))
    .where(eq(experimentVersion.id, resp.versionId))
    .limit(1);
  const er = ver ? readBlocks(ver.snapshot).find((b) => b.key === "end-redirect") : undefined;
  let redirect: { url: string; code: string; label: string } | null = null;
  const rawUrl = typeof er?.config?.redirectUrl === "string" ? er.config.redirectUrl.trim() : "";
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol === "https:" || u.protocol === "http:") {
        redirect = {
          url: u.toString(),
          code: typeof er!.config!.completionCode === "string" ? (er!.config!.completionCode as string) : "",
          label: typeof er!.config!.buttonLabel === "string" && er!.config!.buttonLabel ? (er!.config!.buttonLabel as string) : "Return to the study panel",
        };
      }
    } catch {
      redirect = null; // invalid URL → no button (the code still shows)
    }
  }
  // External-panel completion redirect (ADR-0071) — only on a real (non-preview)
  // completed response; fills {ext_id}/{session_id} and rides the delay/sticky box.
  let panelRedirect: { url: string; delaySec: number; stickyText: string } | null = null;
  const panel = ver ? resolvePanelIntegration(ver.panelIntegration) : null;
  if (panel?.completionUrl && resp.mode !== "preview") {
    panelRedirect = {
      url: fillPanelPlaceholders(panel.completionUrl, { extId: resp.externalPid, sessionId: responseId }),
      delaySec: panel.completionDelaySec,
      stickyText: panel.completionStickyText,
    };
  }
  return {
    mode: resp.mode as ResponseMode,
    completed: resp.status === "completed",
    redirect,
    panelRedirect,
    uiCopy: resolveUiCopy((ver?.snapshot as { uiCopy?: unknown } | null)?.uiCopy),
  };
}
