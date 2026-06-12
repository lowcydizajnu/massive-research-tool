# Wireframe spec — Save as version dialog

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Resolve the third decision point in the build flow: which save semantics does Hanna want — autosave only, named version checkpoint, or named-version-plus-review-request? Maps directly to `kind: autosave | named` per ADR-0002, plus an optional `@Maya` mention surfacing the Share stage.

## Layout

Centered modal, ~520px wide, ~360px tall. `surface.raised` background, `radius.lg`, modest shadow. Three vertically stacked option rows; a single Save button at the bottom right of the footer.

Vertical structure:

- **Header** (~52px) — `text.heading.1` Plex Serif "Save your work," `text.small` Plex Sans "Pick what kind of save."
- **Three option rows** (~260px) — each row a `border.subtle` card with: an `<input type="radio">` (left), a label + description (middle), an icon (right). Hover and selected states use `surface.subtle` background.
- **Footer** — Cancel (ghost, left) + primary action button (right). Primary action's label updates per selection: `Keep autosaving` / `Save as named version` / `Save & request review`.

## Content inventory

- **Header title** — "Save your work" (Plex Serif 22px 500).
- **Header subtitle** — "Pick what kind of save." (Plex Sans 13px, `text.muted`).
- **Option 1 — Continue autosaving** — label "Continue autosaving", description "No checkpoint. Your work is already saved as you go.", icon `ti-history`.
- **Option 2 — Save as named version** — label "Save as named version", description "A snapshot you can return to and others can review.", icon `ti-bookmark`. Default selected.
- **Option 2 — Optional label input (visible when selected)** — `text.body` Plex Sans input field "Version label (e.g., 'v1 for review')". Required if option 2 chosen.
- **Option 3 — Save & request review** — label "Save & request review", description "Named version + mention a collaborator. Hops to the Share stage.", icon `ti-message-circle-2`.
- **Option 3 — Optional reviewer picker (visible when selected)** — type-ahead combobox "Mention a reviewer", lists workspace members; can pick multiple.
- **Validation summary (conditional)** — when option 2 or 3 selected AND validation is failing: a `color.warning.subtle` row above the footer reads `2 validation errors must be resolved before a named version. View errors →`.
- **Cancel button** — ghost.
- **Primary button** — `color.primary`. Label per selection.

## States

- **Default** — option 2 (Save as named version) preselected; label input visible and focused.
- **Option 1 selected** — radio on option 1; primary button label `Keep autosaving`; description text below.
- **Option 2 selected (default)** — label input visible; primary button label `Save as named version` (disabled until label is non-empty).
- **Option 3 selected** — reviewer combobox visible; primary button label `Save & request review` (disabled until at least one reviewer is picked).
- **Validation failing + option 2 or 3** — warning row visible; primary button disabled with tooltip "Fix validation errors first."
- **Submitting** — primary button shows spinner; "Saving…" label; modal cannot dismiss.
- **Error (save failed)** — danger banner above footer; primary button re-enabled for retry.

## Interactions

- **Radio click / arrow key change** — switches option; updates visible sub-controls.
- **Label input** — text entry, max 64 chars, no leading/trailing whitespace, must be unique within the study's version history.
- **Reviewer combobox** — type-ahead from workspace members; Enter adds; Backspace removes the last added.
- **Primary button** — writes the version, then either dismisses (option 1, 2) or routes to Share stage (option 3).
- **Cancel / Esc** — dismisses; no version created. Autosave is unaffected.
- **`View errors →` link in validation row** — closes the dialog and routes the user to the offending block in the work surface.

## Edge cases

- **Hanna has no workspace members other than herself** (lab of one) — option 3 still shows but the reviewer picker is empty; a small `text.muted` line "Invite someone in Team to request review." reads as a helpful nudge.
- **Validation passes but autosave is stale (>30s since last edit)** — primary action fires autosave-then-named-version atomically.
- **Hanna picks option 2 and types a label that's already used** — inline error "A version with this label already exists. Try another."
- **Network drops mid-submit** — modal stays; "Saving…" persists; on reconnect, queue flushes; on failure, danger banner appears.
- **User double-clicks the primary button** — debounced; only one save.

## Accessibility notes

- Modal: `role="dialog" aria-modal="true" aria-labelledby="dialog-title"`.
- Options grouped as a radiogroup; arrow keys move; Space selects.
- Focus enters on the default option (option 2's label input).
- The validation-failing warning row has `role="alert"` so screen readers announce it when it appears.
- Esc closes the dialog (autosave unaffected); backdrop click closes only if form is unchanged.

## Amendment (2026-06-12, ADR-0033)

The dialog shows a **"What changed since the last save"** card above the save-type
options: the working copy's auto-changelog vs the latest frozen version (derived on
read — see ADR-0033), capped at 6 lines with a "+n more" tail. The same lines appear
under every frozen version in the Versions sub-tab, GitHub-release style.

## Open questions

- **Default option** — Save as named version (assumed; encourages the better-documented path per ADR-0009 default virtue) vs Continue autosaving (less friction, but loses the checkpoint nudge). Lean: named-version default. Reconsider once usage data exists.
- **Reviewer picker UX** — combobox (in spec) vs a separate step after the version writes. Combobox is faster.
- **`Continue autosaving` — should it even exist as an option in the dialog?** Since autosave is already happening, the option is conceptually redundant; some users may want explicit "no checkpoint" reassurance. Keeping it for v1 wireframe.
- **Label autocomplete** — suggest "v2 draft for review" based on previous version labels? Probably yes in V2; out of V1.
