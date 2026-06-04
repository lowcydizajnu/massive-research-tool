# Clerk dashboard step — OAuth identity linking (V1.7.1 item 5b)

**Owner-only. One-time, per Clerk environment (do it on the Production app; redo if you ever recreate the app).**

## Why

The Google OAuth sign-in dead-end (item 5) has a code half (5a/5c/5d, shipped) and a **dashboard half** that only you can do. The root cause: when a user first signed up with **email magic-link**, Clerk created a user with a verified email identity. Later signing in with **Google** on the *same email* creates a *separate* OAuth identity — and if Clerk isn't told to treat a verified email as the same account, it starts a brand-new signup instead of signing them in. That's the loop.

Enabling **account linking via verified email** makes Google sign-in on an existing email **merge into the same user** and complete straight to `/studies`.

## Steps

1. Clerk Dashboard → select the **Production** application (`myresearchlab.app`).
2. **User & Authentication → Social Connections (or SSO Connections) → Google** — confirm Google is enabled and the OAuth app is **Published** (not in "Testing"), so consent returns full identity.
3. **User & Authentication → Account linking** (Clerk has surfaced this under "Account linking" / "Authentication → Attack protection / linking" depending on dashboard version) → enable **"Use email address as a verified identifier to link accounts"** (a.k.a. "Link accounts with the same email address"). Set it to **link automatically when the email is verified** by both sides (magic-link verifies email; Google returns verified emails).
4. Save.

## Verify

- Sign in with Google using an email that already has a magic-link account → you land on `/studies` (no new user, no bounce to `/signup` or `/signin`).
- The gated e2e `e2e/a11y-...`/`hanna-*` auth project doesn't cover the link-merge directly (it needs two pre-seeded identities); verify manually once after enabling, then it's permanent for the environment.

## Notes

- This setting is **not** in `deploy-bootstrap.ts` — Clerk's Backend API doesn't expose account-linking config, so it stays a documented manual step (like the Clerk app shell + OSF app).
- If a deploy ever recreates the Clerk Production app, redo this step + re-run `npm run deploy:test-users`.
