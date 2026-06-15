# QA audit — 2026-06-15 — V1.45.0 ADR-0044 deferred follow-ups (3)

## Overview

- **Auditor:** Claude (agent).
- **Trigger:** after v1.44.0 shipped, the owner asked me to explain the three deferred carry-forwards and then chose a direction for each: **(1) A/B → option A (conditions) with a clean opt-in UI**, **(2) one-open-session guard → most flexible option without unnecessary DB work**, **(3) OSF contributors → do the spike, then implement.**
- **Verdict:** ✅ cleared for the owner's review. **No DB migration.** Ships as one release (v1.45.0).

## What shipped

### 1. OSF contributors push (commit `2761eae`, ADR-0005 am4)
The verify-don't-guess gate was the only blocker. The OSF docs site is a JS SPA (WebFetch got only the header), so the shape was confirmed against the **source-of-truth serializer** `api/nodes/serializers.py` → `NodeContributorsCreateSerializer` (fetched via `gh`): `POST /v2/nodes/{id}/contributors/`, `data.type="contributors"`; attributes `bibliographic` (default true), `permission` ∈ `read|write|admin` (default write), optional `index`; **unregistered** contributors use `full_name` + `email` (rule: user-id *or* full-name; no email with a user-id). Implementation: active workspace **members other than the pusher** (already the node's creator/admin) are added as **unregistered** contributors (`full_name` + optional email — our users are Clerk, not OSF accounts), `bibliographic:true`, `permission:"write"`, `?send_email=false`. Added **only on a new node** (amendments reuse the node — Amendment 3 — so contributors aren't re-added: the cross-push idempotency story). **Best-effort per contributor**: a failure (duplicate/bad email/hiccup) is skipped and never aborts the registration.

### 2. One-open-session invariant — app-layer (commit `9151e9a`, ADR-0044 am)
Owner chose "most capable + flexible without unnecessary DB work." So the "at most one open recruitment session among a study's runnable versions" invariant stays in the **application layer**: a shared `closeOtherRunnableSessions(studyId, keepVersionId)` helper, now called by `openRecruitment` (makeLive already enforces the same inside its transaction). A rigid **DB partial-unique was deliberately rejected** — it would have to be migrated away the moment concurrent multi-version routing is added. Preview sessions (autosave tip, non-runnable) are exempt.

### 3. A/B test opt-in UI (commit `9151e9a`, builder-conditions.md)
A/B stays **conditions-based** (the runtime already does weighted random assignment + per-condition results) — no version-level concurrency. The Builder conditions **empty state** gains an opt-in **"Set up an A/B test"** button that creates two even arms (*Group A* / *Group B*, 50/50) in one click via the existing `addCondition`, renamable/reweightable after. No new model, no schema; running as an A/B test is the researcher's explicit choice. Version-level concurrent A/B remains deferred (lowest-risk future path: per-version recruitment links, which compose with the v1.44.0 `version` column).

## Verification

- **Unit/integration:** **407 vitest green (45 files)** — +3: OSF contributor push (best-effort non-fatal failure; amendment skips contributors); `openRecruitment` one-open-session invariant (open v1 → freeze v2 → open → exactly one open session). The A/B affordance is a client component reusing the already-tested `addCondition` mutation, verified via tsc/build (this repo's vitest is node-env, *.test.ts only — no component tests).
- **Static:** `tsc`/`lint`/`build` clean (exit-code-gated). Manifest `validate.py` clean. Dashboard `dashboard-state` JSON re-parsed (per the `validate-dashboard-json` rule).
- **Not click-tested by the agent:** the "Set up an A/B test" button — shipped for the owner's live click-through. Prod smokes: a study with no conditions shows "Set up an A/B test" → click creates Group A + Group B at 50/50; for OSF, a preregistration push from a multi-member workspace lists the co-authors as contributors on the OSF node (and an amendment re-push does not duplicate them).

## Gates

- **Architecture:** ADR-0005 amendment 4 (contributors); ADR-0044 amendment (app-level invariant + A/B direction + concurrent-version deferral).
- **Design:** `builder-conditions.md` amended (A/B affordance + empty-state).

## Carry-forwards / deferred

- **Concurrent version-level A/B** — deferred; per-version recruitment links are the likely next step if a real need appears.
- **OSF registered-contributor path** (mapping our users to OSF user ids) — deferred; unregistered-by-email covers the realistic case.
- **OSF withdrawal** — still deferred (write contract needs owner-run live verification against a throwaway registration).
