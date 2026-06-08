# ADR 0023 — Demo data semantics

- **Status:** accepted
- **Date:** 2026-06-08
- **Deciders:** project owner, Claude (agent)
- **Tags:** demo, data-model, discovery

## Context

V1.12 A3 seeds **realistic, curated demo studies** (a misinformation classic, an NPS pulse, a conjoint pilot, a longitudinal mood study, a political-content study with cross-workspace replications, a replication, a WIP draft, an archived failed pilot) so a new researcher lands on a populated, credible tool instead of an empty shell — with real blocks, dozens-to-hundreds of fake responses, comments, replications, and activity.

That content must not pollute the live network. Two hazards: (1) demo studies are public + forkable (to *show* replication), so they'd surface in `/browse` to real researchers; (2) their fake responses would skew any cross-study/public aggregate. The owner's framing: demo content should be **"not available outside the tool"** — visible to the owner as a sandbox, invisible to everyone else.

## Decision

A single boolean **`experiment.is_demo`** (default false) tags seeded demo studies, plus **`workspace.show_demo_content`** (default false) gating their visibility *within* a workspace.

Rules:
- **Public discovery (`/browse`, `browsePublic`/`browseTags`) always excludes `is_demo`** — demo studies are never discoverable or forkable by other workspaces. This is the "not available outside the tool" guarantee.
- **A workspace's own study lists show `is_demo` studies only when `show_demo_content` is on** (toggled in Settings). Off by default; the demo seed turns it on for the seeded workspace.
- **Per-study surfaces are unchanged** — opening a demo study (Builder, Results, Replications) works normally; the researcher *wants* to explore it. The flag gates *discovery + listing*, not access.
- Fake responses are real `response` rows under demo studies (so Results/exports look real); because the studies are `is_demo` and excluded from cross-study/public aggregates, they never leak. Preview-mode segregation (`response.mode`) is orthogonal and still applies.

Demo studies are seeded by `scripts/seed-demo-workspace.ts` (idempotent, separate from `seed-network-demo.ts`).

## Options considered

- **`is_demo` flag (chosen)** — one column + filtered queries; flexible (demo + real coexist in one workspace), reversible (flip the flag), and the toggle lets the owner hide/show. Cost: a migration + filter touch-points in browse + list.
- **Standalone demo workspace** — seed a dedicated "Demo Lab" workspace, no migration. Rejected: its public studies would *still* appear in `/browse` unless we special-cased that workspace anyway, and a separate workspace is a worse onboarding story (the user wants demo content in *their* space, dismissable).
- **Synthetic/ephemeral (no DB rows)** — render demo studies from fixtures, never persisted. Rejected: replication, comments, results, and exports all assume real rows; faking those paths is more code than a flag.

## Consequences

- **Easier:** one predicate (`is_demo = false`) on public surfaces; a clean Settings toggle; demo content is fully removable by deleting `is_demo` rows.
- **Harder:** every *new* public/cross-study aggregate must remember the `is_demo` exclusion (documented here + centralized in the browse queries). A prod migration is required (additive, zero-downtime).
- **Committed to:** demo = tagged real rows, not a separate store.

## Revisit triggers

- A second class of "non-production" data appears (e.g. load-test rows) → consider a `data_kind` enum instead of a boolean.
- Demo content needs to be shared *between* users → revisit the always-exclude-from-browse rule.

## References

- `05_app/server/db/schema.ts` (`experiment.is_demo`, `workspace.show_demo_content`); `studies.browsePublic`/`browseTags` (exclusion) + the workspace study list (toggle gate); `scripts/seed-demo-workspace.ts` (the seed); ADR-0018 (forking/replication the demo showcases); ADR-0015 (activity events the demo emits).
