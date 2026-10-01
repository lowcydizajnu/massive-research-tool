# ADR 0110 — Email verification codes for sign-up + sign-in (retire magic links)

- **Status:** accepted
- **Date:** 2026-09-30
- **Deciders:** Paweł Rosner
- **Tags:** auth, clerk, signup, signin, reliability

## Context

Auth was built on **email magic links** (ADR-0011, ADR-0016): the custom `/signup` and `/signin` pages (headless `useSignUp`/`useSignIn`, no Clerk prebuilt components — ADR-0007) call `createEmailLinkFlow()` / `startEmailLinkFlow()`, and the tab that sent the link polls until the link is opened.

In production this locked real users out (owner report, 2026-09-30, with Clerk logs + screenshots):

1. **Sign-up was fully broken for a period** — the Clerk instance's *sign-up* verification was set to **code only** (link unchecked), while the app sent a **link**. New email sign-ups failed, so people arrived at sign-in to "Couldn't find your account" (e.g. a real `swps.edu.pl` researcher).
2. **Magic links are inherently fragile for this audience.** Clerk's "Require the same device and browser" (on), the required-tab-open polling, and university mail scanners that pre-fetch links (consuming the one-time token) all produce silent failures. There is no fallback — the UI offers only magic link + Google, so any hiccup = locked out.
3. **Not testable.** `@clerk/testing` cannot drive the magic-link click or the Google consent screen, so the auth flow shipped with `test.fixme` e2e coverage — exactly the surface that then broke unseen.

Google OAuth also dead-ends for an existing account (separate issue — see Decision D3).

## Options considered

- **Keep magic links, just fix the Clerk toggles** (re-enable the sign-up link; relax same-device). Smallest change, but restores the fragile path (scanners, same-device, tab-polling) and the untestable surface; the incident would recur.
- **Email verification codes (chosen).** Cross-device, no tab polling, no scanner consumption, and testable via Clerk test mode. Matches what the instance already enables. Requires rewriting both pages' email step but removes the failure class.
- **Adopt real passwords.** Robust and self-contained, but contradicts the passwordless design (ADR-0007/0011/0016) and adds UX (password + reset). Rejected as the primary method; a random password is used only internally to satisfy a password-required instance (D6).
- **Ask the owner to change Clerk auth settings** (password/verification). Rejected as the fix of record: it's a production security-config change outside our code that had already drifted once; the app should be correct on its own (D5/D6).

## Decision

**D1 — Switch the primary email method from magic link to a 6-digit email verification code (`email_code`), for both sign-up and sign-in.** The custom pages keep the headless approach (ADR-0007 holds); only the strategy changes:
- Sign-up: `signUp.create({ emailAddress })` → `prepareEmailAddressVerification({ strategy: "email_code" })` → user types the code → `attemptEmailAddressVerification({ code })` → `setActive`.
- Sign-in: `signIn.create({ identifier })` → `prepareFirstFactor({ strategy: "email_code", emailAddressId })` → `attemptFirstFactor({ strategy: "email_code", code })` → `setActive`.

Codes work on any device, need no persisted tab, survive link scanners, and are **end-to-end testable** (Clerk test mode accepts `424242` for a `+clerk_test` address). This matches what the Clerk instance already has enabled for both sign-up and sign-in verification, so no dashboard change is required.

**D2 — Keep Google OAuth** as the secondary method, unchanged in intent.

**D3 — Fix the OAuth "existing account" dead-end** by performing Clerk's documented transfer: when a Google *sign-up* resolves to an email that already has an account, call `signIn.create({ transfer: true })` and `setActive` (links Google to the existing account and signs the user in) instead of bouncing to `/signin?from=oauth-exists`.

**D4 — The magic-link verify page (`/signup/verify`) is retired from the active flow** but left in place as a harmless catch for any link already in someone's inbox; it errors gracefully ("that link didn't work").

**D5 — Render Clerk's Smart CAPTCHA target (`<div id="clerk-captcha" />`) on the signup page.** Bot protection is enabled on the instance; without this element `signUp.create()` has nowhere to mount a challenge and **400s** for risk-flagged clients (confirmed in the console: *"Cannot initialize Smart CAPTCHA widget because the `clerk-captcha` DOM element was not found"* → 400). Clerk mounts the widget on demand.

**D6 — Satisfy a password-required instance transparently.** The instance was found to **require a password at sign-up** (`attemptEmailAddressVerification` → `missingFields: ["password"]`), which a passwordless app never collects, so sign-up could never complete. Rather than depend on a dashboard toggle (it had already drifted once) or bolt a password field onto a passwordless UX, the flow sets a **strong random secret** via `signUp.update({ password })` — but **only when Clerk reports it missing** (never when the method is optional/disabled). The user never sees or uses it; sign-in is always an email code. This keeps sign-up working with **no Clerk change** and robust to the setting drifting again.

**Why not** have the owner flip the Clerk password/verification settings? That was the first instinct, but (a) it's a production auth-security change outside our code, (b) it had already drifted once and could again, and (c) D5+D6 make the app itself correct and self-sufficient — the durable fix.

**Why not** just re-enable the sign-up link in Clerk (the quick config toggle)? It restores the fragile path and the untestable surface; it does not remove the same-device / scanner / tab-polling failure modes that produced the incident. Codes remove the class of failure.

## Consequences

- Supersedes the "email magic-link" auth-method choice in ADR-0011 and ADR-0016 (Google OAuth parts stand). ADR-0007 (headless, no prebuilt components) is unchanged.
- The flow is now covered by an authenticated e2e (`+clerk_test` + `424242`) instead of `test.fixme`.
- No DB migration; `finalizeOnboarding` and the onboarding steps are unchanged.
- Copy shifts from "Email me a sign-in link" / "Check your email" to "Email me a code" / a code-entry field.

## Revisit triggers

- Clerk ships a first-class passwordless-code component we'd adopt → revisit the headless custom UI.
- Deliverability of codes proves worse than links for some domains → reconsider offering both.
- We add a password or passkey method → this becomes one of several factors.

## References

- Supersedes auth-method parts of ADR-0011 (scaffold), ADR-0016 (production deployment). Retains ADR-0007 (headless auth, adapter discipline).
- Code — `05_app/app/(auth)/signin/page.tsx`, `05_app/app/(auth)/signup/page.tsx`, `05_app/app/(auth)/signup/sso-callback/page.tsx`, `05_app/app/(auth)/sso-callback/page.tsx`, `05_app/app/(auth)/signup/verify/page.tsx`.
- e2e — `05_app/e2e/auth-email-code.spec.ts`.
- `03_design/wireframes/signup-onboarding.md` (identify step).
