# Insight — Replicators need guidance at the moment of divergence

- **Status:** validated
- **Evidence basis:** literature synthesis (3 papers) + owner product walkthrough 2026-06-12
- **Confidence:** high
- **Source materials:** [replication-recipe literature note](../literature/replication-recipe.md); owner session feedback ("how might we create a replication as a better experience, easier to follow, understand and navigate?")
- **Last updated:** 2026-06-12

## Headline

A replication's credibility is decided while it is being EDITED — every undocumented difference from the original costs trust — yet our Builder treats a replication like any other draft: divergence is invisible while editing, rationale is an afterthought field, and the replication kind is never asked.

## Evidence

- Brandt et al.'s Replication Recipe makes "complete documentation of differences + justification" a pre-registration ingredient, not a writing-up step (see literature note, claim 1/3).
- The direct/conceptual/extension taxonomy (Nosek & Errington; Zwaan et al.) means the SAME edit is fine in one kind and a red flag in another — tooling that doesn't know the kind can't help (claim 2).
- Product walkthrough: after Replicate, the fork looks identical to a blank draft; divergence lives in a side tab; the global divergence-notes field is detached from the edits that need explaining.

## What this implies for the product

1. Ask the replication kind at Replicate time (one dialog; three researcher-native choices).
2. Make divergence ambient in the Builder: a banner (what am I replicating, how far have I drifted) + per-block badges (unchanged/modified/added vs the pinned original).
3. Capture the "why" at the moment of change: a per-block rationale field on diverged blocks, compiled automatically into the Overview's divergence documentation.
4. Let the researcher see the original next to their edit (read-only) without leaving Configure.
5. Make the readiness checks replication-aware: a direct replication with unjustified modified blocks gets flagged BEFORE preregistration.

## What this insight does NOT tell us

- Whether replicators want power-analysis tooling in the same flow (deliberately out of scope).
- How teams (vs solo researchers) divide the rationale-writing work.
- Anything about the original author's experience of REVIEWING a replication (covered separately by Propose changes, ADR-0036).

## Sources

- [Literature note — Replication Recipe](../literature/replication-recipe.md)
