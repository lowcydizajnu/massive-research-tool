/**
 * App-owned system account + starter-template identifiers (ADR-0079).
 *
 * These ids are a CONTRACT shared by the seeder (`server/db/seed-misinfo-starter.ts`)
 * and the consumers (the Explore scenario CTA, the admin census filters). They are
 * fixed so re-seeding upserts the same rows (idempotent) and the CTA can target the
 * template without a runtime lookup. Changing one orphans its consumer.
 *
 * Importable from both client and server (no server-only deps) — the Explore
 * scenario content (`content/explore/scenarios.ts`) references the template id.
 */

/** The application's own user account — owns app-shipped starter source studies. */
export const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

/** The application's own workspace — holds the starter source studies. */
export const SYSTEM_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

/** Stable identity shown as the system account's author name + handle-free email. */
export const SYSTEM_USER_EXTERNAL_ID = "system-app";
export const SYSTEM_USER_EMAIL = "system@myresearchlab.app";
export const SYSTEM_USER_DISPLAY_NAME = "My Research Lab";
export const SYSTEM_WORKSPACE_NAME = "Starter templates";
export const SYSTEM_WORKSPACE_SLUG = "starter-templates";

/* ---- Misinformation starter (the first app-shipped starter, ADR-0079) ---- */

/** The system-owned source study the misinfo starter template freezes from. */
export const STARTER_MISINFO_EXPERIMENT_ID = "00000000-0000-4000-8000-000000000010";
/** The frozen named version the template clones (stable reference). */
export const STARTER_MISINFO_VERSION_ID = "00000000-0000-4000-8000-000000000011";
/**
 * The public `starter` workspace_template the Explore "Run a misinformation study"
 * scenario forks. `workspace_template.id` is a free-form text PK — this readable id
 * is intentional (vs a ULID) so the CTA wiring is legible.
 */
export const STARTER_MISINFO_TEMPLATE_ID = "starter-misinfo-v1";

/* ---- A/B test starter (feedback #7C) ---- */

/** The system-owned source study the A/B starter template freezes from. */
export const STARTER_AB_EXPERIMENT_ID = "00000000-0000-4000-8000-000000000020";
/** The frozen published version the template clones. */
export const STARTER_AB_VERSION_ID = "00000000-0000-4000-8000-000000000021";
/**
 * Fixed condition ids for the A/B starter's two arms. Conditions are real DB rows
 * (`condition` table, keyed by version) that `templates.useTemplate` clones into
 * the forked study — so the two `showIfCondition`-gated stimulus screens stay
 * wired after a fork. Fixed (vs ULID) so re-seeding upserts the same two arms.
 */
export const STARTER_AB_CONDITION_A_ID = "00000000-0000-4000-8000-000000000022";
export const STARTER_AB_CONDITION_B_ID = "00000000-0000-4000-8000-000000000023";
/** The public `starter` workspace_template the Explore "A/B test" scenario forks. */
export const STARTER_AB_TEMPLATE_ID = "starter-ab-v1";

/* ---- Pilot-a-measure starter (feedback #7C) ---- */

/** The system-owned source study the pilot starter template freezes from. */
export const STARTER_PILOT_EXPERIMENT_ID = "00000000-0000-4000-8000-000000000030";
/** The frozen published version the template clones. */
export const STARTER_PILOT_VERSION_ID = "00000000-0000-4000-8000-000000000031";
/** The public `starter` workspace_template the Explore "Pilot a measure" scenario forks. */
export const STARTER_PILOT_TEMPLATE_ID = "starter-pilot-v1";

/* ---- Quick opinion survey starter (the on-brand v0.7 starter) ---- */

/** The system-owned source study the survey starter template freezes from. */
export const STARTER_SURVEY_EXPERIMENT_ID = "00000000-0000-4000-8000-000000000040";
/** The frozen published version the template clones. */
export const STARTER_SURVEY_VERSION_ID = "00000000-0000-4000-8000-000000000041";
/** The public `starter` workspace_template — a clean general-purpose survey in the v0.7 look. */
export const STARTER_SURVEY_TEMPLATE_ID = "starter-survey-v1";
