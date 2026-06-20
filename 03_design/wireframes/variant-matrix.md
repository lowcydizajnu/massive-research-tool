# Wireframe spec — Variant matrix editor

- **Serves user flow:** [Run a factorial (A/B) study](../../02_product/user-flows/run-a-factorial-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Build stage, a "Variants" panel/section alongside Blocks
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence.

Let a researcher define factors × levels, bind which block fields vary, and fill each cell's values — turning one study into an A/B or factorial design while keeping shared content edited once (ADR-0058).

## Layout

> Layout zones.

- **Entry:** a **Variants** section in the Builder (collapsed by default; a study with no factors shows a single "Add a variant factor (A/B, 2×2 …)" CTA so the feature is discoverable but out of the way).
- **Factors strip:** each factor is a row — name + its levels (chips, add/rename/remove) + a remove-factor control. An **Add factor** button. A live **cell count** ("2 factors × 2 = 4 cells") with an over-threshold warning.
- **Bindings:** on a block (in Blocks or via "Vary by factor…" on a field), a control marks a field as varying by a factor. A bound field shows a small **"varies: {factor}"** tag in the block.
- **Matrix grid:** rows = cells (cross-product, labelled "low · gain"), columns = the **bound fields**; each cell-field is an editable value. Shared fields are not shown here (they live in Blocks). A **"previewing cell"** selector links to the flow diagram / live preview.

## Content inventory

> Every piece of content.

- **Factor** — name (≤40), ordered **levels** (each name ≤40). Source: snapshot `factors`.
- **Cell** — a combination of one level per factor; label = level names joined; derived (not stored).
- **Binding** — {block, field path, factor}; the field's value per level. Source: snapshot `variantBindings`.
- **Cell count + warning** — computed; warn past ~12 cells.
- **Readiness items** — bound fields missing a value for some level (blocks preregister).
- **Assignment note** — "Each participant is randomly assigned one cell" (+ uniform allocation; weights later).
- **Previewing-cell selector** — choose which cell the diagram/preview resolves.

## States

> Each state.

- **No factors** — single CTA; study behaves as a plain single-variant study.
- **A/B (1×2)** — one factor, two levels, matrix with bound-field columns.
- **Factorial (2×2, 3×2…)** — cross-product rows; only bound fields as columns.
- **Unbound** — factors exist but no field bound yet → matrix prompts "Bind a field to a factor to vary it."
- **Incomplete** — missing level values flagged inline + in the readiness panel.
- **Frozen** (preregistered/published) — factor structure read-only; changes route through an amendment (ADR-0004).
- **Over-threshold** — too many cells → warning + confirm before generating.

## Interactions

> For each interactive element.

- **Add / rename / remove factor + levels** — edits `factors`; the matrix + cell count re-derive; removing a factor warns if data collected.
- **Bind a field** — pick field → factor; the field leaves "shared" and gains per-level inputs. Unbind returns it to shared (drops per-level values, warned).
- **Edit a cell-field value** — writes `variantBindings[…].valuesByLevel`.
- **Edit shared content** (in Blocks) — applies to all cells automatically (source of truth).
- **Previewing-cell selector** — sets which cell the flow diagram + live preview resolve (so you can eyeball each cell).
- **Results** (separate surface) — split aggregates + export by cell (and condition within cell).

## Edge cases

> - Very long factor/level/field names — truncate with tooltip.
- 0 / 1 / many factors; 1 / many bound fields; matrices of 2 … 12+ cells (warn + virtualize past a point).
- A bound field's block is deleted → binding dropped with a warning (mirrors forward-condition cleanup).
- Conditions inside a cell — the diagram shows both levels (variant) and within-cell condition chips; keep the two clearly distinct (color/label).
- Reverting the whole feature — removing all factors leaves a normal study (no residue), per ADR-0058.

## Accessibility notes

> Beyond the defaults.

- The matrix is a real table (`<table>` semantics): row/column headers, keyboard cell navigation, `aria-label`s naming the cell ("low · gain — likes").
- Factor/level editing is keyboard-complete (add/remove without drag).
- Clear, non-colour-only distinction between **variant** levels and within-cell **conditions** (text labels, not just hue).

## Open questions

> To resolve before high-fi.

- Where the matrix lives: an inline Builder section vs a dedicated "Variants" tab — lean inline section, promote to a tab if it grows.
- Per-cell allocation weights (default uniform for v1).
- Interaction-specific values (a field varying by a *combination* of factors) — out of v1; one-factor-per-binding.
