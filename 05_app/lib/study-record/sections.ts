/**
 * Study Record section registry (ADR-0054 §41) — the type catalogue the composer
 * palette renders and the resolver validates against. Mirrors the dashboard
 * widget registry (Stream F): a flat list of section *types*, grouped into
 * **bound** (auto-resolved from study data — reorder/show-hide only) and
 * **authored** (the owner writes the content). No DB imports — safe to import
 * from both client (palette) and server (validation/resolve).
 *
 * Authored content lives in two places by type: `abstract` and `article-link`
 * are backed by `study_record` columns (abstract / article_url+doi) because the
 * publish gate reads the abstract directly; `narrative` and `custom` carry their
 * prose in the layout entry's `content`. Bound sections never carry content.
 */
export type SectionGroup = "bound" | "authored";

export type SectionType = {
  key: string;
  label: string;
  group: SectionGroup;
  /** In the default layout (vs opt-in from the palette). */
  defaultOn: boolean;
  /** Authored types that may appear more than once (only `custom` today). */
  repeatable?: boolean;
  description: string;
};

export const SECTION_TYPES: SectionType[] = [
  { key: "abstract", label: "Abstract", group: "authored", defaultOn: true, description: "Plain-language summary. Required to publish a public record." },
  { key: "method", label: "Method", group: "bound", defaultOn: true, description: "Overview + protocol blocks + conditions — the comparable skeleton." },
  { key: "results", label: "Results", group: "bound", defaultOn: true, description: "Headline aggregate figures from the collected data." },
  { key: "data", label: "Data", group: "bound", defaultOn: true, description: "Browse / download — aggregate or derived only (never raw participants)." },
  { key: "preregistration", label: "Preregistration", group: "bound", defaultOn: true, description: "The frozen preregistered plan, if this study has one." },
  { key: "replications", label: "Replications", group: "bound", defaultOn: true, description: "Studies replicated from this one." },
  { key: "materials", label: "Materials", group: "bound", defaultOn: false, description: "Stimuli and uploaded materials." },
  { key: "narrative", label: "Results narrative", group: "authored", defaultOn: false, description: "Your prose interpretation of the findings." },
  { key: "article-link", label: "Article link", group: "authored", defaultOn: false, description: "DOI or journal URL for the published paper." },
  { key: "custom", label: "Custom section", group: "authored", defaultOn: false, repeatable: true, description: "A free-form section you write yourself." },
];

const BY_KEY = new Map(SECTION_TYPES.map((s) => [s.key, s]));

export function sectionType(key: string): SectionType | undefined {
  return BY_KEY.get(key);
}

/** Bound-section availability is keyed by these. */
export const BOUND_KEYS = SECTION_TYPES.filter((s) => s.group === "bound").map((s) => s.key);

/** The code-default layout — the on-by-default sections in reading order (ADR-0054 / wireframe). */
export const DEFAULT_LAYOUT: { type: string; hidden?: boolean }[] = SECTION_TYPES.filter(
  (s) => s.defaultOn,
).map((s) => ({ type: s.key }));

/** Drop unknown section types (forward-compat, same as the dashboard resolver). */
export function sanitizeLayout(
  layout: { type: string; content?: string; hidden?: boolean }[],
): { type: string; content?: string; hidden?: boolean }[] {
  return layout.filter((e) => BY_KEY.has(e.type));
}
