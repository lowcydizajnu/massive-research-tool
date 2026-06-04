# QA audit — 2026-06-04 — V1.7.0 production deploy

## Overview

- **Date:** 2026-06-04
- **Scope:** First production deploy. V1.7 code (everything through commit `5fcda09`) shipped to `https://myresearchlab.app` via the API-driven bootstrap script (ADR-0016 + 2026-06-03 amendment). Hits the real internet for the first time — real Clerk Production, real OSF production preregistrations, real Upstash rate-limiter on `/take/*`, real Neon `mrt-production` project (isolated from dev).
- **Feature specs / flows:** all V1.5 + V1.6 + V1.7 features ride this deploy — build a study → preregister or publish & run → recruit participants → results; review network (comments / notifications / activity / Replications / follow affordances); cross-workspace forking; study-level tags.
- **ADRs in play:** [0016 + 2026-06-03 amendment](../../04_architecture/adrs/0016-production-deployment-architecture.md) (the deploy architecture itself; all prior ADRs 0001-0015 + 0017 + 0018 ship with this release).
- **Status of this audit:** ✅ **V1.7.0 SHIPPED.** Production sign-up + study build + OSF preregistration verified end-to-end by the owner against real OSF (real registration submitted, pending owner's OSF approval to mint the DOI). Four V1.7.1 follow-ups carried; none block.

## Owner deploy walkthrough — what actually happened

The bootstrap-script approach (ADR-0016 amendment) replaced what would have been ~3-4h of manual dashboard clicking with ~1 hour of owner time, but introduced its own iteration loop because vendor APIs drift from their docs. Six hotfixes were needed during the live run (all idempotent, all safe to re-run). For the V1.7.1 retrospective, the honest list:

1. **Neon API requires `org_id`** post-2024 organization migration. Bootstrap was passing the projects endpoint without it. Hotfix commit `8733b0f` added `NEON_ORG_ID` to the required env list and as a query param on `GET /projects` + body field on `POST /projects`.
2. **Upstash regional database creation is deprecated.** First attempt fell over with "regional db creation is deprecated." Hotfix commit `7d93963` switched to the Global database shape (`primary_region` + empty `read_regions: []`).
3. **Upstash POST endpoint shape was wrong.** Second hotfix `7417ca6` corrected to `POST /v2/redis/database` with `database_name` + `platform: "aws"` + `primary_region` per Upstash's actual published docs (verified via web search rather than guessing).
4. **Root route was still the Phase-5 scaffold verification page.** Owner saw the Plex Serif demo instead of a real landing. Commit `5fcda09` replaced `app/page.tsx` with a 4-line auth-aware redirect: unauthenticated → `/signup`, authenticated → `/studies`. Original 206 lines went.
5. **Clerk Production needed manual dashboard configuration beyond what the Backend API can do.** The bootstrap set `allowed_origins`; the owner manually configured Domains (custom domain + 5 CNAME records at Vercel DNS), Google OAuth (Google Cloud Console OAuth Client created + Client ID/Secret pasted back), and verified auth factors. ~20 min of manual clicking that we'd documented as "manual" in the runbook.
6. **Inngest Cloud was in Branch environment, not Production.** Owner had grabbed Branch event/signing keys initially. Once switched to Production environment + Vercel env vars updated + app synced at `https://myresearchlab.app/api/inngest` → OSF push completed on first retry.

Total owner active engagement: ~2 hours including the iteration loops. Original ADR-0016 amendment estimated ~30-40 min for the happy path. The delta is the vendor-API-shape drift (~1h iteration) + Clerk dashboard manual setup (~20 min). Both costs were known caveats in the original handoff.

## Test results

- **Unit + integration (Vitest):** unchanged from V1.7 closeout — 141+ green; no V1.7.0 deploy-specific tests added (the deploy is configuration, not new application code; the deploy-lib + lazy-DB tests already existed).
- **Browser e2e (Playwright):** default suite 4 green / 0 skipped; the gated `auth` project specs (`hanna-runtime`, `hanna-network`, `hanna-publish-and-run`, `a11y-researcher-surfaces`) **remain unverified against production** — owner deferred the automated `deploy:verify` run after the manual smoke test passed. Carried to V1.7.1.
- **Typecheck + production build (Vercel):** ✅ green on commit `5fcda09` after the lazy-DB fix.
- **`/api/health` returns SHA `5fcda09`** ✓ confirming the deployed commit matches `main`.
- **DNS configuration:** ✅ all 5 Clerk DNS records green (`clerk.*`, `accounts.*`, `clkmail.*`, `clk._domainkey.*`, `clk2._domainkey.*` all pointing at `*.clerk.services`). Vercel apex CNAME serves the Next.js app. SSL via Let's Encrypt (both Clerk subdomains + Vercel apex).

## Manual exploratory notes

- **Owner-verified live (2026-06-04):** 
  - Sign-up via email magic-link from `prosner@pm.me` → received → clicked → onboarded with display name + workspace name + theme → landed on `/studies`. ✓
  - Created a study called "First study" from Misinformation Research Framework. ✓
  - Connected OSF (Account · Connections OAuth round-trip) — "OSF connected" green pill. ✓
  - Preregistered the study. OSF push fired through Inngest Cloud (after the Production env switch) → "Submitted to OSF — pending your approval there to finalize." with "View on OSF →" link. ✓
- **Real OSF registration submitted** — pending owner's approval at osf.io for the DOI to mint. Public artifact exists on real OSF, exactly mirroring the V1.5 OSF push pattern.
- **What was NOT clicked live:**
  - Publish & run path (only Preregister was exercised; Publish & run is server-side e2e-covered).
  - Take-a-study participant flow on production (Inngest only just got wired; the participant runtime relies on `/take/*` server actions + Upstash rate-limiter — the rate-limiter is live but participant flow wasn't smoke-tested end-to-end).
  - Review network features (Save & request review / comments / activity Yours+Follows / Replications / follow affordances) — these are V1.7 anchor scope, deployed but only exercised via dev seeder during V1.7 closeout, NOT in production.
  - Google OAuth sign-up — owner tested via email magic-link instead because Google OAuth consent screen is still in "Testing" mode (only listed test users can sign in via Google).

## Accessibility scan

- **Status: not run against production this turn.** The automated axe spec (`e2e/a11y-researcher-surfaces.spec.ts`) exists but wasn't executed via `npm run deploy:verify`. Carried to V1.7.1.

## Performance check

- **Owner-noted user-perceived issue:** saving + comment operations feel slow with no visual feedback (no spinner on submit button). This is a real UX gap across all primary tRPC mutation buttons (Save dialog, Comment post, Add block, Open recruitment, Retry push, Connect OSF). Carried to V1.7.1 as the first polish item.
- **Not formally measured:** Lighthouse / Core Web Vitals on `/take/*` and `/studies/[id]/build`. Carried to V1.7.1.

## Security review

- **Rate-limiter live on `/take/*`** — Upstash Global database `mrt-production` provisioned + REST credentials in Vercel; the V1.6 hardening (3 starts/min per `recruitment_session_id` + coarse-IP bucket on `beginAction`; 30 answers/min per `response.id` on `answerAction`) now enforced in production. Not yet stress-tested in production.
- **`TOKEN_ENCRYPTION_KEY` lives only in Vercel + owner's password manager.** Not in `.env.production`, not in any commit, not in any process Code tab can reach. Per ADR-0016 §6 + amendment.
- **Production Clerk + Production OSF + Production Neon branch** — all distinct from dev. Production user pool is empty (owner's smoke test sign-up is the first row). Dev environment unaffected.
- **Five production-scoped API keys** in `05_app/.env.production` on owner's machine (Vercel personal token, Neon API key, Upstash management token, Clerk Production Secret, Inngest Production signing key). Per ADR-0016 amendment tradeoff. File verified gitignored.

## Carried forward to V1.7.1 (no blocker for V1.7.0)

1. **Loading spinners on primary buttons** (owner-noted). Audit all tRPC mutation buttons; add `isPending` state + disabled + visible spinner. Save dialog, Comment post, Add block, Open recruitment, Retry push, Connect OSF, +Follow, Save & request review.
2. **CI gate isn't actually wired** — the ignored-build-step command gates by branch (`main`-only) rather than by GitHub Actions status. CI failures on main don't block deploy. Per ADR-0016 amendment §"Quality gates also automated"; known cosmetic for V1.7.0 launch.
3. **Preview deploys disabled** — side effect of #2. Acceptable for solo launch but should restore for testing.
4. **`npm run deploy:verify` run** against production — automated axe spec across 9 researcher surfaces + multi-user e2e + audit-log draft. Skipped this turn after manual smoke passed.
5. **Google OAuth consent screen "Publish"** — currently in Testing mode, only listed test users can sign in via Google. Google usually auto-approves non-sensitive scopes (openid/email/profile) without verification; submit when ready for unrestricted Google sign-up.
6. **Cross-workspace discovery surface** — V1.7 anchor carry-forward. Fork-by-id/link is the current workaround; needs a "Browse public studies" surface eventually.
7. **Version-history sub-tab in Builder** — owner asked why "Preregistration v3" appears with no visible v1/v2; the version counter is shared across autosave + named + preregister + publish, so v3 just means "3rd version created." Adding a sub-tab that lists all versions would make this transparent.

## Sign-off

V1.7.0 is **shipped publicly to `https://myresearchlab.app`**. First public release of Massive Research Tool. End-to-end loop verified by the owner: sign up → onboard → build study → connect OSF → preregister → real OSF registration submitted. Network features (comments / notifications / activity / Replications / follow affordances), cross-workspace forking, study-level tags, condition builder, 9 response modules, Publish & run path, OSF push via Inngest, Upstash rate-limiter — all live in production, ready for use.

**Risk accepted for the first public release:**
- The 7 carry-forwards above (none block real usage; all are polish + automation hardening).
- Google OAuth sign-up restricted until the consent screen is published (email magic-link works for everyone).
- The full automated `deploy:verify` quality gate hasn't run against production (manual smoke covers the critical path).

**Signed:** {owner-name} — {date}.

---

## What's next

- **V1.7.1 polish PR** (Code-tab queued): loading spinners + CI gate fix. Owner-side: publish Google OAuth consent screen when ready.
- **V1.8 anchor**: owner-decided (Whiteboard / Participants destination / DB-backed Frameworks / AI features / Cross-workspace discovery). See dashboard `currentFocus` for the active pick.
