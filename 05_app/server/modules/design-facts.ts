import { blockDisplay, readBlocks, type BlockInstance } from "./blocks";
import { getModuleDef } from "./registry";

/**
 * What a built study says about its own method — item ⑨ Phase A (ADR-0106).
 *
 * **Facts, never intent.** Every value here is read straight off the frozen
 * snapshot; nothing is inferred. That line is the whole design: OSF adds domain
 * templates because generic ones miss method-specific decisions, and the thing
 * we can do that OSF cannot is read the study that was actually built. What we
 * cannot do is read the researcher's mind, and a preregistration is a scientific
 * commitment — a derived field that overstates what the system knows is worse
 * than an empty one.
 *
 * So this derives block order, arms and weights, configured timings, and each
 * measure's response type. It does NOT derive:
 *
 * - **randomization** — nothing shuffles blocks today (`randomizeOrder` is
 *   option-order inside one question). "Presented in random order" is the most
 *   standard sentence in a method section and it would be a fabrication. When
 *   block-order randomization ships it must be DECLARED in the snapshot, and
 *   then it reads here like any other fact (ADR-0106 D1).
 * - **the analysis plan** — a response type is not a statistical test.
 * - **hypotheses / expected outcomes** — intent.
 * - **a variable's role** (iv/dv/covariate/exclusion) — intent. We surface the
 *   candidate and its data type; the researcher assigns meaning.
 * - **the construct measured** — no module carries a scale name or citation;
 *   guessing it from a prompt string is invention.
 * - **"treatment vs control"** — arm semantics are undeclared. Only "shown only
 *   to: <names>" is true.
 *
 * Computed on read, never stored (ADR-0106 D2): stored derived prose is a second
 * source of truth that silently disagrees with the blocks on the next edit. After
 * preregistration this recomputes from the FROZEN snapshot, so it always
 * describes the filed plan.
 *
 * Pure — snapshot + conditions in, facts out. Conditions are passed rather than
 * fetched because they live on `condition`, not in the snapshot.
 */

export type MeasureFact = {
  instanceId: string;
  /** The researcher's label if set, else the module's display name. */
  name: string;
  /** The question as the participant sees it, when the block has one. */
  prompt: string | null;
  /** The response type in researcher language — never a Zod dump. */
  responseType: string;
  /** Condition names this block is limited to; empty = everyone sees it. */
  shownOnlyTo: string[];
};

export type ArmFact = { name: string; weight: number };

export type TimingFact = { name: string; value: string };

export type DesignFacts = {
  /** Total screens, in the order they were built. */
  blockCount: number;
  /** True once block-order randomization ships AND is declared. Always false
   *  today — the copy must not claim randomization we do not perform. */
  randomized: false;
  arms: ArmFact[];
  timings: TimingFact[];
  measures: MeasureFact[];
  /** Response-collecting blocks not yet linked to a declared variable. */
  candidateVariables: {
    instanceId: string;
    /** A short starting name for the variable — the block's own label. The
     *  researcher renames it; we are not guessing at `accuracy_rating`. */
    name: string;
    /** The question, so a list of three Likerts is tellable apart. Two blocks
     *  of the same module have the SAME name, and picking blind is not a
     *  choice. */
    prompt: string | null;
    dataType: string;
  }[];
};

/** The response type, in words a researcher would use. Read from the block's
 *  own config where the module declares it; never inferred from the prompt. */
function responseType(b: BlockInstance): string {
  const cfg = b.config;
  const num = (k: string): number | null => (typeof cfg[k] === "number" ? (cfg[k] as number) : null);
  switch (b.key) {
    case "likert-7":
      return "7-point scale (1–7)";
    case "semantic-differential": {
      const p = num("points");
      return p ? `${p}-point semantic differential` : "Semantic differential";
    }
    case "rating-stars": {
      const m = num("max");
      return m ? `${m}-star rating` : "Star rating";
    }
    case "vas":
    case "slider": {
      const lo = num("min");
      const hi = num("max");
      return lo != null && hi != null ? `Slider (${lo}–${hi})` : "Slider";
    }
    case "nps":
      return "Net Promoter Score (0–10)";
    case "multiple-choice":
      return Array.isArray(cfg.options) ? `Choice of ${(cfg.options as unknown[]).length}` : "Multiple choice";
    case "free-text":
      return "Free text";
    case "yes-no":
      return "Yes / No";
    case "number":
      return "Number";
    case "ranking":
      return Array.isArray(cfg.options) ? `Ranking of ${(cfg.options as unknown[]).length}` : "Ranking";
    default: {
      const def = getModuleDef(b.source, b.key, b.version);
      return def?.name ?? b.key;
    }
  }
}

/** Configured timings, verbatim. Only what the researcher actually set. */
function timingOf(b: BlockInstance, name: string): TimingFact | null {
  const ms = b.config.exposureMs;
  if (typeof ms === "number") return { name, value: `${ms} ms` };
  const secs = b.config.waitSeconds;
  if (typeof secs === "number") return { name, value: `${secs} s` };
  return null;
}

const promptOf = (b: BlockInstance): string | null =>
  typeof b.config.prompt === "string" && b.config.prompt.trim() ? b.config.prompt.trim() : null;

export function deriveDesignFacts(
  snapshot: unknown,
  conditions: { slug: string; name: string; allocationWeight: number }[],
  declaredInstanceIds: string[] = [],
): DesignFacts {
  const blocks = readBlocks(snapshot);
  const bySlug = new Map(conditions.map((c) => [c.slug, c.name]));
  const declared = new Set(declaredInstanceIds);

  const measures: MeasureFact[] = [];
  const timings: TimingFact[] = [];
  const candidates: DesignFacts["candidateVariables"] = [];

  for (const b of blocks) {
    const def = getModuleDef(b.source, b.key, b.version);
    const name = b.title?.trim() || blockDisplay(b).name;

    const t = timingOf(b, name);
    if (t) timings.push(t);

    if (!def?.collectsResponse) continue;

    // Slugs → names. A slug with no matching condition is dropped rather than
    // rendered raw: a stale gate is not a fact about the arms.
    const shownOnlyTo = (b.visibility?.showIfCondition ?? [])
      .map((s) => bySlug.get(s))
      .filter((n): n is string => !!n);

    const type = responseType(b);
    const prompt = promptOf(b);
    measures.push({ instanceId: b.instanceId, name, prompt, responseType: type, shownOnlyTo });
    if (!declared.has(b.instanceId)) {
      candidates.push({ instanceId: b.instanceId, name, prompt, dataType: type });
    }
  }

  return {
    blockCount: blocks.length,
    randomized: false,
    // No declared conditions = one implicit group, which is what the runtime
    // actually does (a single `control` arm). Say that, rather than "0 arms".
    arms: conditions.map((c) => ({ name: c.name, weight: c.allocationWeight })),
    timings,
    measures,
    candidateVariables: candidates,
  };
}
