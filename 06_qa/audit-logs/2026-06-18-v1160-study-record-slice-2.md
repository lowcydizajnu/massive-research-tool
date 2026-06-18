# QA audit — 2026-06-18 — Study Record Slice 2 (composer + composed read page)

## Overview

- **Auditor:** Claude (agent), at the owner's direction ("continue with Slice 2").
- **Scope:** ADR-0054 §41 Slice 2 — the composable Study Record: data layer, section registry + `studyRecord` router, the drag-and-drop composer, and the composed public read page.
- **Verdict:** done — functionally complete end-to-end, no blockers. **Carries migration 0024**; run `npm run db:migrate:prod` BEFORE the deploy (tag `v1.16.0-a9`).

## What shipped (4 commits)

1. **Data layer** (`60c7aae`): `study_record` table (one row per experiment) — `visibility`, `abstract`, `article_url`/`article_doi`, ordered `layout` jsonb `{type, content?, hidden?}`, `published_at`, `updated_at`. Migration `0024_shallow_tempest`. Data-model doc `06-study-record.md`. Mirrors `dashboard_layout` (reuses the Stream F model).
2. **Server core** (`83a2a96`): `lib/study-record/sections.ts` (section-type registry: bound vs authored + default layout + `sanitizeLayout`); `studyRecord` router (`writeProcedure` + tenant check) — `getForEdit` (lazy-creates the row; returns layout + authored fields + bound-section availability), `saveLayout`, `saveAuthored`, `setVisibility` (public = publish).
3. **Composer UI** (`87b363a`): `/studies/[id]/record` + `record-composer.tsx` — dnd-kit sortable column (keyboard reorder + move-up/down), hide/remove, Add-a-section palette (From-your-data / Write-your-own), inline authored editing, sticky Save + Publish/Unpublish footer. Entry from the Results finish card.
4. **Composed read page** (this commit): `getPublicStudy` returns the published record (`record` field, null until visibility=public); `/browse/[studyId]` renders sections in the saved order honouring hide + authored content, falling back to the default bound composition when unpublished.

## Money + PII boundary (held)

- **No money** touched anywhere in Slice 2.
- **PII (ADR-0014):** the public read path resolves bound sections from the frozen version snapshot + aggregate counts only. Results/Data sections render a fixed "aggregate shared with replicators; raw participant data stays private" note — **no raw response rows ever resolve into a public section**. The `record` payload carries authored prose + the layout only.

## Publish gate (ADR-0054)

`setVisibility('public')` rejects (PRECONDITION_FAILED) unless the study is **public-replicable** (same gate as Browse) **and** the record has a **non-empty abstract**; it stamps `published_at` once and preserves it across an Unpublish. Verified by test.

## Tests (8 new, `server/trpc/__tests__/study-record.test.ts`; real migrated PGlite)

- `getForEdit` lazily creates the default-layout row + reports empty bound availability; idempotent (one row).
- availability flips for preregistration once preregistered.
- `saveLayout` persists order + hidden, keeps `content` only on narrative/custom, **drops unknown types**.
- publish-gate sequence: blocked without public-replicable → blocked without abstract → succeeds + stamps `published_at`; abstract trimmed.
- Unpublish keeps the `published_at` history.
- cross-workspace `getForEdit`/`saveAuthored` → NOT_FOUND.
- `getPublicStudy.record` is null until published, then carries the composed layout (order + hide + authored content).
- Migration test asserts the `study_record` table exists.

## Verification

- **579 vitest green (61 files)**; `tsc --noEmit`, `next lint`, `next build` all clean (exit-code-gated); `validate.py` clean at 172 instances; dashboard JSON re-validated (`json.loads`).
- The composer + read page are auth-gated surfaces — verified via build + type/route checks + the router tests; owner browser review on the deploy (the project's per-deploy review posture).

## Deferred (with WHY — not oversights)

- **Results/Data aggregate granularity** — the *public* aggregate stats render is intentionally a placeholder note; the exact granularity is an open ADR-0054/0014 question (owner + PII decision) and warrants its own slice, not an invented statistic.
- **Materials section** — needs a media inventory query; greyed in the palette + omitted on the read page until then.
- **OSF sync** (face vs archive) — rides the deferred OSF-OAuth refresh work ([[osf-5-deferred]]).
- **`study_finished` activity event** — notification nicety, still deferred from Slice 1.

## Bottom line

Slice 2 is **functionally complete**: finish a study → compose its Record (reorder/hide bound sections, write abstract/narrative/article/custom) → publish → the public `/browse/[studyId]` page reflects the composed layout. Money + PII boundaries held. Safe to deploy on the owner's go — **migration 0024 must run on prod first** (tag `v1.16.0-a9`).
