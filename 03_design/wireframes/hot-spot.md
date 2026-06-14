# Wireframe spec — Hot spot

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Predefined clickable regions on an image — participants select which region(s) apply (e.g. "which part of this post is misleading?").

## Layout

The image with translucent region overlays; clicking a region toggles it selected.

## Content inventory

- **imageUrl**, **regions** (`{key, label, x, y, w, h}` normalized, each with an optional **visible** flag), **multiple?**, **required**.
- Records `{selected: [regionKey]}`.
- **Invisible regions** (ADR-0041 amendment 2026-06-14c): a region with `visible:false` draws no outline/fill for the participant but stays clickable + keyboard-focusable (focus ring + `aria-label`) — an invisible click zone, never pointer-only. Toggled per region in the Builder.

## States

- **Default** — image loaded, interaction ready.
- **Loading** — the client island hydrates; the image loads.
- **Empty** — no image configured → builder "Needs setup" chip; participant sees a placeholder.
- **Partial** — partial answer allowed unless required.
- **Error** — invalid answer rejected server-side (hot-spot-specific).
- **Success** — answer recorded; advances.

## Interactions

- Click a region to toggle; single or multiple per `multiple`.

## Edge cases

- Regions are rect-only in v1 (polygons deferred).
- A selected region whose key isn't in config → rejected server-side.
- Overlapping regions: topmost wins the click.

## Accessibility notes

- Each region is a focusable, labelled `<button>` with `aria-pressed` — full keyboard path, no pointer needed.

## Open questions

- None blocking; advanced variants are ADR-0041 revisit triggers.
