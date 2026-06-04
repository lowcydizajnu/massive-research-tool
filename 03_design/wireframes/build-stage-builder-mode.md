# Wireframe spec — Build stage builder mode

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

The authoring surface. Where Hanna spends most of her time. Builder mode shows the study as an ordered list of blocks; the right context panel shows the metadata or the configuration of whatever block is selected.

## Layout

The canonical three-zone modular surface per design-language brief v0.5.3, on `color.surface.page`. Slim top bar (global chrome only) + three floating panel columns below; the center column is a stack of `stage-tabs pill + work surface card` with a small internal gutter; side rails extend full height of the center column.

- **Top bar (full width slim floating card)** — two slots:
  - Left: workspace chip (`Misinformation Lab ▾`) · breadcrumb (`Studies · Source-cues study`, last segment in Plex Serif).
  - Right: ⌘K search chip · `Save` primary button · user avatar.
  - No stage tabs in top bar (v0.5.3 — those float over the center work surface in their own column).
- **Left rail card (~155px, full height of center column)** — destinations list with Studies active. Same content as on Studies destination.
- **Center column (stacked)**:
  - **Stage-tabs pill (floating card on top)** — six tabs `Build · Preview · Share · Preregister · Run · Results`. Pill background `color.surface.panel` cream, `border.subtle` outline, `radius.lg` corners. Current stage emphasized with `surface.canvas` background inside the pill, `border.subtle` outline, Plex Serif label, `color.primary` text. Other tabs Plex Sans, `text.muted`. Spans only the center column's width.
  - **Work surface card (below the pill)** — the study being built:
  - **Title row** — study title in `text.display` Plex Serif 26-32px 500, editable on click. Below: `v3.2 · draft · last edit 14 min ago · replicating Pennycook 2021` in `text.small` `text.muted`.
  - **"Blocks" section heading** — `text.heading.1` Plex Serif 17px 500, with a 1px `border.subtle` underneath.
  - **Block cards** — vertical list of blocks. Each block: a `border.subtle` outlined card with title (`text.body.emphasis` Plex Sans), status badge (right-aligned: success-emerald or danger-red), and a sub-line of `text.small` Plex Mono showing module identifier + key parameters.
  - **`+ Add block` affordance** — at the bottom of the list, ghost button with `ti-plus` icon.
  - **Accent banner (optional)** — a `color.accent.subtle` rounded rect with a `ti-sparkles` icon, used for "New: …" framework-update notices or contextual tips.
- **Right context panel card (~250px)** — tab strip (Details · History · Replications · Comments · Validation), then content for the active tab. On the `Details` tab (default for a newly-created study): "At a glance" Plex Serif section head, then label/value rows for Status, Owner, Tags, Replicating-of.

Builder/Whiteboard toggle lives in the top-right of the work surface card, pinned to the right of the title row. `[ ⊞ Builder · ◇ Whiteboard ]` two-state.

## Content inventory

- **Top bar — workspace chip + breadcrumb (left slot)** — workspace name with chevron dropdown; breadcrumb segments to the right with `·` separators; last segment (study title) in Plex Serif.
- **Top bar — ⌘K + Save + user avatar (right slot)** — search affordance pill + `Save` primary button (`color.primary`; opens the Save as version dialog; visible only when on a study object) + initials/photo. No stage tabs in the top bar (v0.5.3 — they live in the center column).
- **Stage-tabs pill (above the work surface, inside the center column)** — six tabs `Build · Preview · Share · Preregister · Run · Results`. Pill is its own floating card on `color.surface.panel`. Active tab visually distinct (Plex Serif 500 with `color.primary` text on `surface.canvas` background nested inside the pill, `border.subtle` outline, `radius.md` corners). Inactive tabs in Plex Sans, `text.muted`. Pill spans only the center column's width — does not stretch across the page.
- **Builder/Whiteboard toggle** — two-state segmented control, top-right of the *work surface card* (not the top bar, not the stage-tabs pill). Pinned to the right of the study title row.
- **Study title** — editable Plex Serif display. Source: ExperimentVersion.title.
- **Study subtitle row** — version, status, last-edited, replicating-of link.
- **"Blocks" section head** — static Plex Serif label.
- **Block card (repeated, one per block in study)** — title, status badge, module identifier (Plex Mono), key parameters preview.
- **`+ Add block`** — ghost CTA at end of list.
- **Right panel — tab strip** — five tabs: Details · History · Replications · Comments · Validation. Active tab visually distinct.
- **Right panel — "At a glance" head** — Plex Serif section label.
- **Right panel — Status row** — uppercase `text.label`, then `color.success.subtle` pill with emerald dot + "validation passing".
- **Right panel — Owner row** — uppercase label + person name.
- **Right panel — Tags row** — uppercase label + chip row (each chip `surface.subtle` or category-tinted).
- **Right panel — Replicating-of row** — uppercase label + Plex Serif italics link to parent study.

## States

