# ADR 0030 — Composite field-group block (researcher-defined fields)

- **Status:** accepted
- **Date:** 2026-06-09
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** blocks, modules, forms, ADR-0012-related, ADR-0029-related

## Context

The built-in Address/Contact blocks have **fixed** field sets. The owner wants the editable version: one block, rendered as a single card, whose internal fields the researcher defines — remove "State", rename a label, add a dropdown — and which records **one structured answer**. Groups (ADR-0028) cover *multi-block* screens; this covers *one block with custom sub-fields* ("my-demographic-something").

## Decision

A new core module **`field-group@1.0.0`** whose config carries the field list:

- **Config:** `{ prompt, required, fields: [{ key, label, type, required?, options? }] }` with `type ∈ text | number | email | phone | date | dropdown | yes-no`. Field `key`s are stable slugs (auto-generated from the label on add, then frozen) so collected data stays joinable across label edits.
- **Answer:** `{ values: { [fieldKey]: string | number } }` — one `response_item` per block (same shape family as matrix-grid, so Results/export stringification + the dataset builder work unchanged).
- **Runtime:** the participant renderer draws each field by type inside one card; a hidden `fkeys` input (`key:type` pairs, mirroring the matrix `rowCount` trick) tells the server action which namespaced fields to read back. Server-side `validateAnswer` re-checks per-field requireds, email/number formats, and dropdown membership against the block's config (a crafted POST can't bypass the UI).
- **Builder:** a dedicated **FieldsEditor** in the Configure panel for the `fields` key (add / remove / reorder / relabel / type / per-field required / dropdown options); other config keys keep the generic editor.
- **Reuse:** a configured field-group is a *single block*, so `saveBlockAsModule(studyId, instanceId, name)` saves it as a one-block custom-module template (ADR-0029 storage); `insertCustomModule` inserts single-block templates as a **plain block** (no 1-member group — those auto-dissolve by design).

## Options considered

- **Config-driven fields on one module (chosen)** — one block, one answer row, fields defined in config. Matches the "one card, one variable bundle" mental model and reuses the snapshot/lock machinery untouched.
- **Compose from single-field blocks in a group** — already possible (ADR-0028/0029), but yields N separate answers/columns and N cards; doesn't read as one instrument item.
- **Per-workspace registry entries (user-defined module versions)** — rejected: the registry stays curated/core (ADR-0008); workspace reuse is ADR-0029's job.
- **Free-form JSON schema editor** — rejected: too sharp for the audience; a typed field list covers the actual need.

## Consequences

- Registry grows to 30 modules / 31 versions (seed + tests updated).
- The Configure panel gets its first type-specific editor (FieldsEditor); the generic key-per-field form remains the default for everything else.
- Export: each field arrives as `key=value` pairs inside one column (consistent with matrix-grid); per-field column fan-out is a future export-builder enhancement.

## Revisit triggers

- Researchers need **per-field columns** in CSV/SPSS exports → extend the dataset builder to fan out `{values}` keys.
- Demand for more field types (file upload once R2 lands, sliders, multi-select) → extend the `type` union + renderer/validator.
- Field-level branching ("show field B if field A = x") → would need intra-block conditions; revisit against the ADR-0021 engine.

## References

- ADR-0029 — custom composite modules (reuse/storage for saved blocks).
- ADR-0028 — question groups (the multi-block alternative).
- ADR-0012 — definition_snapshot block model (config is opaque JSON — no migration).
- ADR-0008 — curated module registry.
