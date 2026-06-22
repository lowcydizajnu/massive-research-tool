# Wireframe spec — Library Materials tab

- **Serves user flow:** [Reuse workspace materials](../../02_product/user-flows/reuse-workspace-materials.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

A workspace-level library of reusable stimulus media a researcher uploads once and reuses across studies.

## Layout

Standard Library surface, Materials tab active in the sub-nav (Modules · Themes · **Materials** · Templates · Imports). Center column: a controls row (kind filter + search + sort + **+ Upload**) then a responsive card/tile grid (matches the Modules/Templates rhythm).

## Content inventory

- **Sub-nav pill** — five Library tabs; Materials active.
- **+ Upload** button — opens the OS file picker → presign + PUT to `ws/<workspace>/materials/…` → `materials.upload`.
- **Kind filter** — Images / Audio / Video / Documents / All. Source: client → `materials.list({ kind })`.
- **Search** — by name. **Sort** — recently used / most-used / recently uploaded / alphabetical.
- **Material card** (repeated) — preview (image thumbnail = the asset; audio/video/doc = a type icon), name, kind badge, use-count ("Used 3×"), tags. Source: `materials.list`.
- **Per-card actions** — Use in study (opens a study picker), Edit metadata, Delete, Download original.
- **Empty state** — copy + CTA (see States).

## States

- **Default** — grid of material cards for the active kind.
- **Loading** — skeleton tiles.
- **Empty** — "No materials yet. Upload one with + Upload, or save an asset from a study/Playground card." CTA: + Upload.
- **Uploading** — an optimistic tile with a progress/spinner state; resolves to the real card on success.
- **Error** — "Couldn't load materials." + Retry. Upload failure → inline toast, the optimistic tile is removed.
- **Storage not configured** — "Media storage isn't configured on this server." (+ Upload disabled.)

## Interactions

- **+ Upload** — pick file → client validates kind/size → presign (`ws/` namespace) → PUT → `materials.upload({ key, name, kind, … })` → tile appears. Error path: inline message.
- **Kind / Search / Sort** — re-query; preserved in URL search params.
- **Use in study** — opens a study picker; on choose, navigates to that study's Builder (full block-level wiring is via the block's Pick-from-Materials picker — see that wireframe).
- **Edit metadata** — modal (name / tags) → `materials.update`.
- **Delete** — confirm (warns "used in N studies" via `materials.usage`); soft-delete; tile removed; referring studies unaffected (orphan-safe R2 key).
- **Download original** — links to the `/api/media/<key>` gateway.

## Edge cases

- Very long names — truncate + title attr.
- 0 / 1 / many materials — empty state; grid virtualizes/paginates (cursor) at large N.
- Large files — size cap enforced client + server; clear error.
- Missing/!image preview — type icon fallback, never a broken image.
- Permissions — viewers can browse + pick but not upload/delete (write-gated).

## Accessibility notes

- Cards are a list; the card name is the primary control; action buttons have accessible names including the material name.
- The kind filter is a radiogroup with arrow-key nav; sort is a real select/listbox.
- Upload input is a labeled file input; progress announced via `aria-live`.

## Open questions

- Thumbnail generation for video (first-frame) vs. a generic icon — v1 uses an icon; real thumbnails are V2.x.
- Pagination vs. infinite scroll at large N — defer to build.
