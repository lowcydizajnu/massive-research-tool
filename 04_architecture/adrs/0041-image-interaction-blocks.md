# ADR 0041 — Image-interaction blocks (coordinate-capture primitive)

- **Status:** accepted
- **Date:** 2026-06-13
- **Deciders:** project owner + Claude
- **Tags:** participant-runtime, blocks, storage

## Context

The block-expansion plan calls for four image-interaction blocks: **heat-map** (click anywhere on an image, capture points), **hot-spot** (click predefined regions), **graphic-slider** (drag a marker along an image), and **signature** (draw → image). All need participant pointer interaction over an image, which the JS-free MPA runtime otherwise lacks. The adversarial review flagged a load-bearing flaw: the planned anti-XSS control ("`/api/media` sets `Content-Disposition: attachment`") is unimplementable — that route 302-redirects to a presigned R2 GET and a redirect can't add response headers.

## Options considered

### Coordinate storage — Option A: normalized 0..1 fractions (chosen) · Option B: pixels

- **A:** every captured coordinate is stored as a fraction of the image's natural dimensions, so it survives responsive resize, retina, and re-display at any width. **Chosen.**
- **B:** pixels break the moment the image renders at a different size. Rejected.

### Component shape — Option A: a shared coord helper + thin per-block islands (chosen) · Option B: one mega-component

