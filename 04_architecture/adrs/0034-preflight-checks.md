# ADR 0034 — Methodological pre-flight checks

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** versioning, quality, preregistration

## Context

GitHub-backlog item 2 (the "CI checks" analogue, framed researcher-native as methodological linting): before a researcher freezes a version participants will take — Preregister or Publish & run — the app should surface a green/amber/red checklist of methodological readiness: unconfigured blocks, no hypotheses, no data-collecting blocks, missing attention check on long studies, defined-but-unused conditions, branching rules pointing at missing blocks. Today nothing stops a study with three empty blocks from being preregistered.

Per-rule raw material exists (per-block `isComplete`, `collectsResponse`, the Overview's hypotheses, condition slugs, `showIf` clauses). The decisions: where the rules run, and whether red blocks the action.

## Options considered

### Option A — Pure rules module + advisory gate with friction

- `runPreflight({snapshot, conditions, mode})` in `server/modules/preflight.ts` returns `{id, status: pass|warn|fail, title, detail, blocks[]}[]`; a `studies.preflight` query runs it over the working tip. The UI disables Preregister/Publish while any check FAILS — unless the researcher ticks "Proceed anyway". Mutations stay unchanged.
- **Pros:** researcher autonomy (the design philosophy in handoff Section G — we inform, never patronize): exploratory pilots with "incomplete" protocols are legitimate; the friction (explicit acknowledgment) still prevents accidents; pure rules are trivially testable; no schema change.
- **Cons:** a determined API caller can preregister an empty study (acceptable — they could before; the gate is about attention, not security).

### Option B — Hard server-side enforcement

- `studies.preregister`/`publish` throw PRECONDITION_FAILED while checks fail.
- **Pros:** un-bypassable.
- **Cons:** blocks legitimate exploratory work; demands an override parameter anyway (back to Option A with extra steps); turns lint wording changes into breaking API changes.

## Decision

We will ship Option A. Rules v1 (mode-aware severity):

| id | check | severity |
|----|-------|----------|
| has-blocks | at least one block | fail |
| blocks-configured | every block's `isComplete` passes | fail (lists offenders) |
| branching-valid | every `showIf` clause references an existing, earlier block | fail (lists offenders) |
| records-data | ≥1 block collects a response | warn |
| hypotheses | ≥1 hypothesis in the Overview | **fail on preregister**, warn on publish |
| abstract | Overview abstract non-empty | warn on preregister only |
| attention-check | >10 collecting blocks → has an attention check | warn |
| conditions-used | every defined condition gates ≥1 block (beyond a lone default) | warn |
| consent | built-in consent step before the first question | always pass (informational) |

The checklist renders on the Preregister page and the Run page's freeze section; failing rows name the offending blocks and link to the Build stage.

## Consequences

- **Easier:** methodological accidents (empty blocks, no hypotheses preregistered) get caught at the moment of commitment; the checklist doubles as a readiness overview for collaborators.
- **Harder:** rule wording/severity is product surface now — changes need the researcher-native vocabulary check.
- **Committed to:** advisory-with-friction (checkbox), not enforcement; pure, snapshot-in/checks-out rules.
- **Precluded from:** nothing — Option B remains addable per-rule if a rule ever proves safety-critical.

## Revisit triggers

- A rule misfires repeatedly on legitimate studies → demote to warn or remove (rules are presentation, safe to iterate).
- Institutional/IRB workflows need enforced gates → add server-side enforcement for the specific rule set, keyed by workspace policy.
- Rules need study-runtime facts (e.g. expected duration) → extend the input contract, keep purity.

## References

- [github-features-backlog](../handoffs/github-features-backlog.md) item 2
- [ADR-0033](0033-auto-changelog.md) (same derive-on-read philosophy), [ADR-0024](0024-per-study-theming.md) (the IRB-acknowledgment friction pattern this mirrors)
- Wireframe: [preflight-checklist](../../03_design/wireframes/preflight-checklist.md)
- Code: `05_app/server/modules/preflight.ts`, `studies.preflight`, `components/feature/run/preflight-checklist.tsx`
