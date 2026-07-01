# ADR 0038 — GitHub medium tier: provenance, module publishing, use-as-template

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** collaboration, versioning, modules

## Context

The backlog's medium tier, owner-approved as one slice: (1) **blame → per-block provenance** ("last changed in v3; unchanged since preregistration") for reviewer audit; (2) **gists → publish a saved module** beyond the workspace (an ADR-0029 revisit trigger firing); (3) **template repos → "Use as template"** — copy a public study without lineage. All three reuse existing machinery; only module publishing touches the schema.

## Options considered

### Provenance — Option A: derive from version history on read (chosen) · Option B: provenance log table

- A walks the study's frozen snapshots comparing the block (stable JSON, instanceId-aligned) — same derive-on-read philosophy as ADR-0033; B duplicates derivable data. A chosen.

### Module publishing — Option A: `is_public` flag on custom_module (chosen) · Option B: separate marketplace tables

- A: one boolean column (migration 0011); public modules appear in everyone's block library under "Community", insert stays copy-on-insert (ADR-0029), listing is the THIRD sanctioned cross-tenant read (after fork-source ADR-0018 and proposals ADR-0036) — read-only, definitions only, owner-name attributed. B is the plugin-marketplace substrate (ADR-0008) — premature.

### Use-as-template — Option A: fresh-identity copy (chosen) · Option B: fork without showing lineage

- A regenerates instanceIds and stores NO lineage — a template copy is a starting point, not a replication; diffs against the source are meaningless by design. B would silently keep lineage and pollute Replications. A chosen; the existing Replicate path remains for actual replication.

## Decision

Ship all three: `studies.blockProvenance` (per selected block: created-in version, last-changed version, unchanged-since-preregistration flag) surfaced in the Builder's Configure panel; `custom_module.is_public` + a publish/unpublish toggle (module author's workspace only) + a "Community" category in the block library listing public modules cross-workspace (attributed, copy-on-insert); `studies.useAsTemplate` on public Browse studies (new private study, fresh instanceIds, no fork columns, conditions copied).

## Consequences

- **Easier:** reviewers see at a glance whether an instrument changed since preregistration; good modules spread; public studies become starting points without fake lineage.
- **Harder:** one more cross-tenant surface to include in security reviews (read-only, enumerated).
- **Committed to:** copy-on-insert for community modules (no live linking); template copies have no upstream relationship.
- **Precluded from:** module versioning/updates across workspaces (the marketplace substrate, ADR-0008, when demand appears).

## Revisit triggers

- Community module volume → curation/reporting tools + the ADR-0008 marketplace.
- Researchers ask "which template did this come from" → optional provenance note (NOT lineage).
- Provenance queried for whole studies at once → batch endpoint.

## References

- [github-features-backlog](../handoffs/github-features-backlog.md) medium tier; [ADR-0029](0029-custom-composite-modules.md) revisit trigger; [ADR-0018](0018-cross-workspace-forking.md); [ADR-0033](0033-auto-changelog.md) (derive-on-read)
- Code: migration 0011, `studies.blockProvenance`, `studies.useAsTemplate`, `customModules` publish toggle, block-library "Community" category
