# Wireframe spec — Frameworks browse

- **Serves user flow:** [Browse frameworks](../../02_product/user-flows/browse-frameworks.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Help any researcher (Hanna, Maya, Marek, Sofia) find a curated Framework to start a study from, and signal Framework quality (verified, version, derived-studies count).

## Layout

Standard three-zone modular surface per brief v0.6 — slim top bar, left rail (Frameworks active), center column with sub-nav pill (All · Verified · By theme · My drafts) + Framework card grid below, right context panel collapsed by default.

## Content inventory

- **Top bar** — workspace chip + breadcrumb (`Misinformation Lab · Frameworks`); ⌘K + user avatar.
- **Sub-nav pill** — All · Verified · By theme · My drafts.
- **Work surface — Framework card grid** — 2-column at desktop. Each card: Framework name (Plex Serif display 17px), verified badge if applicable (`color.primary.subtle` chip with `ti-rosette-discount-check` icon), theme tag, version (`text.mono`), derived-studies count, 2-line description.
- **Card action affordance (hover)** — right side: `Start a study from this` button + `+ Follow` ghost button.
- **Right context panel (when a card is selected)** — Framework detail tabs Overview / Used in / Versions / References. Action row top: `Start a study from this Framework` primary, `+ Follow` secondary.

## States

- Default — 1-3 framework cards (Misinformation Research Framework as launch); for V1 the grid is sparse.
- Loading — skeleton cards.
- Empty (My drafts sub-nav with zero) — "Authoring a Framework? Start by saving a Template, then submit."
- Deprecated — Versions tab banner with migration target.

## Interactions

- Card click — selects; right panel opens with Framework detail.
- `Start a study from this` — opens New study modal with Framework preselected, picker dismissed.
- `+ Follow` — adds Framework to follow targets per IA v0.3.

## Edge cases

- Long description — clamp 2 lines with ellipsis.
- Workspace with read-only role — primary action disabled with tooltip.
- Framework with very many derived studies — count shows `1.2k` thousands-formatted.

## Accessibility notes

- Sub-nav pill = `role="tablist"`.
- Cards focusable in DOM order; Enter opens detail.
- Verified badge has `aria-label="Curator-verified"`.
- Primary `Start a study from this Framework` button is the first focusable item once a card is selected.

## Open questions

- Card vs list view — card grid feels more discovery-oriented; list might fit dense workspaces. Defer.
- Theme tag visual treatment across cards — does each Framework get one theme tag or multiple? Lean: one canonical theme + optional sub-tags.
