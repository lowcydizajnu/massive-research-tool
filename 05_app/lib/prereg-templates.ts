/**
 * Preregistration-template controlled list (ADR-0101 — the LOS PLAN gap).
 * `definition_snapshot.overview.templateKey` stores the key; it structures which
 * typed plan fields the Overview stage shows, and (server-side) which OSF
 * registration schema the plan files under.
 *
 * In-repo on purpose, NOT a seeded DB table: a seeded catalogue is invisible in
 * prod until `db:seed:prod` runs, and these are static schema definitions rather
 * than workspace content. Client-safe + pure (no env, no server imports) so the
 * picker island can import it directly — mirrors `lib/licenses.ts`.
 *
 * VOCABULARY: user-facing copy says "Preregistration template". This is NOT a
 * `workspace_template` (a starter study design) and NOT the retired "Framework"
 * primitive (which templated the design — the wrong layer for LOS's PLAN pillar).
 */
/** Verified live against api.osf.io 2026-07-12/17. */
const RECIPE_SCHEMA_NAME = "Replication Recipe (Brandt et al., 2014): Pre-Registration";

export type PreregTemplateKey =
  | "open-ended"
  | "osf-preregistration"
  | "as-predicted"
  | "social-psychology"
  | "secondary-data"
  | "replication-recipe"
  | "osf-standard-pre-data";

/** A typed plan field a template can ask for. */
export type PlanFieldKey =
  | "originalStudy"
  | "targetEffect"
  | "samplingPlan"
  | "variables"
  | "expectedOutcomes"
  | "analysisPlan"
  | "differences";

export type PreregTemplateInfo = {
  key: PreregTemplateKey;
  label: string;
  /** One-line researcher-facing description, shown under the label in the picker. */
  description: string;
  /**
   * The typed plan fields this template asks for, in display order. THIS is what
   * makes the choice mean something: picking a template changes which questions
   * the plan puts in front of you, mirroring how OSF's registration templates
   * work. A picker that changed nothing on screen would be indistinguishable
   * from a broken one (owner, 2026-07-15).
   *
   * Fields are additive on one overview object, so switching templates hides a
   * field but never destroys its stored value.
   */
  fields: PlanFieldKey[];
  /**
   * OSF's schema NAME. Selection is by name at push time because
   * `filter[name]` 400s on OSF's API, so `resolveSchemaId` matches
   * `attributes.name` client-side. Match EXACTLY (`===`) — all 44 names are
   * unique verbatim, but "Character Lab Registration" and "Character Lab
   * Registration " (trailing space) collide under any normalising match.
   */
  schemaName: string;
  /**
   * The id + version we last verified (live, 2026-07-17). NOT used to select —
   * recorded so drift is DETECTABLE (ADR-0107 D3). OSF revises schemas in place:
   * "OSF Preregistration" is already at schema_version 4.
   */
  schemaId: string;
  schemaVersion: number;
  /**
   * How many questions the template asks, for the picker. Total, never
   * "16 required" — a bare required-count reads as a threat before the
   * researcher has seen a single question (wireframe: osf-template-questions).
   */
  questionCount: number;
  /**
   * True when the template's questions are rendered generically from live
   * `schema_blocks` rather than mapped from typed plan fields (ADR-0107 D1).
   * Open-ended's single `summary` is composed by `osf-recipe`, not asked.
   */
  asksOsfQuestions: boolean;
};

