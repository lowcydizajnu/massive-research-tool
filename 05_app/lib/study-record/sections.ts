/**
 * Study Record section registry (ADR-0054 §41, extended by ADR-0056). The type
 * catalogue the composer palette renders and the resolver validates against.
 * Mirrors the dashboard widget registry (Stream F): a flat list of section
 * *types*, grouped into **bound** (seeded from study data) and **authored**.
 *
 * v2 (ADR-0056): every section is an editable block — bound sections seed from
 * data but accept a `title`/`content` **override**, EXCEPT preregistration-
 * derived content, which is frozen once the study is preregistered. Authored
 * content is Markdown. Hypotheses are structured-but-freeform (optional
 * effect/statistic/analysis fields + prose), repeatable. No DB imports — safe to
 * import from both client (palette/composer) and server (validation/resolve).
 */
export type SectionGroup = "bound" | "authored";

export type SectionType = {
  key: string;
  label: string;
  group: SectionGroup;
  /** In the default layout (vs opt-in from the palette). */
  defaultOn: boolean;
  /** Authored types that may appear more than once (hypothesis, custom). */
  repeatable?: boolean;
  description: string;
};

/** Optional structured fields on a hypothesis block — all freeform/optional (ADR-0056). */
export type HypothesisFields = {
  effectType?: string; // e.g. difference / correlation / interaction
  direction?: string; // e.g. positive / negative / two-sided
  statisticKind?: string; // e.g. p / r / d / β / BF
  statisticValue?: string; // freeform so edge cases fit (e.g. "p < .001")
  analysis?: string; // e.g. t-test / ANOVA / regression
};

/**
 * A claim's binding back to the preregistered plan (ADR-0102).
 *
 * This is what makes the word "Preregistered" mean something: the researcher
 * declares one VERIFIABLE fact — "this claim tests H2 of the preregistration
 * filed as v3" — and the label is then derived by set membership, never typed.
 * There is deliberately no `preregistered: boolean` here to forge.
 *
 * `planVersionId` pins a specific FROZEN version. That is why a bare index is
 * safe: frozen snapshots are append-only (ADR-0002), so a specific version's
 * `hypotheses[]` can never renumber — unlike the working tip, where exactly this
 * renumber-on-delete bit `ExpectedOutcome.hypothesisIndex` in item ⑤.
 *
 * Kept OUT of `HypothesisFields` on purpose: `fields` is `Record<string,string>`
 * and `saveLayout` filters it with `v?.trim()`, so a numeric index would throw
 * and `0` would be silently dropped.
 */
export type ClaimBinding = {
  /** A frozen `kind='preregistered'` experiment_version id. */
  planVersionId: string;
  /** 1-based index into that version's `definition_snapshot.overview.hypotheses[]`. */
  hypothesisIndex: number;
  /** Report a bound claim as exploratory anyway. There is no upgrade counterpart. */
  exploratoryOverride?: boolean;
};

/** A section instance as stored in `study_record.layout` (jsonb — no migration to extend). */
export type RecordSection = {
  type: string;
  /** Editable override title (ADR-0056); falls back to the type's label. */
  title?: string;
  /** Authored Markdown, or a bound-section override. */
  content?: string;
  hidden?: boolean;
  /** Hypothesis structured fields. */
  fields?: HypothesisFields;
  /** Plan↔report binding on a `hypotheses` section (ADR-0102). */
  claim?: ClaimBinding;
};

