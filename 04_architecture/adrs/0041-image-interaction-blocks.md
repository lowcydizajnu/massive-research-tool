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
