# Wireframe spec — Heat map

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Let participants click anywhere on an image to mark points of interest (e.g. where their eye went on a post) — free-point spatial capture.

## Layout

The image fills the card; clicks drop numbered dots. A list of points sits below, each removable.

## Content inventory

- **imageUrl**, **maxPoints?**, **required**.
- Records `{points: [{x, y}]}` — coordinates normalized 0..1 (survive resize, ADR-0041).

## States

- **Default** — image loaded, interaction ready.
- **Loading** — the client island hydrates; the image loads.
- **Empty** — no image configured → builder "Needs setup" chip; participant sees a placeholder.
- **Partial** — partial answer allowed unless required.
- **Error** — invalid answer rejected server-side (heat-map-specific).
- **Success** — answer recorded; advances.

## Interactions

- Click the image to add a point; click a point's Remove to delete it.
- Keyboard: "Add point" drops one at center; arrow keys nudge the focused point; Delete removes it.

## Edge cases

- Coordinates stored normalized so display width doesn't matter.
- maxPoints caps additions.
- No image → placeholder, no crash.

## Accessibility notes

- Keyboard path is in scope (add/nudge/remove without a pointer); each point is announced via an aria-live list; not pointer-only.

## Open questions

- None blocking; advanced variants are ADR-0041 revisit triggers.
