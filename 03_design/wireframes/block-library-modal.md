# Wireframe spec — Block library modal

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture v0.4 — focused study mode, Build stage](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Choosing among 30+ block types in a 360px dropdown forces scanning a long undifferentiated list — the library modal gives blocks room: categories, a card grid with visual cues, and a details pane, so a researcher can browse by intent ("I need a scale") instead of recalling names. Supersedes [module-picker-popover](../../99_archive/wireframes/module-picker-popover.md) as the add-block flow.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Add a block                                  [search…]          ✕   │
├────────────┬───────────────────────────────────────────┬─────────────┤
│ All     31 │  RECENTLY USED (All view, no query)       │  [icon]     │
│ Scales   9 │  ┌─────┐ ┌─────┐ ┌─────┐                  │  Likert     │
│ Choice   4 │  └─────┘ └─────┘ └─────┘                  │  scale      │
│ Open    2  │  ┌────────────┐ ┌────────────┐            │             │
│ Form    9  │  │ ▣ icon     │ │ ▣ icon     │            │  Full       │
│ Demogr. 1  │  │ Title      │ │ Title      │            │  description│
│ Media   5  │  │ desc…      │ │ desc…      │            │  · chips    │
│ Social  2  │  │ [records]  │ │ [stimulus] │            │  · records? │
│ Research 4 │  └────────────┘ └────────────┘            │             │
│ Your blocks│  …grid continues, scrolls…                │  [+ Add]    │
└────────────┴───────────────────────────────────────────┴─────────────┘
```

Centered overlay dialog ~880×~620px (max 85vh) on a dimmed backdrop. Three zones: category rail (left, fixed), card grid (center, scrolls), details pane (right, appears on selection — on narrow viewports it replaces the grid with a back affordance).

## Content inventory

- **Category rail** — derived from the catalogue's `categoryTags` (one block may appear in several): All · Scales & ratings · Choice & ranking · Open text · Form fields · Demographics · Media & stimuli · Social · Research tools · Your blocks (saved custom modules, ADR-0029) · **Community** (public modules from other workspaces — ADR-0038; attributed to their author, copy-on-insert, publish/unpublish toggle on your own). Each shows a count.
- **Search input** — filters name + description + key within the active category.
- **Block card** — icon on a category-tinted tile (lucide set, token colors only), block name, one-line description (clamped), a kind badge (`Records data` vs `Stimulus`), and a **bulk-select checkbox** (top-right). Any selection shows a footer bar: `N selected · Add selected / Clear`; bulk adds insert sequentially in selection order (registry blocks and custom modules both).
- **Recently used row** — last 6 inserted block types (per device), shown in the All view with no query.
- **Details pane** — larger icon tile, full description, category chips, what it records, version; a **Participant preview** card rendering the block through the real take renderer (sample copy fills empty prompts; media/interactive blocks show a short note instead); primary **+ Add to study** button. For Your blocks: block count + a participant preview of up to 3 of the saved blocks (their REAL configs through the take renderer) + Delete (ConfirmDialog).
- **Entry points (3)** — `+ Add block` button beside the "Blocks" heading; the existing button at the list's end; an empty-state CTA centered on a fresh study ("Browse the block library").

## States

- **Default** — All category, grid populated from `modules.list` (now also returning `collectsResponse`).
- **Loading** — six skeleton cards.
- **Empty** — search with no hits: "No blocks match — try another word or category." Your blocks with none saved: explains "Save as reusable block" / "Save group as module".
- **Partial** — n/a.
- **Error** — catalogue query error: inline retry row (existing pattern).
- **Success / optimistic** — Add inserts via the existing addBlock mutation (button shows Adding…; modal closes on success and the new block is selected in the Builder).

## Interactions

- Click card → select (details pane fills). Double-click card or details `+ Add` → insert.
- Category click filters; search refines within category; `Esc` or backdrop click closes; focus returns to the trigger.
- Insert records the block key into the recently-used list (localStorage, max 6).
- **Drag a card into the list**: dragging hides the modal so the Builder list is visible; rows light up as drop targets (insert AFTER the row; after the whole group for member rows; BEFORE the group on its header — group runs never split); `addBlock` gained an `atIndex`. The empty state accepts a drop too. Whiteboard cards aren't draggable (canvas auto-positions).
- Deleting a custom module asks via ConfirmDialog (mirrors the old picker's behavior).

## Edge cases

- A block whose tags map to no category lands in Research tools (fallback) — never invisible.
- Custom modules are workspace-shared; deleting one never touches existing studies (copy-on-insert, ADR-0029).
- Very long block names/descriptions truncate on cards; the details pane shows them in full.
- The locked/preregistered read-only state never opens the modal (the Add affordances are already hidden there).

## Accessibility notes

- `role="dialog"` + `aria-modal`; the card grid is a `listbox` (`aria-activedescendant`-style selection mirrors the ⌘K palette); cards are real buttons.
- Category rail is a `nav` of buttons with `aria-current` on the active one.
- Icon tiles are `aria-hidden`; the name carries the semantics. Kind badge is text, not color-only.
- Esc closes; focus is trapped while open and restored to the trigger on close.

## Open questions

- Custom per-block SVG illustrations (beyond lucide-on-tinted-tile) — revisit if the owner wants richer art after living with the icon set; the card layout already reserves the slot. (Live preview + drag-to-position shipped 2026-06-12.)
