# Wireframe spec — Library template detail

- **Serves user flow:** [Use and save templates](../../02_product/user-flows/use-and-save-templates.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Maya — multi-site coordinator](../../02_product/personas/multi-site-coordinator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher preview a template's structure and metadata in enough detail to decide whether to clone it.

## Layout

Standard surface, Library active. Center column: a header (cover + name + Use template CTA), a metadata strip, then a **read-only block preview** of the template's frozen protocol (reusing the participant `BlockView` renderer in a non-interactive mode, like the Builder's Preview). Right context panel: metadata detail (created-by, created date, use-count, tags, visibility) + owner actions when applicable.

## Content inventory

- **Cover image** — large, with placeholder fallback. Source: `templates.get`.
- **Name** (serif H1) + **starter badge** (if `starter`). Source: `templates.get`.
- **Use template CTA** — primary; always present for any visible template.
- **Description** — full text (no clamp here). Source: `templates.get`.
- **Metadata strip / panel** — created-by (display name), created date, use-count, tags (chips), visibility label. Source: `templates.get`.
- **Read-only block list** — each block rendered via `BlockView` in preview mode (no inputs submit); shows the participant-visible content of the frozen version. Source: the template's `source_version_id` snapshot.
- **Owner actions** (caller's workspace owns it) — Edit metadata / Change visibility / Delete.

## States

- **Default** — header + metadata + block preview.
- **Loading** — header skeleton + a few block-row skeletons.
- **Empty** — N/A for a valid template (a template always has ≥1 block; if the frozen snapshot is somehow empty, show "This template has no blocks." rather than a blank canvas).
- **Partial** — metadata renders before the (heavier) block preview finishes.
- **Error** — "Couldn't load this template." + Retry + back-to-Templates link.
- **Not found / deleted** — "This template is no longer available." + back link.
- **Success / optimistic** — Use shows a pending state then redirects; metadata edits reflect optimistically.

## Interactions

- **Use template** — `templates.useTemplate({ templateId })` → fork → redirect to new study Builder. Disabled+spinner while pending; error toast on failure.
- **Tag chip** — links to the Templates tab filtered by that tag.
- **Owner: Edit metadata** — opens the metadata modal (`templates.update`).
- **Owner: Change visibility** — submenu → `templates.update({ shareScope })`.
- **Owner: Delete** — confirm → `templates.delete` → redirect back to the Templates tab.
- **Back** — breadcrumb/Top-bar back to `/library?tab=templates`.

## Edge cases

- Very long block list — the preview scrolls within the work surface; the header + Use CTA stay reachable (sticky CTA on small screens).
- Block types that need media (image/audio/video stimuli) — preview renders the media read-only; if a referenced asset is missing, show a labeled placeholder, never break the page.
- Public template viewed by a non-owner — owner actions absent; Use still works (forks into the viewer's workspace).
- Deleted between list → detail — show the not-found state.
- Slow network — progressive: header first, then preview.

## Accessibility notes

- Block preview is non-interactive: inputs are `disabled`/`aria-disabled` and not in the tab order, so keyboard users don't tab through a form they can't submit.
- The Use CTA has a descriptive accessible name including the template name.
- Heading hierarchy: template name = H1, "Preview"/"Details" = H2.
- Cover image: empty `alt` (decorative) since the name is the heading.

## Open questions

- Preview parity: full `BlockView` render vs. a lighter structural list? (Assumed: full preview, reusing the Builder Preview path for fidelity.)
- Do we show lineage ("based on study X") on the detail? (Assumed: no — a template is a standalone artifact; the source study link is owner-only metadata if shown at all.)
