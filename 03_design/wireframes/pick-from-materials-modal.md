# Wireframe spec — Pick from Materials modal

- **Serves user flow:** [Reuse workspace materials](../../02_product/user-flows/reuse-workspace-materials.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher insert a workspace material into the block they're editing, without re-uploading — the owner-pinned core of L3.

## Layout

A centered modal opened from a block's media-config field, alongside the existing "Upload from computer" button (a new **Pick from Materials** affordance). Header (title + kind filter), a scrollable tile grid of materials, footer (Cancel). Selecting a tile applies immediately and closes.

## Content inventory

- **Title** — "Pick from Materials".
- **Kind filter** — defaults to the field's expected kind (image field → Images), with an "All" escape. Source: the calling field's kind + `materials.list({ kind })`.
- **Search** — by name.
- **Material tile** (repeated) — preview (image thumbnail / type icon), name, kind badge. Source: `materials.list`.
- **Empty state** — "No {kind} materials yet — upload one in Library → Materials." (+ a link to the Materials tab.)
- **Cancel** — closes without changing the field.

## States

- **Default** — grid filtered to the field's kind.
- **Loading** — skeleton tiles.
- **Empty** — kind-specific empty copy + link to Materials.
- **Selecting** — brief pending state on the chosen tile, then close + apply.
- **Error** — "Couldn't load materials." + Retry.

## Interactions

- **Open** — the block's media field shows two options: "Upload from computer" (existing, study-scoped) and **Pick from Materials** (this modal).
- **Kind filter / Search** — re-query within the modal.
- **Select a tile** — sets the block config's media field to the material's **R2 key** (NOT the material id — orphan-safe), closes the modal; the block preview re-renders with the asset. Increments the material's use-count (best-effort).
- **Cancel / Esc / backdrop** — close, no change.

## Edge cases

- Field already has a media value — picking replaces it (the prior study-scoped upload, if any, is left in storage; only the reference changes).
- No materials of the field's kind — empty state nudges to upload; the "All" filter still lets them pick a different-kind asset if the field allows it.
- A material deleted between list and select — show "no longer available," refresh the grid.
- Many materials — grid scrolls within the modal; search narrows.

## Accessibility notes

- Focus trap; Esc closes; focus returns to the Pick-from-Materials trigger.
- Tiles are a listbox/grid with arrow-key navigation and Enter to select; each tile's accessible name includes the material name + kind.
- The kind filter is a labeled radiogroup.

## Open questions

- Should picking the same asset into multiple fields each bump use-count, or count distinct studies? (Assumed: bump per pick; cheap + good enough.)
- Multi-select (insert several at once into a gallery field) — deferred; single-select for v1.
