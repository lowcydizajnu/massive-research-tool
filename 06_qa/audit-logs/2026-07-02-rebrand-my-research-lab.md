# QA audit — 2026-07-02 — rebrand to "My Research Lab" + legal v2 + app footer

## Overview

- **Auditor:** Claude (agent), at the owner's direction. Owner decisions locked via
  AskUserQuestion: product name = **"My Research Lab"**; **rename the legal documents
  too** (accepting the re-acceptance prompt).
- **Scope:** Unify the product name (the app said "Massive Research Tool" in some
  places, "Massive Research Lab" in others; the marketing site already said "My
  Research Lab"). Rename all user-facing copy → **My Research Lab**, bump the legal
  documents to v2 (which re-prompts every existing user to re-accept), and move the
  legal / product-tour links out of Settings into a global app footer.
- **Consent-sensitive** (legal-baseline LG1/LG3). **Verdict:** done — tsc/lint clean,
  **921 vitest green**, build 25/25, manifest validator clean (259). **No migration**
  (legal acceptances are version-tracked rows; bumping the constant needs no schema
  change).

## What changed

- **Rename (15 code files, non-legal):** app + auth page titles, Settings copy, the
  onboarding tour title, study/legal PDFs, citation strings, OSF push text, email
  templates, and the seeded system-user display name → "My Research Lab". A single
  `perl` swap of both old variants; verified zero "Massive Research" remain outside
  the immutable legal bodies.
- **Legal v2 (`lib/legal/content.ts`):** v1 bodies kept **byte-for-byte** (audit
  trail — what users actually accepted); v2 bodies **derived** from v1 via a pure
  string swap (`rebrandLegal`), so the only difference is the service name.
  `CURRENT_LEGAL_VERSION` bumped `1 → 2` for Terms, Privacy, and Cookies →
  `LegalUpdateModal` re-prompts existing users on next sign-in (LG3), and the cookie
  banner re-appears; `summaryOfChanges` explains it's a name-only change with no change
  to rights or data handling. New sign-ups accept v2 in `finalizeOnboarding`.
- **App footer (`components/chrome/app-footer.tsx`):** a slim global footer pinned to
  the bottom of the (app) shell (`mt-auto`) with Terms · Privacy · Cookies · Your
  acceptances · Replay the tour. The equivalent links were removed from Settings →
  Account (a one-line pointer to the footer replaces them).

## Correctness / risk notes

- **Audit integrity:** v1 legal text is unchanged; `getLegalDoc(kind, 1)` still returns
  exactly what a v1-accepting user agreed to. Only the in-force version and the v2 body
  differ.
- **No promotion of unshipped features** and no rights/data-handling change — the rename
  is cosmetic to the legal substance (stated in the change summary).
- **Landing site parity:** marketing pages already used "My Research Lab", so the app is
  now consistent end to end.
- **Internal/repo docs unchanged** (CLAUDE.md, STATUS, ADRs, the repo folder name still
  say "Massive Research Tool") — that's the project/repo identity, a separate call from
  the user-facing product name; flagged, not touched.

## Tests

- Existing legal/consent/finalize suites (`legal.test.ts`, `cookie-consent.test.ts`,
  `consent-cookie.test.ts`, `finalize.test.ts`) pass against v2 — they assert relative
  behavior (accept current version, re-prompt on mismatch), not a hardcoded "1".

## Verification

- `npm run typecheck` / `npm run lint` / `npx vitest run` (921) / `npm run build` —
  clean. `python3 00_meta/manifest/validate.py` — clean. Deploy: pending owner "deploy";
  verify at myresearchlab.app/api/health. Post-deploy: existing users will see the
  re-accept modal once.
