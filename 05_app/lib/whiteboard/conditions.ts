/**
 * Answer-based condition model (ADR-0021 + 2026-06-07 amendment). Shared by the
 * participant runtime (evaluation) and the whiteboard condition builder (the
 * type-aware operator menus + rendering), so both agree on semantics. Pure +
 * client-safe — no server imports.
 */
export type Operator =
  | "answered" // flat link — source has any answer (no value needed); the default
  | "eq" // is / equals (also single-select "is")
  | "neq" // is not
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between" // value = [min, max]
  | "isAnyOf" // single answer is one of value[]
  | "contains" // free-text contains value[0] (case-insensitive)
  | "includesAny"; // multi-select answer includes any of value[]

export type Clause = { fromInstanceId: string; operator: Operator; value: string[] };
export type ConditionGroup = { op: "and" | "or"; clauses: Clause[] };

/** Legacy equality rule shape (pre-amendment) — read for back-compat. */
export type LegacyBranchRule = { fromInstanceId: string; equals: string };

export const OPERATOR_LABELS: Record<Operator, string> = {
  answered: "is answered",
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  between: "is between",
  isAnyOf: "is any of",
  contains: "contains",
  includesAny: "includes any of",
};

// "answered" leads each menu so a freshly-drawn wire is flat (no value) by default.
const NUMERIC: Operator[] = ["answered", "eq", "neq", "gte", "lte", "gt", "lt", "between"];
const SINGLE: Operator[] = ["answered", "eq", "neq", "isAnyOf"];
const MULTI: Operator[] = ["answered", "includesAny"];
const TEXT: Operator[] = ["answered", "eq", "neq", "contains"];

/** Can a block's answer be used as a condition source? Pure stimuli have no
 *  branchable answer. A social-post DOES (branch on the chosen reaction). */
export function isConditionSource(key: string): boolean {
  return key !== "text" && key !== "image" && key !== "video" && key !== "audio-stimulus" && key !== "link";
}

/** Type-aware operator menu for a source block's module key. */
export function operatorsForKey(key: string): Operator[] {
  switch (key) {
    case "likert-7":
    case "slider":
      return NUMERIC;
    case "multiple-choice":
    case "attention-check":
    // Social-post branches on the chosen reaction (owner: reaction only). "is
    // answered" = reacted at all; "is" / "is any of" match specific reactions.
    case "social-post":
      return SINGLE;
    case "ranking":
    case "demographics":
      return MULTI;
    case "free-text":
      return TEXT;
    default:
      return ["eq", "neq"];
  }
}

/**
 * The comparable string value(s) of a recorded answer, normalized across module
 * shapes (likert/slider `{value}`, free-text `{text}`, multi-select `{selected:[]}`
 * or a bare array, scalars).
 */
export function answerValues(answer: unknown): string[] {
  if (answer == null) return [];
  if (Array.isArray(answer)) return answer.map((a) => String(a));
  if (typeof answer === "object") {
    const o = answer as Record<string, unknown>;
    // Social-post: its only branchable signal is the chosen reaction (owner
    // decision). Recognized by the liked+shared boolean pair. No reaction → no
    // value, so an "is answered" clause reads as "reacted at all".
    if (typeof o.liked === "boolean" && typeof o.shared === "boolean") {
      return typeof o.reaction === "string" && o.reaction ? [o.reaction] : [];
    }
    const out: string[] = [];
    for (const k of ["value", "text", "selected", "choice", "rank", "options"]) {
      const v = o[k];
      if (Array.isArray(v)) out.push(...v.map((x) => String(x)));
      else if (v != null && typeof v !== "object") out.push(String(v));
    }
    if (out.length === 0) {
      for (const v of Object.values(o)) {
        if (Array.isArray(v)) out.push(...v.map((x) => String(x)));
        else if (v != null && typeof v !== "object") out.push(String(v));
      }
    }
    return out;
  }
  return [String(answer)];
}

function num(s: string | undefined): number {
  return Number(s);
}

/** Evaluate one clause against a recorded answer (its source block's answer). */
export function evaluateClause(answer: unknown, operator: Operator, value: string[]): boolean {
  const av = answerValues(answer);
  if (operator === "answered") return av.length > 0; // flat link — reached once answered
  if (av.length === 0) return false; // unanswered source never matches
  const first = av[0];
  switch (operator) {
    case "eq":
      return av.includes(value[0]);
    case "neq":
      return !av.includes(value[0]);
    // Ignore empty-string targets defensively: older saved conditions can carry a
    // stray "" (a builder seed bug fixed 2026-07-01), which must never match.
    case "isAnyOf":
      return av.some((a) => a !== "" && value.includes(a));
    case "includesAny":
      return av.some((a) => a !== "" && value.includes(a));
    case "contains":
      return av.some((a) => a.toLowerCase().includes((value[0] ?? "").toLowerCase()));
    case "gt":
      return num(first) > num(value[0]);
    case "gte":
      return num(first) >= num(value[0]);
    case "lt":
      return num(first) < num(value[0]);
    case "lte":
      return num(first) <= num(value[0]);
    case "between":
      return num(first) >= num(value[0]) && num(first) <= num(value[1]);
    default:
      return false;
  }
}

