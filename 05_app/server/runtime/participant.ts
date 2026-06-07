import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/server/db/client";
import {
  condition as conditionTable,
  experiment,
  experimentVersion,
  recruitmentSession,
  response,
  responseItem,
} from "@/server/db/schema";
import { readBlocks, type BlockInstance } from "@/server/modules/blocks";
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
export function visibleBlocks(snapshot: unknown, conditionSlug: string): RuntimeBlock[] {
  return (readBlocks(snapshot) as RuntimeBlock[]).filter((b) => isVisible(b, conditionSlug));
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
 * Answer-based branch visibility (ADR-0021): no rules → always; otherwise shown
 * only if AT LEAST ONE rule's source block has a recorded answer equal to the
 * rule value. Rules reference earlier blocks, so their answers exist by the time
 * the dependent block is reached.
 */
function branchVisible(block: RuntimeBlock, answers: Record<string, unknown>): boolean {
  const rules = block.branchRules;
  if (!rules || rules.length === 0) return true;
  return rules.some(
    (r) => r.fromInstanceId in answers && answerMatches(answers[r.fromInstanceId], r.equals),
  );
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
  return (readBlocks(snapshot) as RuntimeBlock[]).filter(
    (b) => isVisible(b, conditionSlug) && branchVisible(b, answers),
  );
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
 * Resolve the open recruitment for a study (its latest preregistered version's
 * open session) — what the public `/take/[studyId]/start` URL points at. Null
 * when the study isn't preregistered or recruitment isn't open.
 */
export async function resolveOpenRecruitment(studyId: string): Promise<
  { recruitmentSessionId: string; versionId: string; studyTitle: string } | null
> {
  const [study] = await db
    .select({ title: experiment.title })
    .from(experiment)
    .where(eq(experiment.id, studyId))
    .limit(1);
  if (!study) return null;

  const [ver] = await db
    .select({ id: experimentVersion.id })
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

  return { recruitmentSessionId: rs.id, versionId: ver.id, studyTitle: study.title };
}

/**
 * Begin (or resume) a participant attempt. Assigns a condition once, immutably.
 * Resumes if the same external PID already has a response in this session.
 */
export async function startResponse(input: {
  recruitmentSessionId: string;
  mode: ResponseMode;
  externalPid?: string | null;
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
  const id = ulid();
  await db.insert(response).values({
    id,
    recruitmentSessionId: rs.id,
    experimentVersionId: rs.experimentVersionId,
    conditionId: chosen.id,
    externalPid: pid,
    mode: input.mode,
    status: "started",
    currentQuestionIndex: 0,
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

  return {
    studyTitle: row.title,
    mode: row.resp.mode as ResponseMode,
    conditionSlug: row.conditionSlug,
    block: blocks[input.questionIndex],
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
): Promise<{ mode: ResponseMode; completed: boolean } | null> {
  const [resp] = await db
    .select({ status: response.status, mode: response.mode })
    .from(response)
    .where(eq(response.id, responseId))
    .limit(1);
  if (!resp) return null;
  return { mode: resp.mode as ResponseMode, completed: resp.status === "completed" };
}
