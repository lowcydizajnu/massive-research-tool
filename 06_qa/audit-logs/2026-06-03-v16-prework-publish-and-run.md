# QA audit — 2026-06-03 — V1.6 pre-work + Publish & run

## Overview

- **Date:** 2026-06-03
- **Scope:** V1.6 pre-work end-to-end. **PR-0** condition builder (relational `condition` rows, Builder Conditions section + per-block "Show only if" multi-select, conditions frozen onto preregistered snapshots per the ADR-0014 amendment). **PR-1a** real response modules — `core/social-post@2.0.0` (promoted from placeholder; veracity-ground-truth enum + topic-tags researcher-only metadata; v1.0.0 retained for pinned studies), `core/multiple-choice@1.0.0` (single/multi-select with optional participant-deterministic shuffle), `core/free-text@1.0.0` (short/long; maxLength). **PR-1b** the second tranche — `core/slider@1.0.0` (numeric → mean), `core/ranking@1.0.0` (no-JS rank-per-item selects → `{order}`), `core/attention-check@1.0.0` (instructed single-select + `correctAnswer` → categorical counts), `core/demographics@1.0.0` (i18n-friendly toggleable age/gender[inclusive]/country → CSV); plus the failure-tolerant Inngest enqueue + dev inline fallback that fixed the stuck-pending preregister. **PR-1c** Publish & run — running no longer requires preregistration; `studies.publish` freezes an immutable `kind:published` snapshot (copies conditions, no OSF push) and runs the same Run/Results path. ADR-0013 amended (runnable = latest `kind ∈ {preregistered, published}`). **PR-2** participant-runtime security review + hardening — server-side payload bounds (free-text ≤10k, choice/ranking arrays capped) and a config-aware `validateAnswer` (selections ∈ options, single-select ≤1, slider in range, ranking ∈ items) wired into `recordAnswer`. Bounded by ADR-0013 + amendment, ADR-0014 + amendment, ADR-0005, ADR-0007 + amendment, ADR-0012. Explicit V1.7 deferrals: the ADR-0015 anchor scope (comments / notifications / activity / Replications / follow affordances / amendment flow / divergence signal), production deploy (ADR-0016 drafted but execution deferred), real-Clerk axe DevTools pass on researcher surfaces (owner-run), hosted rate-limiter on `/take/*` (per ADR-0016).
- **Feature specs / flows:** [build-a-study JTBD](../../02_product/jobs-to-be-done/build-a-study.md), [run-a-study JTBD](../../02_product/jobs-to-be-done/run-a-study.md), [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md), [hanna-run-and-read-results](../../02_product/user-flows/hanna-run-and-read-results.md). *(All paths verified present 2026-06-03.)*
- **Wireframes:** [builder-conditions](../../03_design/wireframes/builder-conditions.md) (new in PR-0), [build-stage-builder-mode](../../03_design/wireframes/build-stage-builder-mode.md), [save-as-version-dialog](../../03_design/wireframes/save-as-version-dialog.md), [preregister-stage](../../03_design/wireframes/preregister-stage.md), [run-stage](../../03_design/wireframes/run-stage.md) (Publish & run added in PR-1c), [results-stage](../../03_design/wireframes/results-stage.md), [participant-runtime](../../03_design/wireframes/participant-runtime.md). *(Verified present.)*
- **Design system:** [response-modules](../../03_design/design-system/response-modules.md) (new PR-1a gate; describes the 9-module surface). *(Verified present.)*
- **ADRs in play:** [0005](../../04_architecture/adrs/0005-osf-integration.md), [0007 + 2026-05-29 amendment](../../04_architecture/adrs/0007-path-a-vs-b.md), [0012](../../04_architecture/adrs/0012-block-format-and-autosave-semantics.md), [0013 + 2026-06-03 amendment](../../04_architecture/adrs/0013-participant-runtime-and-analytics.md) (Publish & run), [0014 + 2026-06-03 amendment](../../04_architecture/adrs/0014-response-data-model-and-conditioning.md) (conditions frozen onto preregistered snapshot). *(Filenames verified.)*
- **Status of this audit:** ✅ **Cleared for continued dev to V1.7.** The pre-work feature set (conditions + 9 modules + preregister-or-publish + runtime + Results) is code-complete, unit + integration tested, owner-exercised live, and participant-side security is hardened to a documented threat model. It is **NOT** marked "ship V1.6 publicly" — three gaps are explicitly accepted and carried forward to V1.7 (researcher-side axe DevTools pass on PR-0/PR-1/PR-1c surfaces; production deploy as V1.6.0; the ADR-0015 anchor scope). See Sign-off.

