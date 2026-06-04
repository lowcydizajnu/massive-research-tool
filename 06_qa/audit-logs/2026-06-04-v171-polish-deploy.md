# QA audit — 2026-06-04 — V1.7.1 polish deploy

## Overview

- **Scope:** the V1.7.1 polish PR (items 1, 2, 3, 5, 6, 7 from `handoffs/code-tab-v171-polish.md`) — loading spinners, CI-gate fix, Versions sub-tab, Google OAuth dead-end fix, versioning "Draft" semantics, deploy:verify procedure. No new ADRs (amendments to 0012 + 0016).
- **Deployed:** commit **`1cbcee7`** to `https://myresearchlab.app` (Vercel auto-deploy on push to `main`). Tagged **`v1.7.1`**.
- **Status:** ✅ **shipped + smoke-verified live.** Two manual steps remain owner-only (below); neither blocks what's live.

## Verification

- **CI / unit:** 159 vitest green; typecheck clean; production `next build` clean (verified pre-push).
- **Live SHA:** `GET https://myresearchlab.app/api/health` → `{"ok":true,"version":"1cbcee7"}` (matches the deployed commit).
- **Smoke (read-only, from CI/agent):**
  - `GET /` → 307 (auth redirect — expected)
  - `GET /signin` → 200
  - `GET /studies` → 307 (auth redirect — expected)
  - `GET /api/health` → 200
- **Not run from here (deliberate):** the gated researcher-surface axe spec + the multi-user network/publish-and-run e2e against production. Both **write real data** into the production DB (the network spec creates a study, comments, and a fork; the axe spec creates a study) and need prod-Clerk testing-token config. Run `npm run deploy:verify` from `05_app/` with `.env.production` when you want the full pass (it aggregates smoke + axe + e2e and appends results here).

## Owner-only remaining (cannot be done from the agent)

1. **Clerk account-linking (item 5b)** — enable "link accounts via verified email" in the Clerk **Production** dashboard, per `04_architecture/handoffs/clerk-oauth-identity-linking.md`. This is the *root-cause* fix for the Google sign-in dead-end; the code fixes (5a/5c/5d) make the failure graceful, but the clean "Google = same user" merge needs this toggle. **Verify the Google sign-in flow on production after enabling.**
2. **Full `deploy:verify` run** against production (writes test data — see above) + sign-off.

## Known caveats carried

- **Item 5d (`/signup` pending-OAuth pickup) is UNVERIFIED against the live Clerk instance** — Clerk's `missing_requirements` completion is instance-specific. Worst case is now a clear error, not a silent loop, but confirm the real Google flow post-5b.
- A few low-frequency buttons (add/remove block, tag add, comment resolve/delete) remain disable-only (no spinner) — noted in the item-1 commit; opportunistic follow-up.

## Sign-off

- [x] Agent: V1.7.1 deployed (`1cbcee7`), smoke-verified, tagged `v1.7.1`. Code complete; CI/unit green.
- [ ] **Owner:** enable Clerk account-linking + verify the Google flow → then this release is fully closed.
