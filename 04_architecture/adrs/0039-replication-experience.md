# ADR 0039 — Replication experience: intent, divergence tracking, rationale

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** project owner + Claude
- **Tags:** replication, builder, overview, preflight

## Context

The owner asked how creating a replication could be "a better experience, easier to follow, understand and navigate." The literature ([replication-recipe](../../01_research/literature/replication-recipe.md)) is unambiguous: a replication's credibility hinges on pre-specified, justified documentation of every difference from the original, judged against the declared KIND of replication (direct / conceptual / extension). Our Builder currently treats a fork like any draft — divergence is invisible while editing, the kind is never asked, and the single global divergence-notes field invites retrospective vagueness ([insight](../../01_research/insights/replication-experience.md)).

All required raw material exists: forks preserve instanceIds and pin `fork_of_version_id` (ADR-0018), per-block diffs are computed (`alignBlocksForDiff`), the Overview rides the snapshot (ADR-0012), readiness checks gate the freeze surfaces (ADR-0034).

## Options considered

### Storage of intent + rationale — Option A: snapshot-riding fields (chosen) · Option B: new columns/tables

- **A:** `overview.replicationIntent` ("direct" | "conceptual" | "extension") and per-block `divergenceNote?: string` on `BlockInstance` — both freeze with preregistration, travel with proposals, and need NO migration (ADR-0012 pattern). The Overview's "Differences from the original" section compiles from per-block notes on read.
- **B:** columns on experiment + a rationale table — schema churn for protocol metadata that semantically BELONGS to the frozen protocol. Rejected.

### Where divergence is computed — derive on read (chosen) vs stored flags

Per-block badges and banner counts come from diffing the working tip against the PINNED source version (`fork_of_version_id`) at query time — same philosophy as ADR-0033/0038; stored flags could go stale with every edit. The pinned-version read is already sanctioned by ADR-0018 (it is the fork's own lineage pointer, readable since fork time); `studies.upstreamBlock` exposes a single block's original config for the Show-original toggle — no new cross-tenant surface beyond what the fork already pinned.

### Intent gating — advisory (chosen) vs enforced

Same researcher-autonomy stance as ADR-0034: intent-aware readiness rows are amber, never red — a direct replication with unjustified changes is FLAGGED, not blocked. Skipping the intent dialog still creates the fork.

## Decision

We will ship replication mode as a presentation layer over existing data: (1) the Replicate action asks the replication kind and injects Replication Recipe Overview sections (target effect, original result, planned sample, differences) with the intent stored in `overview.replicationIntent`; (2) the Builder shows a replication banner (source, intent, divergence count, Compare link) and per-block badges (modified / added vs the pinned original); (3) Configure on a diverged block offers Show-original (read-only, via `studies.upstreamBlock`) and a "Why does this differ?" field writing `BlockInstance.divergenceNote`; (4) the readiness checks gain replication-aware rows (intent declared; diverged blocks justified — severity tuned by intent); (5) the Overview's differences section compiles per-block notes automatically.

## Consequences

- **Easier:** Recipe-grade divergence documentation accumulates as a side effect of editing; reviewers and the Propose-changes surface inherit better rationale for free.
- **Harder:** the Builder has a second ambient mode (replication) to keep visually coherent; intent copy must stay researcher-native (vocabulary check applies).
- **Committed to:** derive-on-read divergence; advisory (amber) enforcement; snapshot-riding storage.
- **Precluded from:** per-field divergence granularity (block-level is the unit); outcome scoring (future Results work).

## Revisit triggers

- Researchers want rationale bundled into Propose-changes messages → include compiled notes in the proposal payload.
- Teams want rationale review/sign-off → pairs with protected-drafts (parked tier).
- Power-analysis demand in the planned-sample slot → dedicated statistical tooling decision.

## References

- [replication-recipe literature note](../../01_research/literature/replication-recipe.md); [replication-experience insight](../../01_research/insights/replication-experience.md); [replicate-a-study user flow](../../02_product/user-flows/replicate-a-study.md)
- [ADR-0012](0012-block-format-and-autosave-semantics.md), [ADR-0018](0018-cross-workspace-forking.md), [ADR-0033](0033-auto-changelog.md), [ADR-0034](0034-preflight-checks.md)
- Wireframe: [replication-builder](../../03_design/wireframes/replication-builder.md)
