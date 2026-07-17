import { defaultTemplateKey, isPreregTemplateKey, type PreregTemplateKey } from "@/lib/prereg-templates";

import { getModuleDef } from "./registry";

/**
 * A block instance inside ExperimentVersion.definition_snapshot (ADR-0012).
 * `config` is validated against the module's Zod schema at the write boundary.
 */
export type BlockInstance = {
  instanceId: string; // ULID
  source: string;
  key: string;
  version: string;
  config: Record<string, unknown>;
  /**
   * Optional researcher-set label for this block instance (distinct from the
   * module type). Absent = fall back to the module's display name. Stored in the
   * blocks JSON (no migration); never shown to participants.
   */
  title?: string;
  /**
   * Optional condition-visibility rule (ADR-0014). Absent / empty = shown to
   * every condition. Values are condition *slugs* (stable across the preregister
   * snapshot copy). The participant runtime enforces this server-side.
   */
  visibility?: { showIfCondition?: string[] };
  /**
   * Legacy equality branch rules (ADR-0021, pre-amendment). Superseded by
   * `showIf`; still read for back-compat (converted to an OR group). New writes
   * use `showIf`.
   */
  branchRules?: { fromInstanceId: string; equals: string }[];
  /**
   * Answer-based visibility condition (ADR-0021 amendment) — a type-aware AND/OR
   * tree over earlier blocks' answers. Absent = shown regardless (flat).
   * Combines with `visibility` arm rules (both must pass). The model + evaluator
   * live in `lib/whiteboard/conditions.ts`.
   */
  showIf?: import("@/lib/whiteboard/conditions").ConditionGroup;
  /** Replication rationale (ADR-0039): why THIS block differs from the pinned
   *  original. Set only on forks; compiled into the Overview + readiness checks. */
  divergenceNote?: string;
  /**
   * Question-group membership (ADR-0028). Blocks sharing a `groupId` (and
   * contiguous in order) render together on ONE participant screen. Absent =
   * the block is its own screen (today's behaviour). The group's metadata
   * (title, screen-level condition) lives in `definition_snapshot.groups[]`.
   */
  groupId?: string;
};

export type ModuleLock = { source: string; key: string; version: string };

/** Question-group metadata (ADR-0028), stored in `definition_snapshot.groups[]`. */
export type StudyGroup = {
  id: string;
  title?: string;
  /** Screen-level visibility — the whole group shows/skips as a unit. */
  showIf?: import("@/lib/whiteboard/conditions").ConditionGroup;
  /** The custom module this group was inserted from (ADR-0029) — enables
   *  "Update module" vs "Save as new" once the group is edited. */
  moduleId?: string;
  /** Screen-level interaction gating for social-post groups (ADR-0087). Continue
   *  stays disabled until every requirement is met — or `maxTimeSec` elapses.
   *  Absent/empty ⇒ no gate (back-compat). */
  maxTimeSec?: number;
  interactionRequirements?: import("@/lib/whiteboard/interaction-requirements").InteractionRequirement[];
  /** Show the requirement chips to participants (ADR-0087 am.). Absent ⇒ true. */
  showRequirementSummary?: boolean;
};

/** Read the question-group metadata out of a definition_snapshot. */
export function readGroups(snapshot: unknown): StudyGroup[] {
  if (snapshot && typeof snapshot === "object" && "groups" in snapshot) {
    const g = (snapshot as { groups?: unknown }).groups;
    if (Array.isArray(g)) return g as StudyGroup[];
  }
  return [];
}

/** Factorial-variant factors out of a definition_snapshot (ADR-0058). */
export function readFactors(snapshot: unknown): import("@/lib/variants/factorial").VariantFactor[] {
  if (snapshot && typeof snapshot === "object" && "factors" in snapshot) {
    const f = (snapshot as { factors?: unknown }).factors;
    if (Array.isArray(f)) return f as import("@/lib/variants/factorial").VariantFactor[];
  }
  return [];
}

/** Field→factor variant bindings out of a definition_snapshot (ADR-0058). */
export function readVariantBindings(snapshot: unknown): import("@/lib/variants/factorial").VariantBinding[] {
  if (snapshot && typeof snapshot === "object" && "variantBindings" in snapshot) {
    const b = (snapshot as { variantBindings?: unknown }).variantBindings;
    if (Array.isArray(b)) return b as import("@/lib/variants/factorial").VariantBinding[];
  }
  return [];
}

