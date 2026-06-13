# Wireframe spec — Graphic slider

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Drag a marker along an image to give a position-based rating (e.g. place a marker on a visual scale or face line) — a slider with an image track instead of a plain axis.

## Layout

The image with a draggable handle constrained to a horizontal track; the position maps to 0..1.

## Content inventory

- **imageUrl**, **required**.
- Records `{value}` — 0..1 normalized position. Why not slider/vas: those are axis-only with no image track.

## States

- **Default** — image loaded, interaction ready.
- **Loading** — the client island hydrates; the image loads.
- **Empty** — no image configured → builder "Needs setup" chip; participant sees a placeholder.
- **Partial** — partial answer allowed unless required.
- **Error** — invalid answer rejected server-side (graphic-slider-specific).
- **Success** — answer recorded; advances.

## Interactions

- Drag the handle, or click a point on the track; keyboard arrows move it.

## Edge cases

- Value normalized 0..1.
- Letterboxing: the track spans the rendered image width.
- No image → placeholder.

## Accessibility notes

- The handle is `role=slider` with `aria-valuemin/max/now` and arrow-key control — keyboard-complete.

## Open questions

- None blocking; advanced variants are ADR-0041 revisit triggers.
