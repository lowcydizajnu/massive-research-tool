# QA audit — 2026-06-03 — V1.5 preregister → run → results

## Overview

- **Date:** 2026-06-03
- **Scope:** V1.5 — the wedge end-to-end. Preregister stage → real OSF push (submitted, pending approval per OSF `require_approval()`) → Run stage (open recruitment + shareable link) → `/take` participant runtime (consent → one-question-per-page → complete; Preview via `?preview=true`) → Results stage (per-condition + per-question + CSV export). Bounded by ADR-0013 (participant runtime + 3rd-party analytics) + ADR-0014 (response data model + minimum viable conditioning); does not include V1.6 deferrals (condition-builder UI, two-way OSF sync, recruitment pause/close, provider integrations).
- **Feature specs / flows:** [run-a-study JTBD](../../02_product/jobs-to-be-done/run-a-study.md), [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md), [hanna-run-and-read-results](../../02_product/user-flows/hanna-run-and-read-results.md). *(All three paths verified present 2026-06-03.)*
- **Wireframes:** [participant-runtime](../../03_design/wireframes/participant-runtime.md), [results-stage](../../03_design/wireframes/results-stage.md), [preregister-stage](../../03_design/wireframes/preregister-stage.md). *(All three verified present.)*
- **ADRs in play:** [0005](../../04_architecture/adrs/0005-osf-integration.md), [0013](../../04_architecture/adrs/0013-participant-runtime-and-analytics.md), [0014](../../04_architecture/adrs/0014-response-data-model-and-conditioning.md), [0007 + 2026-05-29 amendment](../../04_architecture/adrs/0007-path-a-vs-b.md). *(Filenames verified.)*
- **Status of this audit:** ✅ **Cleared for continued dev to V1.6.** The wedge is code-complete, unit + integration tested, owner-verified live against real OSF, and participant-side a11y is green. It is **NOT** marked "ship V1.5 publicly" — two gaps are explicitly accepted (researcher-side axe DevTools pass not run headless; a focused participant-runtime security review on rate-limit/CSRF before public scale). See Sign-off.

## Test results

- **Unit + integration (Vitest): 92 green** (0 failing, 0 skipped). Touches: participant runtime (`server/runtime/participant.ts`) — **14 PGlite tests** covering weighted condition assignment (incl. a 90/10 split), condition-gated visibility (control sees 2 of 3 blocks), durable answer writes validated against the module `responseSchema`, resume-by-PID, completion + `current_n` bump (run only, preview excluded), invalid/required/upsert answer paths; OSF adapter (hex-or-base64 `TOKEN_ENCRYPTION_KEY`, resolve-schema-before-node-create, the verified register flow, paginate-instead-of-`filter[name]`); the push-status race guard (a failing concurrent job must not downgrade a `pushed` version); tRPC `studies.preregister` / `getPreregistration` / `retryPush` / `getRunInfo` / `openRecruitment` / `getResults`; the Studies furthest-stage filter; module `responseSchema`/`collectsResponse`.
- **Server-side end-to-end (Vitest, part of the 92):** `studies.test.ts` drives the whole wedge in-process — create → add likert block → preregister → openRecruitment → participant `startResponse` + `recordAnswer(6)` → `getResults` shows `totalCompleted: 1`, control `n=1`, question `mean 6`, one CSV row. Green.
- **Browser e2e (Playwright):** default suite **4 green** (chromium: `signup-slice` ×3, `studies-slice` ×1) — **0 skipped** (per `qa-and-testing.md`; both `hanna-*` specs live in the opt-in `auth` project). The **browser wedge e2e** `e2e/hanna-runtime.spec.ts` (sign in → framework study → preregister → run → open recruitment → a participant in a fresh unauthenticated context completes `/take` → Results shows 1 response) is **written failing-first and UNVERIFIED in the sandbox** (no Clerk CDN); it runs on the owner's machine/CI via `RUN_AUTH_E2E=1 … npm run test:e2e:auth`. Discovery verified: `--project=chromium` → 4 tests (no `hanna-*`), `--project=auth` → 2 (`hanna-loop` + `hanna-runtime`).
- **Authenticated Hanna-loop e2e (MVP):** still in the opt-in `auth` project, still unverified in the sandbox. The owner's 2026-06-03 manual live walkthrough exercised the loop functionally (see Manual exploratory).
- **Typecheck + production build: clean** throughout V1.5.
- **Validator:** clean at 52 instances.

