# Wireframe spec — Builder — conditions + per-block visibility

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher define the experimental **conditions** of a study (e.g. Control / Warning-labelled) and mark which blocks each condition sees — turning the V1.5 single-implicit-`control` runtime into real conditioned designs. Conditions + per-block visibility are exactly the inputs the participant runtime already consumes (ADR-0014: weighted assignment + `visibility.showIfCondition`); this surface is how a researcher authors them in Builder mode. Extends `build-stage-builder-mode.md` (the right context panel); does not change the work-surface block list.

## Layout

Two attachment points in the existing Build-stage right context panel:

1. **Conditions section** — shown in the **Details** tab (study in focus, no block selected). A labelled section under the study metadata: a list of condition rows + an "Add condition" affordance. Each row: name (editable), slug (auto-derived, editable), allocation weight (number), remove (✕). A short helper line states participants are randomly assigned by weight, and that a study with no conditions runs as a single "Control" group.
2. **Per-block "Show only if" control** — shown in the **Configure** tab (a block selected), below the block's config form: a multi-select of the study's conditions. Empty selection = "shown to everyone" (the default).

## Content inventory

- **Conditions list** — from `studies.listConditions(studyId)`. Each: `name` (text), `slug` (text, lowercased/kebab, unique per study), `allocationWeight` (number ≥ 0, default 1), `position` (drag/implicit). Server is the working-tip (autosave) version (ADR-0002).
- **Add condition** — button → appends a row (name → slug auto-derived); persists via `studies.addCondition`.
- **Allocation weight** — relative weight; the helper shows the resulting split (e.g. "≈50% / 50%") computed client-side from the weights.
- **Remove condition** — ✕ per row; on confirm, deletes the condition AND strips its slug from any block's `visibility.showIfCondition` (server-side).
- **Show-only-if multi-select** (Configure tab) — checkbox list of the study's condition slugs; persists via `studies.setBlockVisibility(instanceId, slugs[])`. A "Shown to everyone" hint when none selected.
- **Empty state (no conditions)** — copy explains that to run an **A/B test** you split participants into groups and compare per group. Two affordances: a primary **"Set up an A/B test"** button (creates two even arms — *Group A* + *Group B*, 50/50 — in one click via two `addCondition` calls; researcher-renamable/reweightable after) and the regular **Add condition** button for a single condition. A/B is opt-in: the researcher consciously chooses it; nothing about the model changes (conditions already do weighted random assignment + per-condition results). Once ≥1 condition exists, the empty state is replaced by the list and the A/B starter is no longer shown (you just add conditions).

## States

- **Default (Details, ≥1 condition):** the conditions list + Add.
- **Empty (no conditions):** empty-state copy + **Set up an A/B test** + Add (the runtime still runs the study as implicit `control` until a condition exists).
- **Adding / editing:** inline; saves on blur / Enter (autosave semantics, like the block config). A duplicate slug shows an inline error and doesn't persist.
- **Per-block visibility (Configure):** the multi-select reflects the block's current `showIfCondition`; toggling persists immediately; "Shown to everyone" when empty.
- **Block references a since-removed condition:** not possible to reach — removing a condition strips it from block visibility server-side; the multi-select only lists current conditions.
- **Preregistered/immutable version in focus:** the section is read-only (conditions belong to the immutable snapshot; editing happens on the working draft).

## Interactions

- **Add condition** — `studies.addCondition({studyId, name})`; slug auto-derived (editable after); new row focused for naming.
- **Edit name/slug/weight** — `studies.updateCondition`; slug re-validated for uniqueness; weight coerced to a non-negative number.
- **Remove condition** — `studies.removeCondition`; cascades a strip of that slug from block visibilities; the affected blocks' "Show only if" updates on next render.
- **Toggle a block's "Show only if" condition** — `studies.setBlockVisibility({studyId, instanceId, showIfCondition})`; validated server-side that every slug exists for the study.
- **Preregister carries conditions** — when the study is preregistered, its conditions (and the slug-based block visibility) are copied into the immutable snapshot (ADR-0014 implementation note); the participant runtime reads them unchanged.

## Edge cases

- **All weights zero** — the runtime falls back to the first condition (per `pickCondition`); the helper warns "all weights are 0 — assignment falls back to the first condition."
- **Slug collision with a reserved value** — `control` is allowed as a user slug; the implicit fallback only applies when there are zero conditions.
- **Many conditions (>6)** — the list scrolls; assignment split text wraps.
- **Removing the condition a block is gated to** — handled (server strips it); the block reverts to "shown to everyone."
- **Renaming a slug that blocks reference** — V1.5/V1.6 store visibility by slug; renaming a slug must also rewrite block visibilities, OR slug edits are disallowed once referenced. V1.6 decision: **slug is editable only while unreferenced**; once a block references it, the slug locks (rename the name freely). Logged in Open questions.

## Accessibility notes

- The conditions list is a real list with labelled inputs (name/slug/weight each have a `<label>` or `aria-label`); the remove button has an accessible name ("Remove {condition name}").
- The "Show only if" control is a labelled `fieldset`/checkbox group; the "Shown to everyone" hint is announced when the selection is empty.
- Inline slug-collision errors use `role="alert"` and `aria-describedby` on the slug input.
- Weight inputs are `type="number"` with `min=0`; the computed split is text, not color-only.

## Open questions

- Slug editability once referenced — V1.6 locks the slug after a block references it (rename the display name freely). Revisit if researchers need to re-slug mid-design.
- Drag-to-reorder conditions vs implicit creation order — V1.6 uses creation order (position); drag-reorder deferred.
- Whether to surface the resulting per-condition assignment % live — V1.6 shows it as a computed helper from the weights.
