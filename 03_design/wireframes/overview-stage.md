# Wireframe spec — Overview stage

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Studies › study › Overview (first stage)](../ia/information-architecture.md)
- **Persona:** [principal-investigator](../../02_product/personas/principal-investigator.md)
- **Status:** ready for handoff

## Purpose

Give the study a researcher-authored narrative — abstract + named sections (hypotheses, background, methods, analysis plan, ethics) — that travels with the study and is frozen into the preregistration record (V1.12 B1).

## Layout

Standard stage layout: `<StageTabs active="Overview">` (Overview is now the first tab) above a work-surface card. Inside: study title + one-line purpose, then the editor — an **Abstract** textarea, an ordered list of **Sections** (each = heading input + markdown textarea + reorder/remove), an **Add section** row with suggested-heading chips, and a **Save** button.

## Content inventory

- **Title** — from `studies.get`.
- **Abstract** — editable textarea, ≤5000 chars, stored in `definition_snapshot.overview.abstract`.
- **Sections** — ordered `{id, heading, contentMd}` (heading ≤200, markdown ≤20000, ≤30 sections). Each rendered as a card with up/down reorder, heading input, content textarea, remove.
- **Suggested headings** — static chips (Hypotheses / Background / Methods / Analysis plan / Ethics·IRB / References) that quick-add a named section; hidden once used.
- **Save** — `studies.setOverview` (PendingButton) + a transient "Overview saved" status.

## States

- **Default** — loaded overview (or empty abstract + no sections for a new study).
- **Loading** — server-rendered; resolves before paint.
- **Empty** — no sections yet → just the abstract + Add-section affordances.
- **Partial** — n/a (single fetch).
- **Error** — `setOverview` failure surfaces via the mutation; study-not-found → `notFound()`.
- **Success / optimistic** — "Overview saved" status for 3s after save.

## Interactions

- **Abstract / heading / content** — controlled inputs; edits clear the saved status.
- **Add section / suggested chip** — appends a section (chip pre-fills the heading).
- **Reorder ▴▾** — swaps a section with its neighbour.
- **Remove ✕** — drops the section.
- **Save** — writes the whole overview to the snapshot (preserving blocks).

## Edge cases

- Long abstract/sections — textareas scroll; server caps enforce max lengths.
- Zero sections — valid (abstract-only overview).
- Many sections (≤30 cap) — the page scrolls.
- Markdown is authored here but rendered (safely) where the overview is *displayed* (preregister narrative / OSF / public author page) — not in this editor for v1.

## Accessibility notes

- Each section is a labelled group; reorder buttons have aria-labels (Move up/down) and disable at the ends.
- Save status is `role="status"` (polite).

## Open questions

- Live markdown preview in the editor (split view) — deferred; the editor is author-only for v1.
- B2 (Export study as PDF) renders this overview into the PDF — built next in Wave 2.