## Test results

- **Unit + integration (Vitest): 111 green** (0 failing, 0 skipped). Net **+19 since the V1.5 audit (92 → 111)**. New coverage: condition CRUD (`addCondition`/`updateCondition` slug-lock once referenced/`removeCondition` strips slugs from block visibility/`setBlockVisibility` validates slugs); per-module `responseSchema` shape (free-text/multiple-choice/slider/ranking/attention-check/demographics) — empty / minimum / oversized / required-field paths; **`validateAnswer` membership/range** (a crafted multiple-choice selection outside `options` rejects; a slider value out of `[min,max]` rejects; a ranking entry not in `items` rejects); answer-summary kind dispatch (numeric mean / categorical per-option counts / text n) and CSV stringification for each kind; `studies.publish` (immutable `kind:published` snapshot, conditions copied, no OSF push, `current_version_id` advanced); the **runnable-version resolver** (latest `kind ∈ {preregistered, published}` with an open recruitment); the **conditions-frozen-on-preregister** path (a `preregister` after editing working-tip conditions snapshots the post-edit set); the **failure-tolerant enqueue** (Inngest unreachable in dev → inline run, push status reaches `pushed`/`failed` deterministically); the **stuck-pending Retry** (a `pending` older than the heartbeat is re-enqueued and resolves). The V1.5 wedge e2e (`studies.test.ts`) still green and now also runs through the Publish & run branch.
- **Server-side end-to-end (Vitest, part of the 111):** `studies.test.ts` covers both runnable paths: (a) preregister → openRecruitment → participant `startResponse` + `recordAnswer` → `getResults` totals; (b) **publish** → openRecruitment → participant flow → `getResults` totals. Both green.
- **Browser e2e (Playwright):** default suite **4 green** (chromium: `signup-slice` ×3, `studies-slice` ×1) — **0 skipped** (per `qa-and-testing.md`; both `hanna-*` specs live in the opt-in `auth` project, unchanged from V1.5). The browser wedge e2e `e2e/hanna-runtime.spec.ts` (sign in → framework study → preregister → run → open recruitment → participant completes `/take` → Results) is **written failing-first and UNVERIFIED in the sandbox** (no Clerk CDN); runs on the owner's machine/CI via `RUN_AUTH_E2E=1 … npm run test:e2e:auth`. No new browser e2e was added for Publish & run (the server-side e2e covers the path); a `hanna-publish-and-run.spec.ts` in the `auth` project is queued for V1.7 alongside the carry-forward Clerk axe pass.
- **Typecheck + production build: clean** throughout V1.6.
- **Validator:** clean at **57 instances** (+5 since V1.5 — the PR-0 wireframe + the PR-1a design-system entry + the PR-1c amendments are picked up by the validator; `validate.py` was the gate for each PR).

## Accessibility scan

- **Status: participant side fully passed (V1.5 + the new modules); researcher side code-reviewed (real-Clerk axe DevTools carried to V1.7).**
- **Participant runtime (axe-core/playwright, WCAG 2A/2AA — repeated against the live "Bulletproof" study in preview mode after PR-1a/b/c):**
  - `/take/[studyId]/start` (consent) — **0 violations** (unchanged from V1.5).
  - `/take/[studyId]/[sessionId]/[questionIndex]` rendered with each new module:
    - **Likert** (V1.5) — 0 violations (regression check).
    - **Multiple-choice** — 0 violations; radios/checkboxes carry the option label as accessible name; the optional shuffle is participant-deterministic (not announced).
    - **Free-text** — 0 violations; `textarea` is labelled by the block prompt; the `maxLength` is announced via `aria-describedby` when set.
    - **Slider** — 0 violations; rendered as a native `input[type=range]` with `aria-valuemin`/`max`/`now` + a visible numeric readout; touch targets ≥ 44px.
    - **Ranking** — 0 violations; rendered as one `select` per item with the rank as the option text (no JS DnD needed; AT-friendly first-class path).
    - **Attention-check** — 0 violations; renders identically to multiple-choice (no `correctAnswer` leakage to the DOM).
    - **Demographics** — 0 violations; age is a labelled `select`; gender uses the inclusive set per the design-system entry with an open-text "other"; country is a searchable native `select`.
  - `/take/[studyId]/[sessionId]/complete` — unchanged from V1.5; reuses the same Card shell.
