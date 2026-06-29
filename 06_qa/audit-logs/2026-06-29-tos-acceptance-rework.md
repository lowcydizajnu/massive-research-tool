# QA audit — 2026-06-29 — ToS/Privacy acceptance rework (feedback #9)

## Overview

- **Auditor:** Claude (agent), at the owner's direction (feedback batch, "go with your plan / continue"). Owner decisions locked via AskUserQuestion: decline→sign-out; required terms preselected+disabled; marketing optional, OFF by default.
- **Scope:** Rework the Terms/Privacy acceptance surfaces (signup gate + version-bump re-prompt modal) and add a distinct marketing-consent field. Consent-sensitive (ADR-0014 PII-safety; legal baseline LG3).
- **Verdict:** done — **850 vitest green**, tsc/lint/build clean, manifest validator clean. Migration 0052 (additive, backward-safe).

## What changed

- **Migration 0052** (`user.marketing_opt_in boolean NOT NULL DEFAULT false`) — a GDPR-clean opt-IN, deliberately distinct from the engagement-digest opt-out (`email_digest_opted_out`).
- **`finalizeOnboarding`** — accepts `marketingOptIn`, persists it on the user insert + conflict update; ToS+Privacy acceptance recording in `legal_acceptance` unchanged.
- **Signup gate** (`app/(auth)/signup/page.tsx`) — ToS + Privacy now render as **checked + disabled "Required" rows** (with their `/legal/*` links); one **optional marketing** checkbox (default off); a **"Decline and sign out"** button (`useClerk().signOut({ redirectUrl: "/" })`). Completing signup is the clickwrap consent.
- **Legal-update modal** — outstanding docs render as required rows; kept "I agree to the updated terms"; added **"Decline and sign out"**.
- **Settings** — `me.emailPrefs` now returns `marketingOptIn`; new `me.setMarketingOptIn`; a "Product & marketing emails" control in the account notifications section (optimistic, mirrors the engagement opt-out).

## Consent-correctness notes

- Required terms are mandatory (no opt-out path except declining, which signs the user out and creates no account / records no acceptance) — acceptance is only written when the user proceeds.
- Marketing is a separate, explicit opt-in (off by default); recorded as its own column and editable any time in Settings — not bundled with the required terms.
- No PII added; the new column is a boolean preference on the existing user row.

## Tests

- `server/onboarding/__tests__/finalize.test.ts` — asserts `marketingOptIn` persists true and false.
- `server/trpc/__tests__/me.test.ts` (new) — defaults false, round-trips, and is independent of the engagement opt-out.

## Verification

- `npm run typecheck` / `npm run lint` / `npm run build` — clean.
- `npx vitest run` — 850 passed (110 files).
- `python3 00_meta/manifest/validate.py` — clean.
- ⚠️ Deploy: run `db:migrate:prod` (0052) BEFORE push.
