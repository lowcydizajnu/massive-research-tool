# Wireframe spec — New study modal

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Decide how a new study begins: from a Framework (recommended), from a saved Template, or blank. The first decision point in Hanna's build-a-study flow.

## Layout

Centered modal, ~640px wide, ~480px tall. `surface.raised` background, `radius.lg` corners, modest shadow (`shadow.md`). Dim backdrop (`rgba(0,0,0,0.45)` Light; `rgba(0,0,0,0.7)` Dark). Closes on `Esc`, backdrop click, or close icon.

Vertical structure:

- **Header** (~64px) — `text.heading.1` Plex Serif title "Start a new study," `text.small` Plex Sans subtitle "Pick a starting point," close icon top-right.
- **Three large cards in a horizontal row** — Framework, Template, Blank. Each a flat-ish card with an icon, a one-line label, a two-line description. Hover lifts to `surface.canvas` background with `border.medium`.
- **Footer** — when a card is selected, the footer animates in with a Cancel button (ghost) on the left and a primary `Continue with {choice}` button on the right.

When `Framework` or `Template` is selected, the modal expands vertically to show an embedded picker (search + browse list) without dismissing — the user is still inside the New study flow.

## Content inventory

- **Header title** — "Start a new study" (Plex Serif 22px 500).
- **Header subtitle** — "Pick a starting point" (Plex Sans 13px, `text.muted`).
- **Close icon** — `ti-x`, top-right.
- **Card — Framework** — icon `ti-puzzle`, label "From a Framework", description "A research tradition's curated kit: schema, modules, measurement, reporting. Recommended."
- **Card — Template** — icon `ti-template`, label "From a Template", description "A paste-ready starter study — yours or a public one from Library."
- **Card — Blank** — icon `ti-square-plus`, label "Blank", description "An empty study. You add every block yourself."
- **Embedded picker (Framework or Template)** — search input + browseable list with title, theme tag, author, version, "verified" badge (Framework only).
- **Footer — Cancel** — ghost button.
- **Footer — Continue** — primary button labelled per choice: `Continue with Misinformation Research Framework`, `Continue with Source-cues template`, or `Create blank study`.

## States

- **Default (just opened)** — three cards visible, none selected. No footer.
- **Card selected (no embedded picker)** — Blank case. Card has `border.medium`, footer fades in.
- **Card selected (embedded picker open)** — Framework or Template case. Picker fills the lower half; footer's `Continue` button disabled until an item in the picker is selected.
- **Picker — loading** — skeleton rows in the picker area.
- **Picker — empty** — "No Frameworks available in this workspace." With a link to Library for Templates equivalent.
- **Picker — search** — search input filters live.
- **Submitting** — primary button shows spinner; "Creating…" replaces the label; modal cannot be dismissed.
- **Error (create failed)** — banner above the footer in `color.danger.subtle` with the error reason + a `Retry` button.

## Interactions

- **Click a card** — selects it; footer animates in. If Framework or Template, the picker expands.
- **Search inside picker** — debounced 200ms; filters titles, descriptions, theme tags.
- **Select item in picker** — highlights it; footer Continue button enables and updates its label.
- **`Continue with …`** — closes the modal; routes to `/studies/{newId}/build` in Builder mode.
- **Cancel / Esc / backdrop / close icon** — dismisses; no state persisted.
- **Keyboard** — arrow keys move between cards; Enter selects; Tab moves to picker once open; `/` jumps to the search input.

## Edge cases

- **Workspace has no Frameworks** — Framework card still visible but disabled with tooltip "Connect a Framework via Library or contact your workspace admin."
- **Workspace has no Templates** — Template card shows a small "(public only)" hint; picker shows only the public Templates surface.
- **Long Framework name** — truncate in picker with ellipsis; full name in tooltip.
- **Selected picker item from a workspace the user just lost access to** — show inline error on the row; disable Continue.
- **Modal opened while previous create-attempt is still in-flight** — block double-open; if user mashes ⌘N, show a small toast "Already creating a study…"

## Accessibility notes

- Modal has `role="dialog" aria-modal="true" aria-labelledby="modal-title"`.
- Focus enters on the first card on open; on close, returns to the `+ New study` button on Studies destination.
- Three cards form a radiogroup (`role="radiogroup"` on the container, `role="radio"` on each, with `aria-checked`).
- Picker list items have `role="option"` inside a `role="listbox"`.
- Esc closes the modal; backdrop click closes the modal *unless* form is dirty (selection made, picker engaged) — then prompts.

## Open questions

- **Framework verified-badge prominence** — small icon next to title (assumed) vs a dedicated chip (more prominent). Lean: small icon; the chip is more for the Framework details page.
- **Skip the modal entirely for users who've created N studies** — onboard with the modal; after the 5th study, default to a quick-create that lands on Blank and lets Hanna pick a Framework inline. Defer the decision; gather usage data first.
- **"From a Template" — search across all public templates or workspace-scoped by default** — workspace-scoped is safer (less noise); a "Search all public" toggle in the picker handles the rest.
