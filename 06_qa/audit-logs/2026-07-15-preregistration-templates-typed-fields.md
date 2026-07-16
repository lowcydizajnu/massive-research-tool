# QA audit — 2026-07-15 — Preregistration templates + typed plan fields (LOS Round 2 item ⑤)

## Overview

- **Auditor:** Claude (agent), at the owner's direction. Owner decisions locked via AskUserQuestion 2026-07-15: v1 exposes **two templates** (Open-ended + Replication recipe); data-collection gate is a **hard block**; item ⑨ groundwork = **provenance slot now, deriver later**. Threshold revised by owner mid-build (see Revision).
- **Scope:** Typed preregistration plan fields inside `definition_snapshot.overview`; an in-repo preregistration-template catalogue; typed field → OSF response-key mapping (unblocking the ADR-0005 deferral); a plan-before-data hard gate; the Overview-stage picker/editors + Preregister-stage blocking state.
- **Gates honored:** **ADR-0101 written and committed before any code** (`e955fb6`), then both wireframes + the data-model entry (`fc64d31`), then code. Flow gate already satisfied by `hanna-build-a-study`. Vocabulary checked against design-rules ("Preregistration template" — never "schema", never "Framework", never bare "Template").
- **Verdict:** done — **1052 vitest green**, tsc/lint/build (27/27) clean, `validate.py` clean (280). **CODE-ONLY: no migration, no seed.** Not pushed.

## What changed

- **`StudyOverview`** (`server/modules/blocks.ts`) gains `templateKey?`, `samplingPlan`, `analysisPlan`, `variables[]`, `expectedOutcomes[]`, each defaulted in the tolerant `readOverview`. Rides inside the snapshot, so it freezes for free (the four freeze mutations copy the snapshot wholesale) and every already-frozen preregistration still reads. `planTemplateKey()` resolves explicit-choice-else-derived.
- **`lib/prereg-templates.ts`** — in-repo, client-safe catalogue (mirrors `lib/licenses.ts`). Not a seeded table: a seeded catalogue is invisible in prod until `db:seed:prod` runs.
- **OSF mapping** (`osf-recipe.ts`, `registry-push.ts`) — typed `samplingPlan`/`analysisPlan` now feed the **verified** Recipe keys `77-33`/`77-80`, replacing a heading regex (`/analysis/i`) and a magic section id (`recipe-planned-sample`). **Dual read**: typed field wins, legacy section is the fallback, so pre-item-⑤ studies keep filing. `templateKey` drives `schemaName`, superseding the implicit `replicationIntent → Recipe` branch. Variables/expected outcomes ride in the description — **no response key was invented for them**.
- **Plan-before-data gate** — `assertPlanBeforeData` in `preregister` throws `PRECONDITION_FAILED`. Mirrors the ADR-0084 branding gate exactly (advisory row on the pre-flight, enforced in the mutation). `amend` exempt by design; `publish`/`saveAsNamed` untouched.
- **UI** — Overview-stage template radiogroup + typed editors + derived data-collection chip; Preregister-stage "Filing as …" line + blocking notice. `StudyBlock.collectsResponse` added so the measure picker lists only response-collecting blocks.

## Bugs found and fixed during the build

1. **`setOverview` silently wiped `replicationIntent`** (pre-existing). It replaced the overview wholesale while the editor only ever sent four fields — so a researcher who declared "direct replication", then edited their abstract and saved, lost the intent, and `registry-push` (which keyed off it) quietly re-filed the study under Open-Ended instead of the Replication Recipe. Item ⑤ would have inherited the fault via `templateKey`'s derivation. **Fixed:** `setOverview` now merges onto the stored plan. Regression-tested.
2. **`readOverview` materialized the derived `templateKey`** (introduced, caught by a test I wrote). Several call sites round-trip a plan (`{...readOverview(snap), field}` — `setReplicationIntent`, `injectReplicationRecipe`) and write it back, which would persist `open-ended` as an explicit choice *before* a replication intent existed and beat the derivation forever. **Fixed:** `templateKey` is optional and never materialized; resolve via `planTemplateKey`. Regression-tested.
3. **Preview responses would have tripped the gate** (caught while implementing the revised threshold). `response_mode` is `run | preview`; counting preview rows would mean previewing your own study locks you out of preregistering it. **Fixed + tested** before it ever ran.