- **Default (study with at least one block, validation passing)** — all blocks show emerald `schema valid` badges; right panel `Details` shows `validation passing`.
- **One or more blocks with validation issues** — affected blocks show red `missing field` or `error` badges; right panel `Details` still shows `validation passing` if non-blocking, or `requires fixes` (warning amber) if blocking before save-as-named.
- **Loading (study being fetched)** — title skeleton, block skeletons, right panel skeleton tabs.
- **Empty (Blank-start study with no blocks)** — work surface shows the title row plus a centered empty-state card with `+ Add block` as the only CTA. Right panel still shows Details with the default values.
- **Saving** — Save button shows spinner; dialog appears (see save dialog spec).
- **Offline** — top bar `Offline` warning amber chip; Save button disabled with tooltip "Reconnect to save a named version. Your edits are queued locally."
- **Read-only (looking at a preregistered version)** — title and blocks render but inputs are disabled; a `color.primary.subtle` banner above blocks reads "You're viewing v2.0 (preregistered). Editing creates a new draft."
- **Whiteboard mode toggled** — work surface re-renders as a React Flow canvas with blocks as nodes; right panel persists.

## Interactions

- **Click study title** — title becomes editable input; Esc cancels, blur or Enter commits, autosave fires.
- **Click block card** — selects it; right panel switches to `Configure` tab for that block; block card gets a `border.medium` outline to indicate selection.
- **Click block status badge (when failing)** — opens a tooltip with the specific schema error; clicking it deep-links to the offending field in the right panel.
- **Drag a block** — reorder; autosave fires; other blocks animate to new positions.
- **`+ Add block`** — opens a module picker (popover or modal — TBD by wireframe pass).
- **Stage tab click (in the floating pill above the work surface)** — navigates to that stage; preserves current selection where applicable. Active state moves to the clicked tab; pill stays in place; the work surface card below re-renders with that stage's content.
- **Builder/Whiteboard toggle** — switches modes; ⌘\ keyboard shortcut.
- **Right panel tab click** — switches tab; preserves the rest of the panel state.
- **`Save`** — opens the Save as version dialog.
- **Versions sub-tab — version labels (ADR-0012 amendment, 2026-06-04)** — the autosave tip shows a `Working copy` chip (primary-subtle), or `Unsaved changes` when its blocks differ from the latest frozen save; the newest conscious save shows a neutral `Latest saved` chip. No `current` chip (it read as "this snapshot is the live one", which is backwards — the working copy is the only editable thing).
- **Versions sub-tab — preview a version (ADR-0019)** — clicking a version row reveals an inline **read-only preview** of that version's blocks (block name + `source/key@version` ref, no Configure controls). The working copy row, when previewed, links back to the live Builder rather than a frozen snapshot. Preview never mutates anything.
- **Versions sub-tab — restore a frozen version (ADR-0019)** — a frozen (named/preregistered/published) version's preview carries a **`Restore as working copy`** button. It opens a confirm (it overwrites the current working copy and can discard unsaved edits — the `Unsaved changes` chip warns when there is something to lose), then copies that version's blocks into the autosave tip and refreshes the Builder. The frozen version is unchanged; `current_version_id` still points at the working copy. The working-copy row itself has no Restore (you're already on it).

## Edge cases

- **Very long study title** — wraps to two lines max; subtitle row stays single-line.
- **Many blocks (>20)** — center work surface scrolls independently of left rail and right panel.
- **Block with a deprecated module version** — block shows a warning amber badge `module deprecated`; right panel `Configure` tab shows the migration path per ADR-0001.
- **Block whose schema includes an asset reference and the asset URL is dead** — block shows the danger red `link_unreachable` badge per ADR-0003.
- **Concurrent editor (rare; not in V1 ship but architecturally allowed)** — top-bar avatar group shows the other editor; selected block shows their cursor color outline.

## Accessibility notes

- Block cards are focusable in DOM order; Tab moves between them; Enter / Space activates (selects).
- Status badges have visible text labels alongside color dots (per Color rules).
- Right panel tabs are `role="tab"` inside `role="tablist"`; arrow-keys move between.
- Builder/Whiteboard toggle has `aria-keyshortcuts="Meta+Backslash"`.
- Stage tabs are a horizontal nav `role="tablist"` with the current `aria-current="page"` (since each stage is a different page route).
- Editable title has `aria-label="Study title"` and shows a focus ring on edit.

## Open questions

- **Block card density** — current sketch has 60-80px tall cards; might be tighter for users with many blocks. Density toggle (Comfortable / Compact) is a future decision.
- **Right panel default tab when a block is selected** — `Configure` (assumed) vs `Validation` (forces the user to see the schema status first). Lean: Configure; Validation is usually a sub-tab within Configure.
- **Floating accent banner placement** — between blocks (interrupts list) or at top/bottom of the work surface card (separated). Lean: at bottom so it doesn't break the block-list rhythm.
- **Add block — popover vs modal vs side-sheet** — popover for the speed; the picker has searchable categorized modules. Confirm in next pass.
