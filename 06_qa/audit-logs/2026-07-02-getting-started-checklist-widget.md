# QA audit — 2026-07-02 — "Start here" getting-started checklist widget

## Overview

- **Auditor:** Claude (agent), at the owner's direction. Owner decisions locked
  via AskUserQuestion 2026-07-01: placement = **Home widget only** (no /studies
  entry point); steps = **core loop + community** (8 items incl. Connect OSF).
- **Scope:** New personal-Home dashboard widget showing 8 condition-derived
  first-steps, each deep-linking to its surface. New `me.gettingStarted` tRPC
  query; `getting-started` widget key + default-layout slot; no new persistence
  (dismissal = remove the widget via Customize); no migration.
- **Gates honored:** user flow (`getting-started-checklist.md`) + wireframe spec
  (`getting-started-widget.md`) written **before** code; no ADR needed — reuses
  the ADR-0045 widget substrate and the stateless-derivation pattern of the
  study Dashboard's next-actions; vocabulary checked against design-rules
  (Preregister / Recruitment / Browse / Workspace — no developer terms).
- **Verdict:** done — **919 vitest green** (3 new), tsc/lint/build clean,
  manifest validator clean (258 instances incl. the 2 new artifacts).

## What changed

- **`me.gettingStarted`** (`server/trpc/routers/me.ts`) — existence probes
  (limit 1) over existing tables; same authored-studies basis + demo filter +
  ADR-0082 View-as guard as `me.stats`, so the checklist can't disagree with
  the KPIs beside it. Returns 8 booleans + the newest authored study for links.
- **Widget registry** — `getting-started` key (`Start here`, personal, medium);
  second slot in `USER_DASHBOARD_DEFAULT_LAYOUT` (right under the greeting).
  Users with a saved layout add it from Customize (user-override-wins, by design).
- **`GettingStartedWidget`** (`home-widgets.tsx`) — semantic `<ul>`, ✓ done rows
  muted / ○ undone rows as links, sr-only state text, tokens only. Steps 2–5
  deep-link into the newest study via `openStudyAction` (stage union extended
  with `"results"`); fallback `/studies` with no study yet.
- **Docs** — user flow + wireframe spec (new artifacts), this audit log.

## Adversarial review (10-agent workflow: 3 lenses → per-finding verification)

6 confirmed findings, all minor, **all fixed before commit**:

1. `invitedTeammate` probe missed the ADR-0082 View-as guard every sibling
   workspace-join in the router applies → guard added.
2. Undone-state glyph used `--color-border-subtle` (8%/6% alpha — invisible in
   both themes) → switched to `--color-text-muted`.
3. Wireframe said step 3 links to Build; the code (correctly) links to Run,
   where Preregister/Publish live → spec reconciled to Run.
4. Flow-doc derivation table drifted from the code on steps 2 (any historical
   version with blocks counts) and 5 (completed run responses only) → table
   reconciled to the implemented semantics.
5. STATUS.md/dashboard entries owed → written with this audit.
6. Duplicate of 3 via the flow doc's target list → reconciled.

## Tests

- `server/trpc/__tests__/me.test.ts` — fresh account: all 8 false + null study;
  full seeded loop (block-less draft → built/published version → recruitment →
  completed run response → saved record → pending invite → OSF connection):
  each step flips only when its rows exist; demo teammates and revoked OSF
  connections don't count.

## Verification

- `npm run typecheck` / `npm run lint` / `npx vitest run` (919) /
  `npm run build` — clean. `python3 00_meta/manifest/validate.py` — clean.
- Deploy: pending owner "deploy"; verify at myresearchlab.app/api/health.

## Known limitations (by design, documented in the flow)

- (Superseded by the Revision below — the pinned card now shows regardless of a
  saved layout.)
- The "Connect OSF" step links to Settings → Connections; the deferred OSF
  refresh-on-401 work (V1.15 backlog #5) remains deferred and untouched.

---

## Revision — pinned card, not a widget (2026-07-02, owner feedback)

The first cut shipped as a customizable dashboard **widget** and failed on contact:
(1) a saved dashboard layout silently dropped it (the owner never saw it); (2) it lived
only on `/home`, not the workspace `/dashboard` the owner treats as home base; (3) with
zero studies all study-steps fell back to `/studies`, which re-fired the 5-step tour.

**Reworked (ADR-0045 am. 2026-07-02):**
- **Removed from the widget system.** Now a **pinned card above the grid on BOTH
  dashboards** (`GettingStartedCard`, client), independent of saved layout — so it shows
  by default for everyone, including customized accounts.
- **Own × dismiss** → `dismissedGettingStarted` in publicMetadata (cross-device; the flag is resolved server-side onto the identity, so a dismissed card never flashes); also self-hides once all 8 steps are done.
- **No dead links / no tour re-fire.** "Create your first study" and every study-step
  while no study exists open the **New-study modal**; once a study exists the study-steps
  deep-link into it (workspace-switch handled). Community steps → Browse / Team / Settings.
- **2-column step layout** (owner: full-width with short labels wasted space).
- **"Add your first block"** carries a one-line teaser naming only the **shipped**
  signature blocks — Social post + AI conversation. Hume/voice deliberately excluded
  (the EVI voice block is unshipped; Hume emotion measurement was discontinued,
  ADR-0066 am.) — no promoting vaporware.
- **Dismiss flag read server-side** onto `AuthUser.dismissedGettingStarted` (from the
  publicMetadata `getCurrentUser` already fetches — no extra Clerk call), so the card
  uses no Clerk client hook and a dismissed card never flashes. +2 tests
  (`dismiss-getting-started`). No migration.

## Revision 2 — correctness review of the rework (2026-07-02)

A focused correctness review of the pinned-card diff confirmed the wiring is sound
(server-action-as-form-action in a client component is valid — mirrors the shipped
workspace switcher; both dashboards are under `NewStudyProvider` + `ClerkProvider`;
no dangling `getting-started` widget key; no dead imports) but found **one real bug**:
the card's `dismissed` flag was read **client-side** via `useUser().isLoaded`, which is
`false` during SSR + first render — so a dismissed card's full markup was server-rendered
and yanked on hydration (a flash-of-dismissed-card on every dashboard load). **Fixed
before deploy** by resolving `dismissed` server-side onto the identity (above): the card
never renders for a dismissed user, so no flash and no layout shift. Re-gated:
tsc/lint/**921 tests**/build/validator all green.

Owner idea logged for the **next** scoped item: seed every new user a labeled, deletable
**training study** from the misinfo starter (reusing the `is_demo` stats-exclusion infra)
so onboarding is hands-on — a better feature showcase than checklist copy.

Verification: preview screenshots of the card on both dashboards (see deploy note);
tsc/lint/vitest/build/validator green; adversarial review re-run on the rework.
