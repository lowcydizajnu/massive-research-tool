# QA — Condition assignment: split clarity + Balanced method (ADR-0109)

**Date:** 2026-07-18
**Author:** Paweł Rosner
**Scope:** Builder Conditions UX redesign + a Balanced (permuted-block) participant-assignment engine.
**ADR:** [ADR-0109](../../04_architecture/adrs/0109-condition-assignment.md) · **Wireframe:** [builder-conditions.md](../../03_design/wireframes/builder-conditions.md)
**Ships with:** migration `0061` (`condition_assignment` enum + `experiment_version.condition_assignment` column, default `simple`).

## What changed

Two plain-language controls now sit above the arms in the Builder's Conditions panel:

- **Group sizes** — *Equal* (each arm shows `≈X%`) or *Custom* (each arm's share as an editable percent with a live "Total: X%" nudge). The split mode is **derived** from the stored allocation weights plus a local override — no new stored `splitMode` flag (ADR-0109 D1).
- **Randomization** — *Simple random* (existing independent weighted draw, the **default**; unchanged behaviour, ADR-0014) or **Balanced** (new; permuted-block, ADR-0109 D3).

The raw allocation-weight number is gone from the researcher's view; the design-facts panel now discloses the assignment method and each arm's percentage (ADR-0109 D4).

## Verification

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | **0 errors** |
| `next lint` | **0 warnings/errors** |
| `assignment.test.ts` (pure algorithm) | **10 passing** |
| `participant.test.ts` (runtime, +3 balanced integration) | **29 passing** (was 26) |
| `design-facts.test.ts` (+1 assignment test) | **11 passing** |
| `validate.py` | **clean — 24 types, 300 instances** |

### Balanced-assignment evidence (permuted-block, live PGlite)

The three new `participant.test.ts` cases exercise the real runtime path (`startResponse` → `SELECT … FOR UPDATE` → seeded permuted-block → `response.conditionId`) against an in-process PGlite DB, not a mock:

- **Equal 2-arm, 4 real participants → exactly `[2, 2]`** (block size 2, balanced at every boundary).
- **1:2 ratio, 3 participants → exactly `[1, 2]`** (block `[0,1,1]` honoured).
- **Preview interleaved with real runs → real arms still `[2, 2]`** — a preview response does not consume an ordinal (ordinal counts only `mode='run'`), so it cannot perturb real balance.

Pure-algorithm properties (`assignment.test.ts`): exact balance at block boundaries, ratio honouring, reproducibility given `(weights, session, ordinal)`, within-block shuffle (order varies across blocks), independent shuffles per session, and all-zero-weights fallback to the first condition.

### Freeze propagation (the sharp edge)

`conditionAssignment` lives on `experiment_version` and must survive every freeze. Because freeze paths copy fields **explicitly** (never wholesale), the column was added to all **6** tip-freeze inserts (`saveAsNamed`, `save-request-review`, `preregister`, `amend`, `publish`, `makeLive`) **+ 3** fork/replicate inserts. Confirmed by grep across `studies.ts` (9 tip/fork sites carry `conditionAssignment` alongside the pre-existing `whiteboardViewport`). Missing one would silently downgrade a Balanced study to Simple on its next frozen version.

## Data-contract wiring confirmed (not dead UI)

Per the standing "tests can't see dead UI" lesson, the wiring was traced end-to-end in code:

- `studies.get` returns `conditionAssignment` (row → default `'simple'`).
- `studies.setConditionAssignment` (writeProcedure) updates the working tip + records a `study_edit_event`.
- `ConditionsSection` is mounted at `components/feature/builder/builder-workspace.tsx:1445` (not dead-imported); it binds `value={method}` to `studies.get` and calls `setConditionAssignment` on change.
- `deriveDesignFacts` receives the method from the version at its single production call site (`studies.ts` `getDesignFacts`); the design-facts panel renders **Assignment: Balanced / Simple**.

## Live UI verification (done)

Verified live in the real authenticated Builder — signed in as the `docs-capture+clerk_test@example.com` fixture user (which owns "Media Psychology Lab" in the **dev** Clerk instance) via `@clerk/testing`'s `email_code` flow against `next dev`, then opened a draft study's Build stage and drove the Conditions panel. Three states captured and inspected:

- **Simple / Equal** — each arm reads `≈50%` (no raw allocation-weight number anywhere), helper: "Each participant is assigned independently. Groups can come out uneven…".
- **Balanced / Equal** — the Scale icon, "Balanced" selected, helper: "Keeps groups even as participants arrive — evens out every 2 participants" (block size 2 for an equal two-arm split, matching `blockSizeFor`).
- **Balanced / Custom** — switching Group sizes to Custom normalises the two arms to editable `50` / `50` percent inputs with a live "Total: 100%".

The Balanced selection persisted across the query refetch and the weights normalised correctly, confirming `setConditionAssignment` + the split-mode logic work end-to-end through the real tRPC layer — not just in unit tests. The docs image `docs/images/builder/conditions-assignment.png` (referenced from `ab-testing.mdx`) is the Balanced/Equal capture. The test fixture study was reset to Simple/Equal afterward.

## Deploy (pending owner authorization)

Carries migration `0061`. Order is non-negotiable: **`db:migrate:prod` (EU `mrt-production`) BEFORE `git push`**, then verify `myresearchlab.app/api/health` flips to the new SHA. Push also publishes the updated `docs/methodology/ab-testing.mdx`.