- **A:** `lib/take/image-coords.ts` (pure normalize) + four small `"use client"` islands (ADR-0013 exception #4). Each block's interaction differs enough (multi-point vs region-buttons vs 1D drag vs canvas draw) that one prop-heavy component would be worse than four focused ones sharing the math. **Chosen.**

### Disposition control (review 🔴) — Option A: sign it into the presigned URL (chosen)

- The presigned R2 GET accepts `response-content-disposition` as a signed query param, which the 302 carries. `presignDownload` gains a `disposition` arg; `/api/media` serves untrusted participant uploads (`resp/`) as `attachment` UNLESS the key is a raster image extension (png/jpg/jpeg/webp/gif — never svg/html), so signature PNGs and picture answers still render inline while a crafted HTML/SVG upload force-downloads. Researcher assets (`ws/`, authenticated uploader) stay inline. This is the ADR-0003 amendment, landed here because signature is the first participant-served upload.

## Decision

We will add the four blocks as ADR-0013 client islands over a shared normalize helper, storing normalized 0..1 coordinates. heat-map records `{points:[{x,y}]}`, hot-spot `{selected:[regionKey]}` against config regions `{key,label,x,y,w,h}` (also normalized), graphic-slider `{value:0..1}`, signature uploads a canvas-exported PNG to R2 via the existing `/api/take-upload` presign and records `{r2Key}`. The signed-disposition control (above) lands now. Every block has a keyboard path: heat-map points are arrow-nudgeable + removable and addable without a pointer; hot-spot regions are focusable buttons; graphic-slider is `role=slider` with arrow keys; signature offers a type-to-sign alternative that renders the typed name to the same PNG. Pointer-only is never the sole path.

## Consequences

- **Easier:** spatial measures (where attention/clicks land on a post) — strong for misinformation; signatures for consent records.
- **Harder:** four client islands to maintain; signature is PII (covered by the participant data download/delete flow).
- **Committed to:** normalized coordinates; raster-image-only inline serving for participant uploads; keyboard parity in v1.
- **Precluded from:** polygon hot-spot regions (rect-only v1) and heat-map aggregation overlays (out of scope; revisit triggers).

## Revisit triggers

- Researchers want polygon regions or an aggregated heat overlay → extend the region model / add a Results visualization.
- A non-raster inline preview is needed (e.g. PDF) → add a sandboxed viewer rather than inline-serving the upload.

## References

- block-expansion-design workflow plan + adversarial review (finding 🔴-1)
- [ADR-0003](0003-asset-storage.md) (amended here: signed disposition), [ADR-0013](0013-participant-runtime-and-analytics.md) (client islands)
- Wireframes: [heat-map](../../03_design/wireframes/heat-map.md), [hot-spot](../../03_design/wireframes/hot-spot.md), [graphic-slider](../../03_design/wireframes/graphic-slider.md), [signature](../../03_design/wireframes/signature.md)
- Code: `lib/take/image-coords.ts`, `components/feature/take/{heat-map,hot-spot,graphic-slider,signature}-input.tsx`, `server/adapters/storage.{ts,r2.ts}`, `app/api/media/[...key]/route.ts`

---

## Amendment (2026-06-14) — explorable spatial results (revisit trigger: "add a Results visualization")

The first revisit trigger above ("an aggregated heat overlay → add a Results visualization") fired. v1.37.0 shipped the inline aggregate overlay (`SpatialOverlay`, pooled clicks/region-hits on the stimulus). This amendment adds a **dedicated, explorable per-respondent surface** and records the decisions the workflow + adversarial review settled.

### `getResults` `spatial` payload — additive, migration-free

`ResultsSummary.questions[].spatial` is extended (no DB migration — everything derives from existing `response_item.answer` + `response.conditionId`):

- Added `kind: "heat-map" | "hot-spot" | "graphic-slider"` — lets the surface dispatch per block type.
- Added `responses[]`: one row per completed respondent for this block — `{ responseId, conditionSlug, externalPid, points?, regionKeys?, value? }`. Built from a new `itemsByBlockResp` map that keeps `responseId` alongside the answer (the existing `itemsByBlock` threw it away — pooling-only).
- Pooled `points`/`regions` stay exactly as-is, so the inline `SpatialOverlay` is untouched. **graphic-slider** now also emits a synthesized pooled `points` strip (`{x: value, y: 0.5}`) so the inline overlay shows the marker-position distribution, and gets a per-respondent `value`.
- Backward-compatible: a stale client reading only the v1.37.0 fields keeps working.

### Route slug — `…/results/explore/[instanceId]`

The dedicated page lives at `studies/[id]/results/explore/[instanceId]` (sibling of `…/results/export`). **Why "explore" not "spatial":** "spatial" is a developer term; "explore" reads researcher-native (the export-link copy and any visible label must follow — developer-term check). This is the URL the CSV/Excel export links to.

### Privacy — signature gallery DEFERRED (real finding)

The review found that the spec's "the signature route is auth-gated" justification is **false**: `app/api/media/[...key]/route.ts` is a public gateway with no session check — privacy currently rests on unguessable ULID keys (`resp/<responseId>/<ulid>.png`), i.e. security-by-unguessable-URL, not access control. Aggregate heat/hot-spot and per-respondent points/values/PIDs leak nothing new (they're already in the CSV `rows` at the same auth surface), so **wave 1 ships heat-map + hot-spot + graphic-slider exploration**. A **signature thumbnail gallery enumerates every signature key for a study into the browser**, which materially widens that exposure — it is **deferred** until either (i) `/api/media` enforces workspace-ownership for `resp/` keys, or (ii) unguessable-URL is formally accepted in an ADR-0003 amendment + QA security log with the threat model. No code or privacy copy may claim signatures are "private to your workspace" until (i) lands.

### Performance — hard cap, not a suggestion

The explore surface renders per-respondent dots and re-renders on every condition-filter toggle. Dots are **hard-capped** (auto-switch to the density grid above the cap), memoized per filter change — not a soft "showing first N" note.

### Scope of this amendment

- **In:** the additive `spatial` shape; the `explore/[instanceId]` page (heat-map + hot-spot + graphic-slider); the CSV/Excel viz-link column; the inline "Explore responses →" link.
- **Deferred:** signature gallery (privacy, above); `/api/media` `resp/` authorization (security item, tracked separately).

### Amendment references

- spatial-viz-explore-design workflow + adversarial review (2026-06-14)
- Wireframe: [spatial-explore](../../03_design/wireframes/spatial-explore.md)
- Code: `components/feature/results/spatial-explorer.tsx`, `app/(app)/(study)/studies/[id]/results/explore/[instanceId]/page.tsx`, `server/trpc/routers/studies.ts` (getResults), `lib/export/dataset.ts` (`spatialLinks`)
