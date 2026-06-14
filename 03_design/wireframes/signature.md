# Wireframe spec — Signature

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Capture a drawn signature (e.g. for a consent record) — the participant signs on a canvas; the image is stored privately.

## Layout

A bordered canvas to draw on, a Clear button, and a type-to-sign fallback field.

## Content inventory

- **prompt**, **required**.
- The canvas exports a PNG uploaded to private storage (resp/ key, served inline as a raster image — ADR-0041); records `{r2Key}`.

## States

- **Default** — image loaded, interaction ready.
- **Loading** — the client island hydrates; the image loads.
- **Empty** — no image configured → builder "Needs setup" chip; participant sees a placeholder.
- **Partial** — partial answer allowed unless required.
- **Error** — invalid answer rejected server-side (signature-specific).
- **Success** — answer recorded; advances.

## Interactions

- Draw with pointer/touch; Clear resets. Or type a name → rendered to the same PNG.
- On submit the PNG uploads via the participant presign (scoped by responseId).

## Results (researcher side)

- Signatures surface on the Results page as "N signatures captured — private to your workspace" with a **View signatures →** link to the Explore surface ([spatial-explore](spatial-explore.md), signature kind): a lazy paginated gallery + per-respondent viewer, served via the workspace-gated `/api/media` (ADR-0003 amendment 2026-06-14). The CSV export keeps the raw `r2Key` and gains the per-respondent Explore deep-link column.

## Edge cases

- Signature is PII — covered by the participant data download/delete flow; the `/api/media` gateway now enforces workspace-ownership for `resp/` keys (ADR-0003 amendment), so signature images are not world-readable by URL.
- Upload failure surfaces inline; the answer isn't recorded until the PNG lands.
- Storage unconfigured → the block explains it can't capture.

## Accessibility notes

- Type-to-sign is the honest keyboard alternative (renders the typed name to the same PNG) — not a fake keyboard-draw. Canvas has an aria-label.

## Open questions

- None blocking; advanced variants are ADR-0041 revisit triggers.