/** Researcher-authored study documentation (V1.12 B1), stored in the snapshot. */
export type OverviewSection = { id: string; heading: string; contentMd: string };

/** Where a typed plan field's content came from (ADR-0101). Item ⑨ (auto-derive
 *  the plan from the built study) will write "derived"; v1 only ever writes
 *  "researcher". The slot exists now so derivation can populate a field later
 *  without clobbering researcher-authored prose. */
export type FieldSource = "researcher" | "derived";

/** A typed plan text field + its provenance. */
export type PlanField = { text: string; source: FieldSource };

export type VariableRole = "iv" | "dv" | "covariate" | "exclusion";

/** A declared variable, keyed to the block that measures it. Structured rather
 *  than prose because the design spans two mechanisms (the `condition` table for
 *  between-subjects arms; snapshot factors/variantBindings for factorial cells).
 *  The data type is DERIVED from the linked block's responseSchema, never stored. */
export type PlanVariable = {
  id: string;
  name: string;
  role: VariableRole;
  /** instanceId of the block measuring this variable; null = not linked. */
  instanceId: string | null;
  notes: string;
  source: FieldSource;
};

/** A prediction, optionally bound to a hypothesis by 1-based index. */
export type ExpectedOutcome = {
  id: string;
  hypothesisIndex: number | null;
  prediction: string;
  source: FieldSource;
};

export type StudyOverview = {
  abstract: string;
  /** Numbered hypotheses (H1, H2, …) — first-class for preregistration. */
  hypotheses: string[];
  sections: OverviewSection[];
  /** For a replication: the researcher's notes on what they changed + why
   *  (complements the auto-generated block diff). Empty for non-replications. */
  replicationNotes: string;
  /** Declared replication kind (ADR-0039) — judged by the readiness checks. */
  replicationIntent?: "direct" | "conceptual" | "extension";
  // --- Typed plan fields (ADR-0101) ------------------------------------------
  /**
   * The researcher's EXPLICIT template choice. Absent = never chosen; derive it
   * with `planTemplateKey()` instead of reading this directly.
   *
   * Deliberately optional and NEVER materialized by `readOverview`: several call
   * sites round-trip a plan (`{...readOverview(snap), someField}` — e.g.
   * `setReplicationIntent`, `injectReplicationRecipe`), so a materialized default
   * would be written back as though the researcher had picked it. That would
   * freeze "open-ended" into a study *before* its replication intent was declared
   * and then beat the derivation forever.
   */
  templateKey?: PreregTemplateKey;
  samplingPlan: PlanField;
  analysisPlan: PlanField;
  variables: PlanVariable[];
  expectedOutcomes: ExpectedOutcome[];
  /**
   * Replication-recipe-only fields — the Recipe's own OSF questions (77-12
   * original study, 77-2 target effect, 77-73 differences). Stored on the one
   * overview object like everything else, so switching template hides them
   * without destroying them. Empty for an Open-ended plan.
   */
  originalStudy: PlanField;
  targetEffect: PlanField;
  differences: PlanField;
  /**
   * Whether the OSF filing says which parts were read from the built study
   * rather than written by the researcher (ADR-0106 D5).
   *
   * **Default true**, and opt-OUT: the honest default, and a genuine selling
   * point — machine-true design facts beat recalled ones. But it is the
   * researcher's filing: owner direction 2026-07-16, *"at the end of the day it
   * is his study, so we should solve it with some toggle/checkbox selected by
   * default."* Unchecking is a real choice with no nag.
   *
   * Tolerant read: absent (every study frozen before item ⑨) means true, which
   * is the same answer disclosure would have given — those plans have no derived
   * content to disclose.
   */
  discloseDerivation: boolean;
};

const VARIABLE_ROLES: readonly VariableRole[] = ["iv", "dv", "covariate", "exclusion"];

/**
 * Which preregistration template a plan uses (ADR-0101): the researcher's
 * explicit choice, else derived from replication intent. Always read the template
 * through this — `overview.templateKey` alone is only the explicit part.
 */
export function planTemplateKey(overview: StudyOverview): PreregTemplateKey {
  return overview.templateKey ?? defaultTemplateKey(overview.replicationIntent);
}

const emptyField = (): PlanField => ({ text: "", source: "researcher" });

const readSource = (v: unknown): FieldSource => (v === "derived" ? "derived" : "researcher");

function readPlanField(v: unknown): PlanField {
  if (typeof v === "string") return { text: v, source: "researcher" }; // defensive
  if (v && typeof v === "object") {
    const f = v as Partial<PlanField>;
    return { text: typeof f.text === "string" ? f.text : "", source: readSource(f.source) };
  }
  return emptyField();
}

