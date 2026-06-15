# QA audit — 2026-06-15 — V1.46.0 Study-lifecycle phase completeness

## Overview

- **Auditor:** Claude (agent) — a 14-agent phase-completeness workflow (5 dimension auditors → synthesis → 8 adversarial verifiers), launched because the owner wants to move to another part of the app and asked: *is this phase fully working + user-friendly, or what must close first?*
- **Verdict:** **small-gaps — NO blockers.** The study lifecycle (build → preview → share → preregister → run → results → amend → replicate → OSF → connect) works end-to-end and every user-facing affordance is honestly backed. A short, verified "finish-now" set closes the real correctness + honesty gaps; two large items are deferred with reasons.
- **Migration-free.** 407 vitest green; tsc/lint/build/manifest clean.

## Two bugs the owner hit (fixed, commit `5933924`)

- **A/B section "blinks and disappears":** the "Set up an A/B test" affordance rendered during the `listConditions` loading window (`data` undefined → `list []`), then vanished when real data arrived — so on a study that already has a condition it flashed. Fixed: gate the section body on loaded data.
- **OSF "logged in but still asks for a token":** the Connections UI offers two *alternatives* (paste a token, or OAuth sign-in) with no hint they're either/or. Clarified the copy. **Root cause of the symptom** (found by the audit, fixed below): the OAuth callback didn't set `tab=connections`, so the user landed on the Profile tab where the success banner never renders — looking like nothing happened.

## Finish-now set (commit `80fa9dc`)

All file-grounded, each adversarially verified as a real gap:

- **OSF callback → Connections tab** (`app/api/auth/osf/callback/route.ts`) so the connected/error banner shows. Primary cause of the token-confusion symptom.
- **Run "Preview" target** (`run/page.tsx`) → `/studies/[id]/preview` (needs no open session) instead of the recruitment-gated `/take` link that dead-ended before recruitment opened.
- **Preflight gate keyboard-safe** (`preflight-checklist.tsx`) — `inert` removes the gated action from focus order; `pointer-events-none` alone let keyboard users fire preregister/publish/amend without acknowledging flagged issues.
- **Run mutation error feedback** (`run-panel.tsx`) — open/publish/pause/stop now surface server errors (`role=alert`) instead of silently returning to idle.
- **Drift-banner href** (`build-drift-banner.tsx`) tracks versionKind (published → Run).
- **Hygiene (CLAUDE.md cite-accurately + vocabulary):** "Working copy" → "Draft" (Versions panel); corrected 6 stale docstrings that described shipped features (Save & request review, Follows feed, Run pause/close, SPSS/Stata/Excel export, all 8 stage routes, the Builder) as deferred/disabled/placeholder.

## Deferred (with WHY — not oversights)

- **Concurrent version-level A/B** (two frozen versions recruiting at once) — DEFER. Nothing is broken: the data plane is already A/B-ready (`response.experimentVersionId` immutable; `getResults` pools + splits by `versionNumber`; per-version counts). It's a net-new recruitment-routing feature that needs its own ADR + per-version recruitment links and would have to **gate the one-open-session invariant we just shipped** — too big to fold into a phase close-out, and it loses nothing by waiting. *Within-version A/B (conditions) is shipped and the recommended tool for most needs.* If/when built, **per-version links** is the design — NOT a weighted split (which would couple version selection into the hot `startResponse` path and break the "your link serves the latest frozen version" contract).
- **OSF withdrawal** — DEFER (genuinely blocked). `withdraw()` is `NOT_IMPLEMENTED` because the OSF write contract can't be verified without an irreversible POST against a real registration; unblocking needs the **owner** to create a sacrificial OSF registration and capture the request/response. The app already *detects* externally-done withdrawals (`getRegistrationStatus → withdrawn`).
- **OSF OAuth refresh-on-401** — DEFER. The refresh token is stored but unused; an expired access token forces a reconnect at push time. Only affects OAuth users — and OAuth isn't operational until the owner registers/approves an OSF OAuth app (client secret + matching redirect URI). Pairs with that setup + live verification rather than shipping unexercised token-refresh code now.
- **OSF registered-contributor path** — DEFER. Only unregistered-by-email contributors are pushed (correct — our users are Clerk, not OSF accounts); revisit when profiles capture OSF user ids.
- **Debunked during verification:** the proposed `osfConfig` env-fallback "fix" rested on a false premise (the app reading `.env.production` at runtime) — dropped, not implemented.

## Nice-to-haves (follow-up polish — do NOT gate the phase)

Export error/retry state; hide Export CSV in the zero-response state; split the Run/Results awaits so a transient `getRunInfo`/`getResults` throw doesn't 404 the whole stage; recruitment-link fallback when `NEXT_PUBLIC_SITE_URL` is unset; proposal status-chip label map; a few a11y label/contrast/live-region items; single-block delete confirm. All low-severity, file-grounded in the audit output.

## Verification

- **407 vitest green (45 files)**; tsc/lint/build clean (exit-code-gated); manifest clean; dashboard JSON re-validated.
- The finish-now changes are UI/route/comment-level (no new server logic) — verified via tsc/build + the existing suite, shipped for the owner's click-through. Prod smokes: OSF OAuth (if configured) lands on Connections with a banner; Run "Preview" opens the participant preview before recruitment opens; a failed Open/Stop shows an error; the A/B affordance shows only on a genuinely condition-less study and stays put.

## Bottom line

The study-lifecycle phase is **done and user-friendly** after this release. The only things left are deliberate, documented deferrals — two of which need an action from the owner (OSF OAuth app setup; a sacrificial registration for withdrawal). Safe to move to another part of the app.