- **Researcher surfaces (code review — headless axe still can't authenticate against Clerk in the sandbox):**
  - **Builder · Conditions section (PR-0):** the list of conditions is a labelled `region`; each row is `name` + `slug` + `allocation_weight` `number` inputs + a Remove `button`; the per-block "Show only if condition" is a `fieldset` of checkboxes (not a hidden multiselect) so it's announced as a single group; an empty state has orienting copy.
  - **Builder · Configure forms for new modules (PR-1a/b):** the option-list editor is a labelled list with add/remove buttons; the number, slider min/max, and the demographics toggles are labelled native inputs; no color-only state.
  - **Run · Publish & run (PR-1c):** two distinct buttons (Preregister vs Publish & run) with descriptive text labels; the chosen path's status is announced via `role="status"`.
  - **Open (carried to V1.7):** real-Clerk axe DevTools on Preregister / Run / Results / **Builder (Conditions + new module configs)** — checklist in [`2026-06-03-participant-runtime-security-review.md`](./2026-06-03-participant-runtime-security-review.md).

## Performance check

- **Status: not formally measured; V1.6 payloads remain small.** The new modules don't change the per-question SSR pattern.
- **Watch items for V1.7+ (additive to V1.5):**
  - `getResults` now dispatches by answer-summary kind (numeric / categorical / text); the categorical option-count is O(responses × options) — fine at V1 sizes, revisit if a study uses a multiple-choice block with > ~50 options at > ~10k responses.
  - Ranking renders one native `select` per item; with > ~50 items per block, validate paint cost. Most ranking blocks use ≤ ~10 items.
  - The condition resolver assigns at session start (one DB round-trip per participant; cached for the session lifetime); no per-question hit.
  - Inngest fan-out for **V1.7 ADR-0015 notifications** will exercise the same Inngest path as the V1.5 OSF push job — capacity sized off that pattern.
- **Not measured:** Lighthouse on `/take/*` with each new module — verify on the eventual production deploy (per ADR-0016).

## Security review

V1.6 pre-work added one public, unauthenticated, mutating surface set (the participant runtime stayed the same; the new modules added new answer shapes). The full threat model + the hardening that landed this PR is documented in [`2026-06-03-participant-runtime-security-review.md`](./2026-06-03-participant-runtime-security-review.md). Summary:

- **CSRF (#1):** mitigated by Next.js Server Actions same-origin check. ✓
- **Oversized payloads (#2):** bounded in `responseSchema` (free-text ≤10k, multiple-choice/attention `selected` ≤50/1 items of ≤500 chars, ranking `order` ≤100 items). ✓
- **Forged answer values (#3):** new `CoreModuleDef.validateAnswer(answer, config)` runs server-side in `recordAnswer` after the shape check — selections must be in `options`, slider in `[min,max]`, ranking entries among `items`. The UI already constrains these; this closes the crafted-POST bypass. ✓
- **Draft exfiltration (#4):** `/take` only serves an immutable runnable version (latest `kind ∈ {preregistered, published}` with an open recruitment). A draft yields "not accepting responses". ✓
- **Preview replay (#5):** `mode` is set once at session creation, read from the `response` row thereafter, never re-read from the URL. ✓
- **Duplicate completion (#6):** partial unique index `(recruitment_session_id, external_pid)`; `startResponse` resumes rather than duplicates. ✓
- **PII leakage / logging (#7):** no IP / raw UA captured; `client_metadata` is never populated; the anonymous identifier is a server-minted ULID (ADR-0014). ✓
- **Session-id guessing (#8):** ULID URLs are unguessable-in-practice; anonymous + no PII exposed. Accepted as low risk for V1.7; revisit if a per-session token is warranted.
- **Rate-limiting / flooding (#9):** ⛔ **explicitly deferred to production deploy (ADR-0016).** A real limiter needs a shared store across serverless instances; the hosted store (Upstash Redis recommended) is locked in ADR-0016. The payload bounds (#2/#3) cap per-request blast radius in the meantime.
- **Publish & run path (new this PR):** `studies.publish` is `writeProcedure` (tenant-scoped, non-viewer); the immutable `kind:published` snapshot copies conditions and is treated as runnable identically to `kind:preregistered` by the resolver. No OSF push, no token surfaces touched. Reviewed: no path from `published` back to a draft (immutability holds per ADR-0012). ✓

## Manual exploratory notes

- **Owner-verified live (2026-06-03):** the full V1.6 pre-work feature set was exercised end-to-end on localhost across the session — building a study with multiple conditions in the Builder (PR-0), adding blocks for each of the 9 modules and configuring them (PR-1a/b), taking the study as a participant for both Preregister and Publish-and-run paths (PR-1c). "Manually tested and works."
  - **PR-1c surfacing:** the owner deliberately requested the Publish & run path so pilot/exploratory studies can run without forcing OSF preregistration. Both paths converge on the same Run/Results surface.
  - **PR-0 ergonomics:** the slug-locks-once-referenced behavior was tested by trying to rename a condition's slug after wiring a block to it (correctly rejected with a useful message; the alternative would silently break block visibility).
  - **Stuck-pending preregister:** the previous-session live-test 500/forever-pushing pathology when `inngest-cli dev` wasn't running is fixed (dev inline fallback). The Retry button on a stuck `pending` works as expected.
  - **Anything surprising during the live walkthrough:** nothing surprising; the dev fallback removes the prior "you must remember to start the Inngest dev daemon" footgun.
- **Test-covered but not necessarily clicked live with every permutation:**
  - The **3-condition × condition-gated visibility** path (the unit tests cover a control sees 2 of 3 blocks case; the owner exercised 2-condition live).
  - Every demographics option permutation (toggleable age/gender[inclusive]/country) — code is covered by `responseSchema` tests; not every UI permutation clicked.
  - Every CSV column for each new module — extraction is covered by tests; CSV downloaded and inspected live for likert + multiple-choice + free-text.
- **Known V1.7 deferrals visible in V1.6 (intended, not bugs):** comments / notifications / activity / Replications / follow affordances (ADR-0015 anchor); the **amendment flow** for re-preregistering an updated study (a temporary "re-preregister" hack was reverted in this session — the real fix is part of the V1.7 anchor); the **divergence signal** between a parent study and its forks (also V1.7 anchor); production deploy + hosted rate-limiter (ADR-0016); two-way OSF sync (DOI backfill, withdrawal); per-version OSF node idempotency; recruitment pause/close + provider integrations; editable consent + third-party-analytics config UI.

## Carried forward from prior audits

The 2026-06-03 V1.5 audit listed two carry-forward items at sign-off:

1. **Researcher-surface axe DevTools pass on Preregister / Run / Results** (the V1.5 surfaces) — **still owner-to-run; expanded for V1.6** to also cover **Builder (Conditions + new module configs)** and **Run · Publish & run**. The checklist is in the participant-runtime security review doc.
2. **Focused participant-runtime security review (rate-limit/CSRF on `/take/*` POSTs)** — **closed for the in-code part this PR** (the full review + the hardening landed; see Security review above). The **hosted rate-limiter** is the one explicit deferral, scoped to production deploy (ADR-0016).

The 2026-06-02 MVP audit's three closeout items remain in the same state as recorded in the V1.5 audit (loop e2e on real Clerk = owner-to-run; manual block-edit click-through = covered; authenticated-surface axe = pending alongside the V1.5/V1.6 researcher-surface axe pass).

## Sign-off

V1.6 pre-work is **code-complete and owner-exercised on localhost**. The 9-module response surface + condition builder + Publish-and-run + the security hardening land V1.6 as a real shipment-worth-of-code on top of the V1.5 wedge.

**Risk accepted for continued development to V1.7.** Specifically:

- **Test discipline:** 111 vitest green (incl. the server-side wedge e2e on both Preregister and Publish-and-run paths), 4 default Playwright e2e (0 skipped), typecheck + build + validator (57 instances) clean.
- **Live verification:** owner exercised the pre-work feature set live on localhost 2026-06-03; both runnable paths produced expected results. No surprises during the walkthroughs.
- **a11y:** participant runtime green on each of the 9 modules (axe WCAG 2A/2AA, 0 violations); researcher surfaces code-reviewed, DevTools pass carried to V1.7.
- **Security:** participant-runtime threat model documented, in-code hardening landed (payload bounds + config-aware `validateAnswer`); hosted rate-limiter explicitly deferred to production deploy (ADR-0016).
- **Open follow-ups carried to V1.7:**
  - **The ADR-0015 anchor scope** — comments / notifications / activity (Yours + Follows) / Replications tab / four follow-target affordances / amendment flow / divergence signal. This is V1.7's anchor.
  - **Production deploy as V1.6.0** — ADR-0016 drafted this session; execution deferred. Carries the **real-Clerk researcher-surface axe DevTools pass** (the V1.5 + V1.6 carry-forward) and the **hosted rate-limiter** (#9 from the security review).
  - Two-way OSF sync; per-version OSF node idempotency; connect-time OSF write-scope check; recruitment pause/close + provider integrations; likert distribution bars; editable consent + third-party-analytics config UI; the `hanna-publish-and-run` browser e2e in the `auth` project.

**Signed:** {owner-name} — {date}.
