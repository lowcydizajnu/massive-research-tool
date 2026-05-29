# Wireframe spec — Module picker popover

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

The popover that opens when Hanna clicks `+ Add block` in Builder mode. Lets her pick a module to insert, scoped to her workspace + public catalogue.

## Layout

Popover anchored to the `+ Add block` affordance, ~360px wide, ~440px tall. `surface.raised` background, `radius.lg`, `shadow.md`. Closes on Esc, outside-click, or Insert action.

Vertical structure:

- **Search input** (top, focused on open).
- **Category tabs** — All · Used in this study · Recent · Favorites. Pill row.
- **Module list** — scrollable; each row title + `text.mono` identifier + small theme chip.
- **Selected module preview** — sticky bottom, shows the picked module's brief description + `Insert` primary button.

## Content inventory

- **Search input** — placeholder "Search modules…", `/` keyboard shortcut.
- **Category tab strip** — All / Used in this study / Recent / Favorites. Active tab Plex Serif 500, others Plex Sans `text.muted`.
- **Module row** — title (`text.body.emphasis`) + Plex Mono identifier (`source/key@version`) on a second line + theme chip on the right.
- **Selected preview** — module name + 1-line description + `Insert` primary button.

## States

- Default (just opened) — search empty, "All" tab active, full module list.
- Searching — list filters live; "no results" empty state if nothing matches.
- Selected — bottom preview populates; Enter inserts.
- Inserting — primary button spinner; on success, popover dismisses; toast "Block added".
- Loading (catalogue fetch) — skeleton rows.
- Module deprecated in row — row shows `deprecated` warning amber chip; tooltip explains.

## Interactions

- Search — debounced 200ms.
- Arrow up/down — moves selection; Enter inserts the selected.
- Click row — selects; bottom preview updates.
- `Insert` — creates a new block at the end of the study (or at the selected position if user opened the picker via a contextual `+` between blocks).
- Tab to category strip — arrow keys move between tabs.

## Edge cases

- Empty workspace + restricted public access — show public-only catalogue; banner.
- Module schema requires upstream blocks the study doesn't have — Insert button disabled with tooltip explaining the dependency.
- Many modules (>100 in catalogue) — virtualized list.

## Accessibility notes

- Popover = `role="dialog" aria-modal="false"` (non-modal so user can keep the work surface context visible).
- Module list = `role="listbox"`; rows = `role="option"`.
- Search input has `aria-controls` pointing to the listbox.
- Arrow-key navigation moves selection; Enter inserts; Esc closes.
- Focus traps inside the popover while open; returns to `+ Add block` button on close.

## Open questions

- Should the picker also surface Templates and Frameworks as quick-insert options? Lean: no — those are different concepts (Templates = whole studies, Frameworks = systems); keep picker scoped to modules.
- Drag-and-drop from picker to a specific position in the block list — V1.5; V1 uses contextual `+` affordance between blocks.
