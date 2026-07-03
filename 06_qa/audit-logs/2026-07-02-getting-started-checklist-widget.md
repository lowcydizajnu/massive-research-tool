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

- Users with a saved dashboard layout won't see the widget until they add it
  via Customize (user-override-wins is the ADR-0045 contract).
- The "Connect OSF" step links to Settings → Connections; the deferred OSF
  refresh-on-401 work (V1.15 backlog #5) remains deferred and untouched.