/** Ordered for the picker — the default first. */
export const PREREG_TEMPLATES: PreregTemplateInfo[] = [
  {
    key: "open-ended",
    label: "Open-ended",
    description: "A free-form plan. Everything you write is filed as one summary.",
    fields: ["samplingPlan", "variables", "expectedOutcomes", "analysisPlan"],
    schemaName: "Open-Ended Registration",
    schemaId: "5df83f7dd28338001ac0ab0d",
    schemaVersion: 3,
    questionCount: 1,
    // Its one question (`summary`) is REQUIRED — ADR-0101's claim that this
    // template is all-optional was false (Am. 2). We are safe only because
    // `registry.osf.ts` always fills it via buildSummary. Not asked generically:
    // the abstract/hypotheses/protocol compose into it.
    asksOsfQuestions: false,
  },
  {
    key: "osf-preregistration",
    label: "OSF preregistration",
    description: "OSF's standard template. The most widely recognised — and the most detailed.",
    // Typed fields still render: they are the researcher's own plan and they
    // feed the record. OSF's own questions are asked separately and generically.
    fields: ["samplingPlan", "variables", "expectedOutcomes", "analysisPlan"],
    schemaName: "OSF Preregistration",
    schemaId: "697b72f611a8e98484c6139b",
    schemaVersion: 4,
    questionCount: 29, // 16 required
    asksOsfQuestions: true,
  },
  {
    key: "social-psychology",
    label: "Social psychology (van 't Veer & Giner-Sorolla)",
    description: "Written for social-psychology experiments. The most thorough of the general templates.",
    fields: ["samplingPlan", "variables", "expectedOutcomes", "analysisPlan"],
    schemaName: "Pre-Registration in Social Psychology (van 't Veer & Giner-Sorolla, 2016): Pre-Registration",
    schemaId: "67d063819403e9177dc48d5a",
    schemaVersion: 4,
    questionCount: 53, // 19 required — the largest general-purpose form we offer
    asksOsfQuestions: true,
  },
  {
    key: "secondary-data",
    label: "Secondary data",
    description: "For analysing a dataset you did not collect yourself.",
    fields: ["samplingPlan", "variables", "expectedOutcomes", "analysisPlan"],
    schemaName: "Secondary Data Preregistration",
    schemaId: "64775783798e08000a70407e",
    schemaVersion: 3,
    questionCount: 27, // 9 required
    asksOsfQuestions: true,
  },
  {
    key: "as-predicted",
    label: "AsPredicted",
    description: "AsPredicted's eight short questions — filed to OSF, not to aspredicted.org.",
    fields: ["samplingPlan", "variables", "expectedOutcomes", "analysisPlan"],
    schemaName: "Preregistration Template from AsPredicted.org",
    schemaId: "64bab305769023000d0acdc0",
    schemaVersion: 4,
    questionCount: 11, // 0 required — verified live
    asksOsfQuestions: true,
  },
  {
    key: "replication-recipe",
    label: "Replication recipe",
    description: "Structured for replicating an existing finding (Brandt et al., 2014).",
    // The three extra fields are the Recipe's own OSF questions (77-12 original
    // study, 77-2 target effect, 77-73 differences). Before this they existed only
    // as sections auto-seeded onto forks, so a non-fork picking Recipe had nowhere
    // to state them — the template was half-built.
    fields: [
      "originalStudy",
      "targetEffect",
      "samplingPlan",
      "variables",
      "expectedOutcomes",
      "analysisPlan",
      "differences",
    ],
    schemaName: RECIPE_SCHEMA_NAME,
    schemaId: "64b14a08d639e5000d2013a5",
    schemaVersion: 1,
    questionCount: 28, // 0 required
    // Mapped, not asked: its 5 keys (77-2/12/33/73/80) were verified live
    // 2026-06-12 and are fed from typed plan fields by `osf-recipe`.
    asksOsfQuestions: false,
  },
  {
    key: "osf-standard-pre-data",
    label: "Pre-data-collection (OSF standard)",
    description: "A short record that you planned before collecting.",
    fields: ["samplingPlan", "analysisPlan"],
    schemaName: "OSF-Standard Pre-Data Collection Registration",
    schemaId: "564d31db8c5e4a7c9694b2c0",
    schemaVersion: 2,
    questionCount: 3, // 0 required
    asksOsfQuestions: true,
  },
];

/**
 * The Replication Recipe's OSF schema name. Lives here, with the rest of the
 * binding, rather than in `osf-recipe.ts` — the registry is the one place a
 * template's OSF identity belongs (ADR-0107 D7). Re-exported there for the
 * existing importers.
 */
export const RECIPE_SCHEMA_NAME_VALUE = RECIPE_SCHEMA_NAME;

/** Non-empty tuple of keys for `z.enum(...)` on the write path. */
export const PREREG_TEMPLATE_KEYS = PREREG_TEMPLATES.map((t) => t.key) as [
  PreregTemplateKey,
  ...PreregTemplateKey[],
];

const BY_KEY = new Map(PREREG_TEMPLATES.map((t) => [t.key, t] as const));

export function isPreregTemplateKey(v: unknown): v is PreregTemplateKey {
  return typeof v === "string" && BY_KEY.has(v as PreregTemplateKey);
}

/**
 * Back-compat default (ADR-0101). A plan saved before item ⑤ has no stored
 * `templateKey`, so we reproduce exactly what `registry-push` used to decide
 * implicitly: a declared replication intent meant the Replication Recipe schema,
 * anything else meant Open-Ended. This is why item ⑤ needs no migration and why
 * no existing study silently changes the schema it files under.
 */
export function defaultTemplateKey(replicationIntent: string | null | undefined): PreregTemplateKey {
  return replicationIntent ? "replication-recipe" : "open-ended";
}

/** Resolve to display info; unknown/legacy keys fall back to the default. */
export function preregTemplate(key: string | null | undefined): PreregTemplateInfo {
  return (key && BY_KEY.get(key as PreregTemplateKey)) || BY_KEY.get("open-ended")!;
}

/** Does this template ask for the given typed field? */
export function templateAsks(key: string | null | undefined, field: PlanFieldKey): boolean {
  return preregTemplate(key).fields.includes(field);
}
