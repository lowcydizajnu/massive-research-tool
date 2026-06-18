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
  return ["abstract", "hypotheses", "narrative", "custom"].includes(type);
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
