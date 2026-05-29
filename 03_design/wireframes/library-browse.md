# Wireframe spec — Library browse

- **Serves user flow:** [Browse library](../../02_product/user-flows/browse-library.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Help Hanna find a module / theme / asset / template she can use in her work, with enough metadata to decide quickly.

## Layout

Standard three-zone modular surface per brief v0.6 — slim top bar, left rail card (Library active), center column (stage-equivalent sub-nav pill: Modules · Themes · Materials · Templates · Imports + work surface card below), right context panel card.

## Content inventory

- **Top bar** — workspace chip + breadcrumb (`Misinformation Lab · Library · Modules`); ⌘K + user avatar (no Save — read surface).
- **Left rail** — destinations list, Library active.
- **Sub-nav pill (center column top)** — Modules · Themes · Materials · Templates · Imports.
- **Work surface — filter bar** — theme chip, category chip, verified-badge toggle, sort dropdown (Last updated / Most used / Title).
- **Work surface — catalogue card list** — repeated cards. Each card: item title (`text.body.emphasis`), `text.mono` identifier line (`source/key@version`), short description, theme tag chip, used-in count, last-updated relative date.
- **Right context panel — module detail** — tabs Details / Schema / Versions / Used in. Action row at top: `Insert into…` (popover picker of user's open studies) + `+ Follow`.

## States

- Default — populated catalogue + filter chips empty.
- Loading — skeleton cards.
- Empty (workspace + filters return zero) — "Try fewer filters" + reset link.
- Right panel default (no selection) — "Pick an item to inspect" with `text.muted` Plex Serif.
- Module-deprecated — Versions tab inside the right panel shows migration banner.

## Interactions

- Card click — selects; right panel switches to that item's detail.
- Filter chip click — multi-select; updates URL query.
- `Insert into…` — opens popover listing open study drafts; click study to insert; on success toast "Inserted into {study}".
- `+ Follow` — adds to follow targets per IA v0.3.

## Edge cases

- Long identifier line — truncate Plex Mono with ellipsis; full on hover.
- Many filter chips active — wrap to second row.
- User has 100+ open studies (rare) — popover scrolls.

## Accessibility notes

- Sub-nav pill = `role="tablist"` with `aria-selected` on active tab.
- Cards focusable in DOM order; Enter / Space activates.
- Filter chips have `aria-pressed` toggle state.
- Right panel announces selection via `aria-live="polite"`.

## Open questions

- Density toggle (Comfortable / Compact) — defer; default Comfortable.
- Pin / star in addition to Follow — defer; Follow only.
