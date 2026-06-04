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

## Post-deploy hotfix — production module catalogue was empty (2026-06-04)

Owner opened the Builder on production and the "Add block" picker showed **"No modules match."** Diagnosis: the dev DB had the full catalogue (8 modules / 9 versions) and the `modules.list` query + picker code were correct + unchanged — but the **production** `module`/`module_version` tables were empty. The bootstrap's `db:seed` step never landed on prod (lost during the hotfix-heavy deploy where the Neon/Upstash API shapes kept shifting; the seed likely ran before a connection hotfix or didn't complete against the prod project).

**Fix (owner-approved):** derived the `mrt-production` pooled connection string from the Neon API (the bootstrap's step-2 logic) and ran `npm run db:seed` against it — catalogue only, no user data, idempotent. Confirmed: **PROD → modules=8, module_versions=9.** The picker fills on refresh. No code change; throwaway diagnostic scripts removed.

**Follow-up for future deploys:** `deploy:verify` should add a catalogue-count assertion (modules > 0) so an unseeded prod catalogue is caught automatically rather than by a user hitting the empty picker.

## Post-deploy ROOT CAUSE — module picker still empty after seeding (2026-06-04)

After the catalogue was confirmed seeded (prod: modules=8, versions=9) the picker was **still empty**. A step-through diagnostic endpoint (`/api/debugmodules`, since removed) isolated it: the raw catalogue query returned 9, auth resolved, the workspace resolved, and every *other* workspace-scoped query (`studies.get`, `listVersions`, `getReplications`, `listConditions`) succeeded — but `modules.list` through the real tRPC caller threw `invalid input syntax for type uuid: "12589"` (pg code 22P02, routine `string_to_uuid`).

The postgres.js error object carried the executed SQL + params, which exposed it:

```
inner join "module" on "module_version"."module_id" = $1     -- $1 = "12589"
```

The join's right side should be the column `"module"."id"`, not a bound parameter. **Cause:** `modules.ts` imported the Drizzle table as the bare identifier `module`. `module` is the **CommonJS module-wrapper object** that webpack passes as a parameter to every bundled module factory (`function(module, exports, require){…}`). In the minified production bundle that parameter **shadows** the imported table binding, so `module.id` resolved to webpack's **numeric module id** (`"12589"`), which Drizzle then bound as a parameter against the `uuid` column. It only reproduced in the production bundle (minification) — dev and vitest (un-bundled / namespaced `schema.module`) were fine, which is why every test and the local app passed. The diagnostic's own raw query used `schema.module.id` (namespaced, unshadowed) and returned 9, which is what localised the defect to the bare import.

**Fix:** renamed the export `module` → `moduleTable` (DB table name `"module"` unchanged) in `server/db/schema.ts`, with a comment documenting the footgun, and updated the three importers (`modules.ts`, `seed-core.ts`, `seed.test.ts`). Typecheck + 13 seed/migration tests + `next build` all clean. The temporary `/api/debugmodules` endpoint was removed.

**Lesson / guardrail:** never import a symbol named `module` (or `exports`, `require`, `__dirname`) — they collide with the CommonJS wrapper in bundled code. Worth a lint rule (`no-restricted-imports` / a custom check) so a reserved-name table export can't reach a runtime query again.