/** Evaluate a condition group against recorded answers (by source instanceId). */
export function evaluateCondition(
  group: ConditionGroup | null | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!group || group.clauses.length === 0) return true; // flat / unconditioned
  const results = group.clauses.map((c) => evaluateClause(answers[c.fromInstanceId], c.operator, c.value));
  return group.op === "and" ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Given blocks in a *prospective* order, find condition clauses that would become
 * invalid (their source is no longer an earlier block). Used to warn before a
 * reorder/remove silently drops conditions. Returns one entry per broken clause.
 */
export function clausesBrokenByOrder(
  ordered: { instanceId: string; showIf?: ConditionGroup | null; branchRules?: LegacyBranchRule[] | null }[],
): { targetId: string; clause: Clause }[] {
  const earlier = new Set<string>();
  const broken: { targetId: string; clause: Clause }[] = [];
  for (const b of ordered) {
    const g = normalizeCondition(b.showIf, b.branchRules);
    for (const clause of g?.clauses ?? []) {
      if (!earlier.has(clause.fromInstanceId)) broken.push({ targetId: b.instanceId, clause });
    }
    earlier.add(b.instanceId);
  }
  return broken;
}

type OrderedBlock = { instanceId: string; showIf?: ConditionGroup | null; branchRules?: LegacyBranchRule[] | null };
const brokenKey = (b: { targetId: string; clause: Clause }) =>
  `${b.targetId}|${b.clause.fromInstanceId}|${b.clause.operator}|${b.clause.value.join(",")}`;

/**
 * Clauses that are valid *now* but would become invalid under `next` — i.e. the
 * conditions a reorder would actually destroy. Excludes clauses already broken
 * in the current order (those are dead already; don't warn about them).
 */
export function newlyBrokenByReorder(
  current: OrderedBlock[],
  next: OrderedBlock[],
): { targetId: string; clause: Clause }[] {
  const alreadyBroken = new Set(clausesBrokenByOrder(current).map(brokenKey));
  return clausesBrokenByOrder(next).filter((b) => !alreadyBroken.has(brokenKey(b)));
}

/** Short human label for one clause, e.g. "Post 1 is at least 5" or "Q2 is answered". */
export function summarizeClause(clause: Clause, nameOf: (id: string) => string): string {
  const name = nameOf(clause.fromInstanceId);
  if (clause.operator === "answered") return `${name} is answered`;
  const val = clause.operator === "between" ? clause.value.join("–") : clause.value.join(" / ");
  return `${name} ${OPERATOR_LABELS[clause.operator]} ${val}`.trim();
}

/** One-line summary of a whole group for preview tags, e.g. "Q1 is Yes OR Q2 ≥ 5". */
export function summarizeCondition(
  group: ConditionGroup | null | undefined,
  nameOf: (id: string) => string,
): string | null {
  if (!group || group.clauses.length === 0) return null;
  const joiner = group.op === "and" ? " AND " : " OR ";
  return group.clauses.map((c) => summarizeClause(c, nameOf)).join(joiner);
}

/**
 * A block's *effective* condition, keeping only clauses whose source is allowed
 * (i.e. an earlier block). A clause that references a later block — e.g. after a
 * reorder — is invalid and dropped, so the canvas/list/runtime stay consistent.
 * Returns null when nothing valid remains (the block is then unconditional).
 */
export function conditionWithSources(
  showIf: ConditionGroup | null | undefined,
  legacy: LegacyBranchRule[] | null | undefined,
  allowedSources: Set<string>,
): ConditionGroup | null {
  const g = normalizeCondition(showIf, legacy);
  if (!g) return null;
  const clauses = g.clauses.filter((c) => allowedSources.has(c.fromInstanceId));
  return clauses.length ? { op: g.op, clauses } : null;
}

/** Resolve a block's effective condition group: `showIf`, else legacy equality rules, else null. */
export function normalizeCondition(
  showIf: ConditionGroup | null | undefined,
  legacy: LegacyBranchRule[] | null | undefined,
): ConditionGroup | null {
  if (showIf && showIf.clauses.length) return showIf;
  if (legacy && legacy.length) {
    return { op: "or", clauses: legacy.map((r) => ({ fromInstanceId: r.fromInstanceId, operator: "eq", value: [r.equals] })) };
  }
  return null;
}