## Accessibility scan

- **Status: participant side fully passed; researcher side code-reviewed (headless axe not feasible — Clerk-gated).**
- **Participant runtime (axe-core/playwright, WCAG 2A/2AA, against the live "Bulletproof" study in preview mode):**
  - `/take/[studyId]/start` (consent) — **0 violations.**
  - `/take/[studyId]/[sessionId]/[questionIndex]` (question page, likert rendered) — **0 violations.**
  - `/take/[studyId]/[sessionId]/complete` — reuses the identical `Card` shell (no new patterns); confirmed visually in the owner's manual walkthrough ("Thank you").
  - **Finding (fixed, commit `bd1792f`):** likert radio options had an `aria-hidden` visible number, leaving each radio with no accessible name for AT (axe did not flag it — the radios sit in a labelled `fieldset`). Added `aria-label` "{n} of 7" with anchor text at the extremes; re-ran axe → still 0 violations.
- **Researcher surfaces (code review — headless axe can't authenticate in the sandbox):**
  - **Preregister:** status banner is `role="status"`/`role="alert"`; OSF connection chip pairs tone with text (not color-only); Preregister/Retry are real buttons (submit busy via `aria-busy`).
  - **Run:** recruitment link is a labelled read-only field with a real Copy button; status chip is text ("Recruiting"); Open recruitment + Preview are real button/link.
  - **Results:** `h1` + `ul`/`li` lists for by-condition + by-question; Export CSV is a text-labelled button; preview toggle is a text `Link` (state in its label); empty states have orienting copy.
  - **Open (carried):** run axe DevTools on Preregister / Run / Results on a real Clerk session — pairs with the carried MVP authenticated-surface axe item.

## Performance check

- **Status: not formally measured; V1.5 payloads are small** (a study's blocks, one question per page, an aggregate over <100 responses in early use).
- **Watch items for V1.6+:**
  - `studies.getResults` aggregates in-memory over the completed responses; fine at V1 sizes, needs an index/query review if a recruitment session crosses ~10k responses.
  - Participant runtime is a full SSR page per question (chosen for analytics fidelity, ADR-0013); acceptable for <50-question studies, revisit RSC streaming for 200+.
  - OSF push job retry backoff envelope under sustained OSF errors.
- **Not measured:** Lighthouse on `/take/*` specifically — verify on staging/prod when deploying (the per-question SSR pattern was chosen partly for good Core Web Vitals).

## Security review

All items below verified in code on 2026-06-03.

- **Tenant isolation:** `studies.getRunInfo` / `getResults` are `workspaceProcedure`; `preregister` / `retryPush` / `openRecruitment` are `writeProcedure` (non-viewer). Tenant-scoped queries filter on `experiment.tenantId = ctx.workspace.id`. ✓
- **OSF token storage:** OAuth + PAT tokens encrypted at rest (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`). Grep of `app/(take)`, `server/runtime/participant.ts`, and `server/jobs/registry-push.ts` for `access_token`/`refresh_token`/`accessToken` → **none**; the connect-token action redirects with a generic `?osf=error` flag (no token in the URL); stored `registry_push.response_payload` is `{registrationId,url,doi}` (no token). ✓
- **Anonymous participant identity (ADR-0014):** `response.id` is a server-minted ULID; `external_pid` is opaque metadata, never a key, never demographic-joined. No demographic columns were added (migration only added the ADR-0014 tables). `client_metadata` jsonb exists but **is never populated** by the runtime; grep of the `/take` routes + runtime for `x-forwarded-for`/`req.ip`/`headers()` → **none** (no IP/UA capture). ✓
- **Guessable URLs / draft protection:** `startResponse` rejects a non-open recruitment (`status !== "open"` → `closed`); `resolveOpenRecruitment` returns only **open** sessions belonging to a **`kind: preregistered`** version — a participant can never take a draft. `getRuntimeQuestion` 404s when the response's version doesn't belong to the URL's study. ✓
- **Preview mode (ADR-0013):** `mode` is set once at `startResponse` and read from the `response` row thereafter (`resp.mode` at the question/complete/`current_n` paths); it is never re-read from the URL on later requests, so no URL replay can flip a real response to preview or vice-versa. ✓
- **GDPR consent surface:** zero third-party tracking configured by default (ADR-0013); the consent screen shows generic voluntary-participation copy with no tracking prompt the participant can't answer. ✓
- **Not formally reviewed (open, carried):** rate-limiting + CSRF on the unauthenticated `/take/*` form-POSTs. The advances are Next.js Server Actions (which apply same-origin checks), but a focused `security-review` on the participant runtime — rate-limiting the answer endpoint, abuse of `?preview=true`, and PID-spoofing — should run before any public study runs at scale.

## Manual exploratory notes

- **Owner-verified live (2026-06-03):** the full preregister → run → results loop end-to-end — "manually tested and works." Hanna preregistered a real study against real OSF, opened recruitment, took the study as a participant in an incognito browser through all questions, saw the response in Results, and the OSF push reached real OSF (a real registration was created; semantics are *submitted, pending approval* per OSF `require_approval()` — the banner says so).
  - **OSF DOI / URL of the verified preregistration:** **10.17605/OSF.IO/NVX9H** (https://osf.io/nvx9h/). Note: the DOI resolved means the owner approved the registration on OSF — the full submit → approve → DOI-minted cycle completed in practice, even though the app only performs the one-way *submit* step (two-way DOI backfill is V1.6).
  - **Anything surprising during the live walkthrough:** Nothing surprising.
- **Test-covered but not necessarily clicked live:**
  - Multiple conditions (V1.5 ships a single implicit `control`; the condition-builder UI is V1.6 — but the weighted assignment + per-condition aggregation **are** in V1.5 and are exercised by the runtime tests, incl. a 90/10 split and a 3-block condition-visibility case).
  - The `Retry` push button on a failed OSF push (commit `15eadaa`) — observed live during the OSF debugging (the 403 scope failures were recovered via Retry).
  - The auto-refreshing banner on a `pending` push (commit `b5926aa`) — owner confirmed "banner switches" without manual refresh.
  - Preview exclusion from default Results + inclusion via the toggle (`getResults` test asserts run-only by default).
- **Known deferrals visible in V1.5 (intended, not bugs):** condition-builder UI; two-way OSF sync (DOI backfill, withdrawal); recruitment pause/close UI; provider integrations (V1.5 copies the URL manually); per-version OSF node idempotency.

## Carried forward from MVP audit

The 2026-06-02 MVP audit listed three closeout items:
1. **Loop e2e green on real Clerk** — still owner-to-run (gated `auth` project, unverifiable in the sandbox). The owner's 2026-06-03 manual live walkthrough exercised the loop functionally; the automated proof on real Clerk remains an owner/CI run.
2. **Manual click-through of MVP block editing + save** — **covered:** the V1.5 live walkthrough builds a study (add/configure blocks) before preregistering.
3. **Axe a11y pass per authenticated MVP surface** — **still pending** (same Clerk-gated headless limitation). Participant a11y is now green; the authenticated-surface axe pass should be run with DevTools alongside the researcher-side V1.5 surfaces.

## Sign-off

I have read the above. V1.5 is **code-complete and live-verified by the owner**: the wedge loop (preregister → run → results) **works end-to-end in a real browser against real Clerk + real OSF** (owner manual walkthrough 2026-06-03), and is covered by a server-side end-to-end test plus a browser Playwright e2e (owner-to-run on real Clerk).

**Risk accepted for continued development to V1.6.** Specifically:

- **Test discipline:** 92 vitest green (incl. the server-side wedge e2e), 4 default Playwright e2e (0 skipped), typecheck + build + validator (52 instances) clean.
- **Live verification:** owner manually preregistered + ran + read results 2026-06-03; the preregistration is public on OSF at **DOI 10.17605/OSF.IO/NVX9H** (https://osf.io/nvx9h/); no surprises during the walkthrough.
- **a11y:** participant runtime green (axe WCAG 2A/2AA, 0 violations; likert-radio naming fixed in `bd1792f`); researcher surfaces code-reviewed, DevTools pass carried.
- **Open follow-ups carried to V1.6:** condition-builder UI; two-way OSF sync (DOI backfill + withdrawal) + `pushAmendment`/`withdraw`; per-version OSF node idempotency; connect-time OSF write-scope check; recruitment pause/close + provider integrations; likert distribution bars; editable consent + third-party-analytics config; **researcher-surface axe DevTools pass** (with the carried MVP authenticated-surface pass); **focused participant-runtime security review** (rate-limit/CSRF on `/take` POSTs).

**Signed:** Paweł Rosner — 2026-06-03.
