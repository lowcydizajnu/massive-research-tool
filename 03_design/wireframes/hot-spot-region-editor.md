# Wireframe spec — Hot-spot region editor (Builder Configure)

- **Serves user flow:** [Hanna builds a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Build stage · block · Configure (right panel)](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Decisions for this surface are recorded in the [ADR-0041 amendment (2026-06-14b)](../../04_architecture/adrs/0041-image-interaction-blocks.md).

Hot-spot blocks define clickable **regions** on a stimulus image — `{key, label, x, y, w, h}` normalized 0..1. Today those region objects fall through the Builder's generic text editor and render as `[object Object]`, so they can't be authored by hand without corrupting the config. This surface lets the researcher **draw** regions directly on the image and **read** them in a labelled list — no coordinate typing — reusing the same normalized model and `normalizedPoint` helper the participant runtime uses.

## Layout

Replaces the generic field for `hot-spot.regions` inside the Configure right panel. Top to bottom:

1. **Stimulus canvas** — the configured image (`config.imageUrl` via `/api/media`) in a `relative overflow-hidden` bordered box, with each region drawn as an absolutely-positioned box (same visual treatment as the participant render: selected = `--color-primary` border + translucent fill; unselected = subtle border). A live dashed rectangle previews an in-progress draw.
2. **Region list** (the "reading" half) — one row per region: a color/key chip, a label text input, nudge/resize controls, and a delete (✕). Selecting a row highlights its box and vice-versa.
3. **Add region** button — creates a default-centered region (keyboard path; no pointer needed).

All visuals compose existing v0.6 tokens (`--color-primary`, `--color-border-medium`/`-subtle`, `--color-surface-subtle`, `--radius-sm/md`, text tokens) — nothing new in the design language.

## Content inventory

- **Regions** — `{key, label, x, y, w, h}` normalized 0..1; rect-only (polygons deferred, ADR-0041).
- **Region keys** — stable, auto-assigned (`r1, r2, …`, first free), **frozen on edit** so already-collected responses' `selected`/`regionKeys` stay valid.
- **No-image state** — if `imageUrl` is empty: "No image configured — add an image above to draw regions"; the region list stays editable (labels/keys) so a researcher isn't blocked.

## States

- **Default** — image + existing regions; nothing selected.
- **Empty** — image present, no regions yet → "Drag on the image to draw a region, or Add region."
- **Drawing** — pointer down→move shows a live dashed preview rectangle; release commits a region (above min size) or selects (a click).
- **Selected** — one region highlighted on the image and in the list; arrow keys nudge/resize it; Delete removes it.
- **No-image** — placeholder canvas; list still editable.

## Interactions

- **Draw** — drag on the image; both corners normalized via `normalizedPoint`, combined into `{x, y, w, h}` with positive extents, clamped 0..1. A drag below the min-size threshold is treated as a click → selects the topmost region under the point.
- **Select** — click a region box or a list row; both are focusable; Tab cycles them; focus sets selection (`aria-pressed`/`aria-current`).
- **Label** — the row's text input commits on blur/Enter; never rewrites the key.
- **Add region** (button) — inserts a default-centered region and selects it.
- **Move** — ←/↑/→/↓ nudge the selected region by 0.01 (Shift = 0.1), clamped inside 0..1.
- **Resize** — Alt+arrows (and labelled grow/shrink controls) adjust w/h by 0.01, clamped.
- **Delete** — Delete/Backspace on a focused region box (never while typing in a label), plus the row's ✕.

Every change commits through the existing `updateBlockConfig` path; regions live in `definition_snapshot.blocks[].config` JSON (ADR-0012) — no migration.

## Edge cases

- **Rect-only** — polygons are an ADR-0041 revisit trigger, not v1.
- **Overlapping regions** — topmost (last-drawn) wins for click selection.
- **Tiny drag** — below min size → treated as a click, not a 0-area region.
- **Frozen keys** — relabel/move/resize/reorder never change a region's key, so existing responses stay valid (registry `validateAnswer` rejects stray keys).
- **Image changed after regions drawn** — regions are normalized, so they reposition proportionally on the new image (researcher can adjust).

## Accessibility notes

- Keyboard parity is mandatory (ADR-0041): add (button), select (Tab/focus), move (arrows), resize (Alt+arrows or labelled controls), relabel (row input), delete (Delete on focused box + ✕) — no pointer-only affordance.
- Each region is a focusable labelled `<button>` (mirroring the participant render) and has a focusable list row. The **region list is the authoritative readout** — label + key are conveyed as text, never by position/color alone. The live draw preview is decorative (`aria-hidden`).
- Key handlers `preventDefault` only for the keys they own, so typing in a label is never hijacked.

## Open questions

- Pointer drag-to-move / corner-handle resize of an existing box — deferred (arrow-key move/resize already gives a complete, a11y-required path); geometry helpers are written to support it later.
- Per-region distinct colors vs the uniform `--color-primary` treatment — uniform first (matches the participant view); distinct colors a later nice-to-have.
- Min-region-size threshold (proposed 0.02 normalized) — confirm in handoff.
