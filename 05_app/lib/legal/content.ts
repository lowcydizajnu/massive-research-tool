/**
 * Legal document content + versions (ADR-0072 prereq / legal-baseline LG1).
 *
 * Content is OWNER-AUTHORED (generated from Termly/Termageddon, then pasted into
 * the `body` markdown below). It lives as TS modules — not `.md` files read at
 * runtime — because Vercel's serverless file-tracing doesn't reliably include
 * arbitrary `content/*.md` reads, whereas a static import is always bundled.
 *
 * Versioning: each kind keeps every version it has ever published (audit-safe —
 * a researcher who accepted v1 can always retrieve the exact text). `CURRENT`
 * points at the in-force version; bumping it (after adding a new version entry)
 * is what triggers the re-prompt flow (legal-baseline LG3, later PR).
 *
 * ⚠️ The bodies below are PLACEHOLDERS. Owner replaces each with the generated
 * legal text before opening signup. Keep the frontmatter fields accurate.
 */
export type LegalKind = "terms" | "privacy" | "cookies";

export type LegalDoc = {
  version: number;
  effectiveDate: string; // ISO date
  summaryOfChanges: string;
  body: string; // markdown
};

export const LEGAL_TITLES: Record<LegalKind, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  cookies: "Cookie Policy",
};

/** In-force version per kind. Bump only after adding the new version entry below. */
export const CURRENT_LEGAL_VERSION: Record<LegalKind, number> = {
  terms: 1,
  privacy: 1,
  cookies: 1,
};

const PLACEHOLDER = (kind: string) =>
  `> **Draft — not yet finalized.** This ${kind} is a placeholder awaiting the generated, reviewed text. Do not rely on it.\n\n` +
  `Massive Research Lab will publish the full ${kind} here before opening sign-ups. Questions in the meantime: **privacy@myresearchlab.app**.`;

export const LEGAL_CONTENT: Record<LegalKind, Record<number, LegalDoc>> = {
  terms: {
    1: { version: 1, effectiveDate: "2026-06-26", summaryOfChanges: "Initial version", body: PLACEHOLDER("Terms of Service") },
  },
  privacy: {
    1: { version: 1, effectiveDate: "2026-06-26", summaryOfChanges: "Initial version", body: PLACEHOLDER("Privacy Policy") },
  },
  cookies: {
    1: { version: 1, effectiveDate: "2026-06-26", summaryOfChanges: "Initial version", body: PLACEHOLDER("Cookie Policy") },
  },
};

export function isLegalKind(s: string): s is LegalKind {
  return s === "terms" || s === "privacy" || s === "cookies";
}

/** Resolve a doc by kind + optional version (defaults to the in-force version). */
export function getLegalDoc(kind: LegalKind, version?: number): LegalDoc | null {
  const v = version ?? CURRENT_LEGAL_VERSION[kind];
  return LEGAL_CONTENT[kind][v] ?? null;
}