## Tests (+21 new)

- `server/modules/__tests__/overview.test.ts` (9) — every typed field defaults on a pre-item-⑤ snapshot; `planTemplateKey` derives Recipe from replication intent and Open-ended otherwise; an explicit key wins; garbage keys fall back rather than throw; **the derived key is never materialized** (the round-trip regression); malformed typed fields coerce; ids are a deterministic fallback (`readOverview` must never mint random ids — React keys depend on it).
- `server/modules/__tests__/osf-recipe.test.ts` (13) — typed sampling/analysis win over the legacy sections; the legacy sections still map when typed fields are empty (the pre-item-⑤ path — the *pre-existing* suite passing unchanged is itself the proof); variables/outcomes land in the description; only verified keys are ever emitted.
- `server/trpc/__tests__/studies.test.ts` (150) — typed fields persist; `setOverview` merges (omitted fields keep their value); `replicationIntent` survives a save; `dataCollectionStatus` derives from responses not recruitment; the gate refuses once a response exists; **recruitment-open-with-zero-responses does not burn preregistration**; **a preview response doesn't trip the gate**; `amend` stays available after collection starts.

## Verification

- `npx tsc --noEmit` → **exit 0**. `next lint` → clean. `npx vitest run` → **exit 0, 1052 tests / 125 files**. `npm run build` → **exit 0, 27/27 pages**. `python3 00_meta/manifest/validate.py` → clean (280 instances).
- **Gap, stated plainly:** the Overview and Preregister stages are behind Clerk auth and this session had no dev sign-in, so **the authed UI was not driven live in a browser**. It is covered by typecheck, lint, production build and the router/module test suites, but the picker, the typed editors, and the blocking notice have **not** been visually confirmed on screen. The anonymous surfaces were not affected by this change. Recommend a visual pass on the Overview stage before deploy.
- Deploy: **code-only, no migration for item ⑤**. The Round-1 migration `0057` (`experiment.license`) is still dev-only and **must run `db:migrate:prod` before any `git push`**. Nothing pushed.

## Known limitations (by design)

- **Two templates only.** Stricter OSF templates (standard OSF Preregistration, AsPredicted, EEG/ERP, Eye-tracking) carry required questions and would 400 *late* (after node + draft exist); they need a client-side required-field gate first. ADR-0101 revisit trigger.
- **No provenance UI.** Fields carry a `source: derived | researcher` slot, but v1 writes only `"researcher"` — nothing is auto-filled yet, so there is nothing to badge. Item ⑨ ships the deriver and its affordance.
- **Variables/expected outcomes have no OSF response key** and compose into the description body instead. Not a workaround to fix — OSF's two all-optional schemas simply don't ask for them, and inventing a key would be a fabricated contract.
- **DOI ownership** (mint our own DataCite DOI vs adopt the OSF registration DOI) stays parked for items ⑦/⑩; **OSF schema-version pinning** stays resolve-by-name for v1.

---

## Revision — gate threshold moved to "any response recorded" (2026-07-15, owner direction)

The first cut gated on **recruitment ever having been opened**. The owner asked what that meant for a researcher in practice, which surfaced that the framing over-stated the risk and that the threshold was blunter than it needed to be:

- Recruitment **cannot open at all** until a study is preregistered *or* published (`openRecruitment` requires a runnable version), so the normal path — preregister → recruit → amend — never meets the gate. Only the publish-instead-of-preregister path can reach it.
- But opening recruitment and closing it again with **zero takers** leaves the plan demonstrably pre-data, and the first cut would still have permanently burned preregistration.

**Reworked (owner direction):** the threshold is now a recorded **participant response** (`response.mode = 'run'`), excluding the researcher's own **preview** runs. The chip therefore reports on *data*, not recruitment — "Not started" while recruitment is open and empty is **correct, not a bug**. Blocking copy softened from `danger` to `warning` and reworded: anyone who reaches it got there legitimately, so it states the constraint and names the alternatives (a Saved version, a published Record) instead of implying fault. ADR-0101 + `data-model/09` + both wireframes reconciled; +2 tests.

