# QA audit — 2026-06-14 — V1.38.0 Explorable spatial viz + export viz-link + image-upload-from-disk

## Overview

- **Auditor:** Claude (agent).
- **Scope:** the owner's three-part request — "as much as possible functional and explorative (where can I explore these vis), can we also add to excel also link to dedicated visualization, and allow img upload from disk." Designed via the `spatial-viz-explore-design` workflow + adversarial review; built per the corrected build order.
- **Verdict:** ✅ cleared for the owner's live review. **No database migration** — the per-respondent payload derives from existing `response_item.answer` + `response.conditionId` (ADR-0012 snapshot model). One security finding surfaced and respected by scoping (signature gallery deferred — see below).

## What shipped

1. **Explore surface (ask 1)** — `app/(app)/(study)/studies/[id]/results/explore/[instanceId]/page.tsx` (RSC) + `components/feature/results/spatial-explorer.tsx` (client island). Covers **heat-map**, **hot-spot**, **graphic-slider**. Controls: condition-filter chips, Aggregate↔Per-respondent + (heat-map) Dots↔Density segmented controls, opacity slider, per-respondent stepper (Prev/Next + ←/→). Block-type readout is the **authoritative** data layer (region-counts table / value histogram + mean·median·n / click totals); the dot/region/marker overlays are `aria-hidden`. Reached from a new "Explore responses →" link on the Results By-question section.
2. **`getResults.spatial` extension** — additive: `kind` + per-respondent `responses[]` (`responseId`, `conditionSlug`, `externalPid`, `points?`/`regionKeys?`/`value?`). Built from a new `itemsByBlockResp` map that preserves `responseId` (the pooled `itemsByBlock` deliberately drops it). Pooled `points`/`regions` unchanged → the inline `SpatialOverlay` (v1.37.0) is byte-for-byte untouched. graphic-slider now emits a synthesized pooled strip (`{x:value,y:0.5}`) so it also renders inline.
3. **Export viz-link (ask 2)** — pure `spatialLinks(results, studyId, origin)` in `lib/export/dataset.ts`; `toDelimited`/`toExcelCsv` gain an optional `{studyId, origin}` and append a `# Spatial visualizations (open in browser, signed in)` section (one raw absolute https Explore URL per spatial block). `dataset.ts` stays pure — `window.location.origin` is read only in the `"use client"` `ExportBuilder.exportFile()` handler. Raw URL over `HYPERLINK()` (CSV-injection-safe + auto-linkified everywhere); `instance_id` dropped from the visible mini-table (developer-term check).
4. **Upload from disk (ask 3)** — the 4 image-interaction blocks (`heat-map`, `hot-spot`, `graphic-slider`, `timed-exposure`) + `social-post` now render the "Upload from computer…" button on their `imageUrl` field. Detection extracted to the pure `mediaKindForField(blockKey, configKey)` in `lib/uploads.ts`; uploaded `/api/media/ws/<workspace>/…` keys already validate against the registry `mediaUrl` schema (no schema change).

## Verification

- **Unit/integration:** **363 vitest green (43 files, +8)**. New: `dataset.test.ts` (`spatialLinks` filters on `q.spatial`, builds `origin/studies/<id>/results/explore/<instanceId>`, `[]` when no spatial; `toDelimited` appends the section only with opts+links, drops `instance_id`); `studies.test.ts` (heat-map per-respondent `responses[]` with condition/PID + pooled-fields-intact; hot-spot per-respondent `regionKeys` + aggregate counts; graphic-slider `spatial` with value + synthesized strip); `uploads.test.ts` (`mediaKindForField` covers all 4 image blocks + social-post on `imageUrl`, keeps image/video `url`, excludes signature + `hot-spot.regions`).
- **Static:** `tsc --noEmit` clean, `next lint` clean, `next build` clean — the new `/studies/[id]/results/explore/[instanceId]` route registered (3.81 kB). Verify chain run **exit-code-gated** (`vitest && tsc && lint && build`), per the `gate-deploys-on-exit-codes` rule — no grep before the gate.
- **Manifest:** `validate.py` clean (125 instances; ADR-0041 amendment + `spatial-explore` wireframe registered).
- **Not click-tested by the agent:** the interactive island (chips, segmented controls, stepper, density grid, histogram) was verified by typecheck/build + the pure-logic + getResults integration tests, and shipped for the owner's live click-through.

## Security review (the load-bearing finding)

The adversarial review found the design's "the signature route is auth-gated" justification **false**: `app/api/media/[...key]/route.ts` is a **public gateway with no session check** — it validates only `isSafeMediaKey` and 302-redirects to a presigned GET for *anyone*. Privacy today rests on **unguessable** `resp/<responseId>/<ulid>.png` keys, i.e. security-by-unguessable-URL, not access control.

- **Heat-map / hot-spot / graphic-slider (shipped):** leak nothing new — points/region-keys/values/PIDs are already in `getResults.rows` for CSV at the same auth surface, and the stimulus image is a researcher `ws/` asset. Per-respondent exploration is safe to ship.
- **Signature gallery (DEFERRED):** a gallery would enumerate every signature `resp/` key for a study into the browser, materially widening exposure. It waits on either (i) a workspace-ownership check on `/api/media` for `resp/` keys, or (ii) formal acceptance of unguessable-URL in an ADR-0003 amendment + a security/QA log with the threat model. No code or copy claims signatures are "private to your workspace" until (i) lands. Recorded in the ADR-0041 amendment.

## Lock-in / safety review

- No new vendors. The Explore island is a client component over the already-loaded `getResults` payload (no new query, no refetch on filter — condition is reflected in the URL via `history.replaceState`). All new mutations: none (read-only feature). The upload path reuses the existing presign mutation + `/api/media` gateway; no new storage surface.
- Tokens-only styling: the island composes existing v0.6 primitives (`--color-primary` fills at varying opacity, chips, segmented controls, native range, divs-as-bars) — no raw hex, no new design-language decisions (design language locked at v0.6).

## Carry-forwards / deferred (owner-facing)

- **Signature gallery** — deferred pending the `/api/media` `resp/`-key authorization decision (security item above).
- **Per-condition small multiples** (side-by-side mini-stimuli) vs the single-panel + chip filter — single panel ships first.
- **Audit-log backfill gap** — the block-expansion arc (v1.32.0–v1.37.0, 2026-06-13/14) shipped without per-tag audit logs; this log covers v1.38.0 only. Backfilling that arc is a separate housekeeping item.
