# QA — Email-code auth: new users can create an account + sign in (ADR-0110)

**Date:** 2026-10-01
**Author:** Paweł Rosner
**Scope:** Fix the production login incident — new researchers could not create an account and then sign in.
**ADR:** [ADR-0110](../../04_architecture/adrs/0110-email-code-auth.md)
**No migration.** Clerk-side auth; `finalizeOnboarding` + DB schema unchanged.

## Incident

Owner report (2026-09-30→10-01), with Clerk logs + screenshots: real users (e.g. an `swps.edu.pl` researcher) hit "Couldn't find your account" at sign-in, and the owner's own Google attempt dead-ended at "That email already has an account — use the magic link." Signup via email never completed.

## Root causes (found by driving the real flow, not guessing)

Three compounding defects, all confirmed empirically on the dev instance:

1. **Magic-link fragility.** The app's email auth used Clerk magic links, which fail on the "require same device/browser" setting, email-scanner link pre-fetch, and the required-open-tab polling — and are not drivable by `@clerk/testing`, so the surface shipped with `test.fixme` coverage.
2. **Bot-protection 400.** Clerk Smart CAPTCHA is enabled, but the custom signup page never rendered the `<div id="clerk-captcha">` target — console: *"Cannot initialize Smart CAPTCHA widget… the `clerk-captcha` DOM element was not found"* → `signUp.create()` **400**.
3. **Password required on a passwordless app.** After the email code verified, Clerk returned `missingFields: ["password"]` — the instance requires a password, which a passwordless app never collects, so sign-up could never reach `complete`. It then fell through to a confusing `/signin?from=oauth-exists` dead-end.

Plus a flow bug introduced while fixing: the OAuth-pickup effect fired on *any* `missing_requirements` signup, skipping the code-entry step for email signups.

## Fix (ADR-0110)

- **Email 6-digit codes** for sign-up + sign-in, replacing magic links (robust + testable).
- **`<div id="clerk-captcha">`** added to the signup form (D5).
- **Transparent password** — a strong random secret set via `signUp.update({ password })` only when Clerk reports it missing; user never sees/uses it, sign-in is always a code (D6). No Clerk dashboard change needed.
- **OAuth transfer-to-sign-in** for an existing account clicking Google (D3), replacing the dead-end.
- **Gated the OAuth pickup** to the email-verified case so the code step isn't skipped.

## Verification (end-to-end, authenticated, on dev)

Driven with Playwright + `@clerk/testing` against `next dev`, using a fresh `+clerk_test` email and Clerk test code `424242`:

| Flow | Result |
| --- | --- |
| **New user sign-up** email → code → profile → workspace | **lands on `/studies`** (authenticated app renders: new "E2E Lab" workspace, Studies empty state, full nav) ✓ |
| **Sign-in** (fresh context, same email) email → code | **lands on `/studies`** ✓ |

So a brand-new user can create an account and then sign in — **with no Clerk configuration change**. Encoded as a committed regression test: `e2e/auth-email-code.spec.ts` (auth project).

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| `next lint` | 0 warnings/errors |
| full `vitest` suite | 1202 passing (131 files) |
| `validate.py` | clean — 24 types, 302 instances |

## Follow-up (same day) — production required a username too

First deploy (`87ebe9b`) fixed dev (which only required a password), but on **production** signup still dead-ended at the profile step: after the email code, prod Clerk reported a missing **username** as well (dev did not). Generalized the fix — `satisfyAutoFields` now fills **password and/or username** (whichever Clerk reports missing) in both the code-verify and profile-Continue steps, and when Clerk still blocks on a field we can't auto-fill the UI **names it** (`missingFieldsMessage`) instead of looping. The username is unique + email-derived, internal-only (sign-in stays an email code). Dev regression re-confirmed (signup → `/studies`). Could not drive the username path on dev (dev doesn't require it) — the diagnostic message is the guard if prod needs anything further.

## Notes / limits

- The CAPTCHA element fix was exercised with the testing-token bypass, so the live widget itself wasn't challenge-tested; the element is the Clerk-documented requirement and resolves the "element not found" 400.
- Production uses the live Clerk instance; `+clerk_test`/`424242` is a dev-mode convenience, so the authoritative prod check is a real signup after deploy. Dev verification + identical code path give high confidence.
- Existing accounts are unaffected (password is set only on new signups when required; sign-in is unchanged by whether an account has a password).