## Revision 2 — the template picker was a visual no-op (2026-07-15, owner caught it live)

The owner signed in, used the Overview stage, and reported: *"switching between open-ended and replication recipe change nothing."* Correct, and it is exactly the kind of defect the tests I had could not catch — every assertion was about stored values and OSF mapping; none asserted that **choosing a template changes what the researcher sees**.

**Root cause: I under-built the ADR.** ADR-0101's decision text says each template entry declares "its exposed typed field-set". My catalogue only carried `{key, label, description}` and the editor rendered every typed field unconditionally. The picker *did* drive the OSF `schemaName` at push time — a real effect, but one invisible until you preregistered. A control that appears inert is indistinguishable from a broken one.

**The deeper hole it exposed:** the Replication recipe was **half-built**. Its own three verified OSF questions — `77-12` original study, `77-2` target effect, `77-73` differences — existed only as sections auto-seeded onto **forks** (`injectReplicationRecipe`). A non-fork study choosing the Recipe had *nowhere to answer them at all*, and would have filed a registration missing three of its five answers.

**Fixed:**
- `PREREG_TEMPLATES[].fields` declares each template's typed field set; `templateAsks()` gates rendering. Open-ended asks 4 fields; the Recipe asks those 4 **plus its own 3**.
- New typed fields `originalStudy` / `targetEffect` / `differences`, defaulted in `readOverview` like the rest — still **zero migrations**.
- Mapped with the same dual read: typed wins, legacy seeded section is the fallback; a fork with no typed `originalStudy` still falls back to its source study, so nothing already out there re-files differently.
- Fields stay additive on one overview object and `setOverview` sends all of them regardless of the active template, so switching hides a field without destroying its value.
- **+11 tests**, including one that asserts the two templates declare *distinct* field sets — a direct regression guard for "the picker does nothing".

**Verification of this revision — VERIFIED LIVE.** tsc 0, lint 0, `npm run build` 27/27, **1063 tests** green, `validate.py` clean (281). Driven in the embedded browser against the signed-in dev app (study `b00669f6` — "Headline credibility — replication (PL sample)"): clicking **Replication recipe** added `ORIGINAL STUDY` / `TARGET EFFECT` / `DIFFERENCES FROM THE ORIGINAL` to the form, which were absent under **Open-ended**. The picker changes the plan. Confirmed in passing on real data: the derived chip renders `DATA COLLECTION — Collecting`, and the study correctly resolves to **Open-ended** despite being a replication, because its replication kind was never declared — `planTemplateKey`'s back-compat derivation behaving exactly as designed.

## Two process lessons from this item (both cost real time)

1. **Server-shaped tests cannot see a dead UI.** The first cut passed **1052 tests and a clean build while shipping a control that did nothing**. Every assertion was about stored values and OSF mapping; none asserted that choosing a template changes what the researcher sees. The regression guard added here (the two templates must declare *distinct* field sets) is the cheap version of that check, but the general hole remains: **an interactive surface needs either a component-test harness or a mandatory human visual pass in the gate.** There is no component-test harness today (vitest is `environment: "node"`, `*.test.ts` only, no testing-library) — worth its own decision.

2. **A green `npm run build` does NOT mean the dev server is serving your code.** `npm run build` uses SWC/webpack; `npm run dev` runs **Turbopack** (`next dev --turbopack`), which cached a broken parse from a half-written file saved mid-edit. Result: build exited 0 and tsc exited 0 while the dev server served **stale pre-fix code** and logged a parse error whose line numbers were two off from the file on disk — i.e. pointing at a version that no longer existed. That nearly produced a second false conclusion ("the fix didn't work"). **Clearing `.next` alone is not enough — `node_modules/.cache` must go too.** Related self-inflicted trap: running `npm run build` while `next dev` is live clobbers `.next` and makes dev throw `ENOENT _buildManifest.js.tmp`; don't build against a running dev server.