export const SECTION_TYPES: SectionType[] = [
  { key: "abstract", label: "Abstract", group: "authored", defaultOn: true, description: "Plain-language summary + the published article link (DOI/URL). Required to publish a public record." },
  { key: "hypotheses", label: "Hypotheses", group: "authored", defaultOn: true, repeatable: true, description: "One per hypothesis (H1, H2, …) — optional effect / statistic / analysis fields + your prose." },
  { key: "method", label: "Method", group: "bound", defaultOn: true, description: "Overview + protocol blocks + conditions — seeded from your data, editable." },
  { key: "results", label: "Results", group: "bound", defaultOn: true, description: "Headline aggregate figures — seeded from the collected data, editable." },
  { key: "data", label: "Data", group: "bound", defaultOn: true, description: "Browse / download — aggregate or derived only (never raw participants)." },
  { key: "preregistration", label: "Preregistration", group: "bound", defaultOn: true, description: "The frozen preregistered plan — locked once preregistered." },
  { key: "replications", label: "Replications", group: "bound", defaultOn: true, description: "Studies replicated from this one." },
  { key: "materials", label: "Materials", group: "bound", defaultOn: false, description: "Stimuli and uploaded materials." },
  { key: "narrative", label: "Results narrative", group: "authored", defaultOn: false, description: "Your prose interpretation of the findings." },
  // ADR-0102. `defaultOn: false` on purpose: DEFAULT_LAYOUT seeds only at
  // ensureRecord() first-compose, so `true` would reach new records only and
  // quietly skip every existing one. Palette-only, no backfill (owner 2026-07-15).
  // NOT the same thing as an Amendment: a deviation is an execution/analysis
  // departure reported after the fact; an amendment is a plan-side change filed
  // via Preregister. Conflating them makes both meaningless.
  { key: "deviations", label: "Deviations", group: "authored", defaultOn: false, description: "What departed from your preregistered plan while running or analysing the study, and why." },
  { key: "custom", label: "Custom section", group: "authored", defaultOn: false, repeatable: true, description: "A free-form section you write yourself." },
];

const BY_KEY = new Map(SECTION_TYPES.map((s) => [s.key, s]));

export function sectionType(key: string): SectionType | undefined {
  return BY_KEY.get(key);
}

/** Bound-section availability is keyed by these. */
export const BOUND_KEYS = SECTION_TYPES.filter((s) => s.group === "bound").map((s) => s.key);

/** Authored types carry `content`/`fields`; the abstract also carries the article link. */
export function carriesAuthoredContent(type: string): boolean {
  return ["abstract", "hypotheses", "narrative", "deviations", "custom"].includes(type);
}

/**
 * Derive a claim's public label (ADR-0102). "Preregistered" is EARNED by a
 * binding that resolves to a real hypothesis in a real frozen preregistered
 * version — it is never stored and never typed. Anything else is "Exploratory",
 * which is the honest default rather than a penalty.
 *
 * `resolvesToHypothesis` is the caller's set-membership check (does
 * `planVersionId` name a frozen preregistered version of THIS study, and does
 * `hypothesisIndex` exist in its hypotheses?) — passed in so this stays pure and
 * client-safe. A dangling binding degrades to Exploratory rather than throwing:
 * we cannot evidence it, so we must not claim it.
 */
export function claimLabel(
  claim: ClaimBinding | undefined,
  resolvesToHypothesis: boolean,
): "preregistered" | "exploratory" {
  if (!claim || claim.exploratoryOverride) return "exploratory";
  return resolvesToHypothesis ? "preregistered" : "exploratory";
}

/**
 * Frozen sections cannot be edited (ADR-0056): preregistration-derived content
 * is immutable once the study is preregistered (ADR-0044). Everything else is an
 * editable override.
 */
export function isFrozenSection(type: string, hasPreregistration: boolean): boolean {
  return type === "preregistration" && hasPreregistration;
}

/** The code-default layout — the on-by-default sections in reading order (ADR-0054 / wireframe). */
export const DEFAULT_LAYOUT: RecordSection[] = SECTION_TYPES.filter((s) => s.defaultOn).map((s) => ({ type: s.key }));

/** Drop unknown section types (forward-compat, same as the dashboard resolver). */
export function sanitizeLayout(layout: RecordSection[]): RecordSection[] {
  return (layout ?? []).filter((e) => BY_KEY.has(e.type));
}