function readVariables(v: unknown): PlanVariable[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x, i) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Partial<PlanVariable>;
    return [
      {
        // Deterministic id fallback — readOverview runs on every read, so it must
        // never mint a fresh random id (that would churn React keys + diffs).
        id: typeof r.id === "string" && r.id ? r.id : `v${i}`,
        name: typeof r.name === "string" ? r.name : "",
        role: VARIABLE_ROLES.includes(r.role as VariableRole) ? (r.role as VariableRole) : "iv",
        instanceId: typeof r.instanceId === "string" ? r.instanceId : null,
        notes: typeof r.notes === "string" ? r.notes : "",
        source: readSource(r.source),
      },
    ];
  });
}

function readExpectedOutcomes(v: unknown): ExpectedOutcome[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x, i) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Partial<ExpectedOutcome>;
    return [
      {
        id: typeof r.id === "string" && r.id ? r.id : `o${i}`,
        hypothesisIndex:
          typeof r.hypothesisIndex === "number" && Number.isInteger(r.hypothesisIndex) && r.hypothesisIndex > 0
            ? r.hypothesisIndex
            : null,
        prediction: typeof r.prediction === "string" ? r.prediction : "",
        source: readSource(r.source),
      },
    ];
  });
}

/**
 * Read the overview out of a definition_snapshot; empty default if absent.
 *
 * TOLERANT BY CONTRACT (ADR-0101): every field must have a default here, because
 * this reads immutable snapshots frozen long before the field existed — including
 * preregistrations we can never rewrite. Adding a field to StudyOverview without
 * defaulting it here breaks every historical version.
 */
export function readOverview(snapshot: unknown): StudyOverview {
  if (snapshot && typeof snapshot === "object" && "overview" in snapshot) {
    const o = (snapshot as { overview?: unknown }).overview;
    if (o && typeof o === "object") {
      const ov = o as Partial<StudyOverview>;
      const replicationIntent =
        ov.replicationIntent === "direct" || ov.replicationIntent === "conceptual" || ov.replicationIntent === "extension"
          ? ov.replicationIntent
          : undefined;
      return {
        abstract: typeof ov.abstract === "string" ? ov.abstract : "",
        hypotheses: Array.isArray(ov.hypotheses)
          ? (ov.hypotheses.filter((h) => typeof h === "string") as string[])
          : [],
        sections: Array.isArray(ov.sections) ? (ov.sections as OverviewSection[]) : [],
        replicationNotes: typeof ov.replicationNotes === "string" ? ov.replicationNotes : "",
        ...(replicationIntent ? { replicationIntent } : {}),
        // Pass through only an EXPLICIT choice — never materialize the derived
        // default (see the templateKey docstring). Use planTemplateKey() to read.
        ...(isPreregTemplateKey(ov.templateKey) ? { templateKey: ov.templateKey } : {}),
        samplingPlan: readPlanField(ov.samplingPlan),
        analysisPlan: readPlanField(ov.analysisPlan),
        variables: readVariables(ov.variables),
        expectedOutcomes: readExpectedOutcomes(ov.expectedOutcomes),
        originalStudy: readPlanField(ov.originalStudy),
        targetEffect: readPlanField(ov.targetEffect),
        differences: readPlanField(ov.differences),
        discloseDerivation: ov.discloseDerivation !== false,
      };
    }
  }
  return {
    abstract: "",
    hypotheses: [],
    sections: [],
    replicationNotes: "",
    samplingPlan: emptyField(),
    analysisPlan: emptyField(),
    variables: [],
    expectedOutcomes: [],
    originalStudy: emptyField(),
    targetEffect: emptyField(),
    differences: emptyField(),
    discloseDerivation: true,
  };
}

/** Read the block array out of a (possibly empty/unknown) definition_snapshot. */
export function readBlocks(snapshot: unknown): BlockInstance[] {
  if (snapshot && typeof snapshot === "object" && "blocks" in snapshot) {
    const b = (snapshot as { blocks?: unknown }).blocks;
    if (Array.isArray(b)) return b as BlockInstance[];
  }
  return [];
}

