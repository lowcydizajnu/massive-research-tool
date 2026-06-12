# Backlog — GitHub-style features (parked 2026-06-10)

> Owner direction: revisit **after** the remaining V1.12 functional-polish handoff items
> (Wave 5 / 5b visual theme + presets, IA v0.4 focused mode, R2 upload + audio recording)
> are finished. Agreed priority order: **3 → 2 → 1**, then the medium tier on demand.

Context: the app already covers GitHub's read side — fork (Replicate, ADR-0018), version
history (ADR-0012/0019), visual + protocol-text diff (ADR-0020 §A6, ADR-0031), lineage
tree, follows, browse, comments. What's missing is the write/collaboration side.

## Priority tier (agreed order: 3 → 2 → 1)

### 3. Releases → auto-changelog on save/preregister — ✅ SHIPPED V1.24.0 (ADR-0033)
When saving a named version or preregistering, auto-attach a change summary generated
from the protocol-text diff vs the previous frozen version ("+ Attention check, ~ Likert
prompt reworded, + H2"). Surfaces in the Versions tab; doubles as the OSF amendment note.
Infra exists: `protocolText` + `diffLines` (ADR-0031). No migration expected
(store summary on experiment_version or derive on read).

### 2. CI checks → methodological pre-flight checks before Preregister/Publish
A green/red checklist gate: every block configured (completeness exists per-block),
≥1 hypothesis, consent present, attention check for long studies, conditions actually
used, no dead branching. Red items link to the offending block. Researcher-native
framing: methodological linting, not "CI". Needs a small rules engine + a gate surface
on the Preregister/Publish flows; ADR for the rule set.

### 1. Pull requests → "Propose changes" (flagship — full design pass required)
A replicator/collaborator proposes their divergence back to the original study; the
owner reviews the existing diff view (visual + text) and accepts into their working
draft or declines with a comment. Completes fork → diverge → contribute-back; no
research tool does this. Touches cross-workspace writes → needs ADR + wireframe gate
(user flow, notification fan-out, merge semantics = apply added/modified blocks via the
existing snapshot write path, conflict policy when the draft moved on).

## Medium tier (on demand)

- **Blame → per-block provenance**: "last changed in v3; unchanged since preregistration"
  (walk version history per block; reviewer-audit value).
- **Gists → publish a saved module**: make ADR-0029 custom modules shareable beyond the
  workspace (already listed as an ADR-0029 revisit trigger).
- **Template repos → "Use as template"**: copy any public study without lineage link,
  from Browse.

## Parked until multi-user demand

Branches (parallel protocol variants), issues (comments cover it), protected branches
(required review before preregistration — builds on Save & request review), trending /
most-replicated in Browse.
