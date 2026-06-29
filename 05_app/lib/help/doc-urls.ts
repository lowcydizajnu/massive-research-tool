/**
 * Contextual-docs link map (EE4, ADR-0078). The SINGLE source of in-app doc
 * links: <HelpLink docKey="…"> resolves a key to `${DOCS_BASE}${DOC_URLS[key]}`.
 * `docKey` is a typed union, so a typo or removed page is a COMPILE error, not a
 * runtime dead link. Each path must correspond to a page under `docs/` (CI check
 * `scripts/check-docs-links.ts` flags entries with no live page).
 */
export const DOCS_BASE = "https://docs.myresearchlab.app";

export const DOC_URLS = {
  "getting-started.quickstart": "/getting-started/quickstart",
  "getting-started.signing-up": "/getting-started/signing-up",
  "getting-started.first-study": "/getting-started/your-first-study",
  "builder.blocks": "/builder/blocks",
  "builder.conditions": "/builder/conditions",
  "builder.variants": "/builder/variants",
  "builder.themes": "/builder/themes",
  "integrations.osf": "/integrations/osf",
  "integrations.prolific": "/integrations/prolific",
  "integrations.anthropic": "/integrations/anthropic",
  "methodology.preregistration": "/methodology/preregistration",
  "methodology.replication": "/methodology/replication",
  "methodology.ab-testing": "/methodology/ab-testing",
  "methodology.piloting": "/methodology/piloting",
  "methodology.irb": "/methodology/irb-checklist",
} as const;

export type HelpDocKey = keyof typeof DOC_URLS;

/** Absolute URL for a doc key. */
export function docUrl(key: HelpDocKey): string {
  return `${DOCS_BASE}${DOC_URLS[key]}`;
}