/** Derive module_version_locks (distinct triples) from the block set. */
export function locksFromBlocks(blocks: BlockInstance[]): ModuleLock[] {
  const seen = new Set<string>();
  const locks: ModuleLock[] = [];
  for (const b of blocks) {
    const ref = `${b.source}/${b.key}@${b.version}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      locks.push({ source: b.source, key: b.key, version: b.version });
    }
  }
  return locks;
}

/**
 * Validate (and normalize) a config against the referenced module's Zod schema.
 * Throws if the module is unknown or the config is structurally invalid.
 */
export function validateConfig(
  source: string,
  key: string,
  version: string,
  config: unknown,
): Record<string, unknown> {
  const def = getModuleDef(source, key, version);
  if (!def) throw new Error(`Unknown module ${source}/${key}@${version}`);
  return def.configSchema.parse(config);
}

/** Display name + completeness for a block (for cards + validation badges). */
export function blockDisplay(b: BlockInstance): {
  name: string;
  ref: string;
  complete: boolean;
} {
  const def = getModuleDef(b.source, b.key, b.version);
  return {
    name: def?.name ?? `${b.source}/${b.key}`,
    ref: `${b.source}/${b.key}@${b.version}`,
    complete: def ? def.isComplete(b.config) : false,
  };
}

export type BlockRef = { instanceId: string; name: string; ref: string };
export type BlockDiff = {
  added: BlockRef[];
  removed: BlockRef[];
  changed: BlockRef[];
  unchangedCount: number;
};

/** Stable JSON for config comparison (key order shouldn't count as a change). */
function stableConfig(c: Record<string, unknown>): string {
  return JSON.stringify(c, Object.keys(c).sort());
}
function refOf(b: BlockInstance): BlockRef {
  const d = blockDisplay(b);
  return { instanceId: b.instanceId, name: d.name, ref: d.ref };
}

/**
 * Divergence of a forked study's blocks from its source (ADR-0018), aligned by
 * `instanceId` — forks preserve instanceIds, so a matching id means "same
 * block, possibly edited". A block is `changed` when its module ref
 * (source/key@version) or its config differs. Pure + deterministic.
 */
export function diffBlocks(parent: BlockInstance[], child: BlockInstance[]): BlockDiff {
  const byParent = new Map(parent.map((b) => [b.instanceId, b]));
  const byChild = new Map(child.map((b) => [b.instanceId, b]));

  const added = child.filter((b) => !byParent.has(b.instanceId)).map(refOf);
  const removed = parent.filter((b) => !byChild.has(b.instanceId)).map(refOf);

  const changed: BlockRef[] = [];
  let unchangedCount = 0;
  for (const c of child) {
    const p = byParent.get(c.instanceId);
    if (!p) continue; // counted in `added`
    const refChanged = `${p.source}/${p.key}@${p.version}` !== `${c.source}/${c.key}@${c.version}`;
    const configChanged = stableConfig(p.config) !== stableConfig(c.config);
    if (refChanged || configChanged) changed.push(refOf(c));
    else unchangedCount += 1;
  }
  return { added, removed, changed, unchangedCount };
}

/* ---------- config-level diff summaries (ADR-0020 §A6 + V1.14.1 follow-up) ---------- */

const shorten = (v: unknown, max = 28): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const humanizeKey = (key: string): string =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

type AnyField = { key: string; label?: string; type?: string; required?: boolean; options?: string[] };

/** Field-group `fields` diff by frozen key → "+ Field …" / "− Field …" / "~ Field …". */
function diffFieldSpecs(oldF: AnyField[], newF: AnyField[]): string[] {
  const out: string[] = [];
  const byOld = new Map(oldF.map((f) => [f.key, f]));
  const byNew = new Map(newF.map((f) => [f.key, f]));
  for (const f of newF) if (!byOld.has(f.key)) out.push(`+ Field “${f.label ?? f.key}”`);
  for (const f of oldF) if (!byNew.has(f.key)) out.push(`− Field “${f.label ?? f.key}”`);
  for (const f of newF) {
    const o = byOld.get(f.key);
    if (!o) continue;
    const what: string[] = [];
    if (o.label !== f.label) what.push(`renamed “${o.label}” → “${f.label}”`);
    if (o.type !== f.type) what.push(`type ${o.type} → ${f.type}`);
    if ((o.required === true) !== (f.required === true)) what.push(f.required ? "now required" : "now optional");
    if (JSON.stringify(o.options ?? []) !== JSON.stringify(f.options ?? [])) what.push("options changed");
    if (what.length) out.push(`~ Field “${o.label ?? o.key}”: ${what.join(", ")}`);
  }
  return out;
}

/**
 * Human-readable summary of WHAT changed between two configs of the same block
 * (compare view's Modified nodes). Field-group fields diff by key; string
 * arrays list additions/removals; scalars show old → new. Pure.
 */
export function summarizeConfigDiff(oldBlock: BlockInstance, newBlock: BlockInstance): string[] {
  const out: string[] = [];
  const oldRef = `${oldBlock.source}/${oldBlock.key}@${oldBlock.version}`;
  const newRef = `${newBlock.source}/${newBlock.key}@${newBlock.version}`;
  if (oldRef !== newRef) out.push(`~ Module ${oldRef} → ${newRef}`);

  const oc = oldBlock.config ?? {};
  const nc = newBlock.config ?? {};
  for (const key of new Set([...Object.keys(oc), ...Object.keys(nc)])) {
    const a = oc[key];
    const b = nc[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (key === "fields" && Array.isArray(a) && Array.isArray(b)) {
      out.push(...diffFieldSpecs(a as AnyField[], b as AnyField[]));
      continue;
    }
    if (!(key in nc)) {
      out.push(`− ${humanizeKey(key)}`);
      continue;
    }
    if (!(key in oc)) {
      out.push(`+ ${humanizeKey(key)}: ${shorten(b)}`);
      continue;
    }
    if (Array.isArray(a) && Array.isArray(b) && a.every((x) => typeof x === "string") && b.every((x) => typeof x === "string")) {
      const added = (b as string[]).filter((x) => !(a as string[]).includes(x));
      const removed = (a as string[]).filter((x) => !(b as string[]).includes(x));
      const bits = [
        ...added.map((x) => `+ “${shorten(x, 18)}”`),
        ...removed.map((x) => `− “${shorten(x, 18)}”`),
      ];
      out.push(`~ ${humanizeKey(key)}: ${bits.length ? bits.join(", ") : "reordered"}`);
      continue;
    }
    out.push(`~ ${humanizeKey(key)}: ${shorten(a)} → ${shorten(b)}`);
  }
  return out;
}

/**
 * Align a child block list to its parent for diffing when instanceIds can't be
 * trusted (e.g. seeded forks): blocks already matching by id stay; leftover
 * children adopt a leftover parent's id when content-identical (same module ref
 * + config), then when same module ref in order (≈ modified) — GitHub-style
 * rename detection. Returns the aligned copy + childId → alignedId map. Pure.
 */
export function alignBlocksForDiff(
  parent: BlockInstance[],
  child: BlockInstance[],
): { aligned: BlockInstance[]; idMap: Map<string, string> } {
  const parentIds = new Set(parent.map((b) => b.instanceId));
  const childIds = new Set(child.map((b) => b.instanceId));
  const freeParents = parent.filter((b) => !childIds.has(b.instanceId));
  const claimed = new Set<string>();
  const idMap = new Map<string, string>();

  const refOfB = (b: BlockInstance) => `${b.source}/${b.key}@${b.version}`;
  // Pass 1: identical content (ref + config).
  for (const c of child) {
    if (parentIds.has(c.instanceId)) continue;
    const match = freeParents.find(
      (p) => !claimed.has(p.instanceId) && refOfB(p) === refOfB(c) && stableConfig(p.config) === stableConfig(c.config),
    );
    if (match) {
      claimed.add(match.instanceId);
      idMap.set(c.instanceId, match.instanceId);
    }
  }
  // Pass 2: same module ref, in order (likely the same block, edited).
  for (const c of child) {
    if (parentIds.has(c.instanceId) || idMap.has(c.instanceId)) continue;
    const match = freeParents.find((p) => !claimed.has(p.instanceId) && refOfB(p) === refOfB(c));
    if (match) {
      claimed.add(match.instanceId);
      idMap.set(c.instanceId, match.instanceId);
    }
  }
  const aligned = child.map((c) => {
    const to = idMap.get(c.instanceId);
    return to ? { ...c, instanceId: to } : c;
  });
  return { aligned, idMap };
}

/** Change line for a block whose screen-group membership differs between two
 *  versions (compare view); null = no grouping change. Titles compare loosely
 *  (group ids differ across forks). Pure. */
export function groupChangeLine(oldTitle: string | null, newTitle: string | null): string | null {
  const a = oldTitle?.trim() || null;
  const b = newTitle?.trim() || null;
  if (a === b) return null;
  if (a === null) return `~ Grouped under “${b}”`;
  if (b === null) return `~ Removed from group “${a}”`;
  return `~ Moved from group “${a}” to “${b}”`;
}
