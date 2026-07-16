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
export type PreregTemplateKey = "open-ended" | "replication-recipe";

export type PreregTemplateInfo = {
  key: PreregTemplateKey;
  label: string;
  /** One-line researcher-facing description, shown under the label in the picker. */
  description: string;
};

/** Ordered for the picker — the default first. */
export const PREREG_TEMPLATES: PreregTemplateInfo[] = [
  {
    key: "open-ended",
    label: "Open-ended",
    description: "A free-form plan. Everything you write is filed as one summary.",
  },
  {
    key: "replication-recipe",
    label: "Replication recipe",
    description: "Structured for replicating an existing finding (Brandt et al., 2014).",
  },
];

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
