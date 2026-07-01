# ADR 0086 — Study edit event log

- **Status:** accepted
- **Date:** 2026-06-30
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, changelog, provenance

## Context

The study changelog (ADR-0033 + ADR-0056) is **derived on read** by diffing definition
snapshots: each frozen version is diffed against the previous one, and the working draft is
diffed against the last frozen version (`changelogBetween`). This is the right model for the
open-science contract — it shows **drift from the frozen plan**. But it has two gaps the owner hit:

1. A **never-frozen draft** had no baseline to diff against, so it collapsed to "Initial version —
   N blocks" and hid the design/consent/config edits the researcher actually made. (Fixed
   separately as an ADR-0033 amendment: diff the draft against the canonical default-new-study
   snapshot, so the full differ runs.)
2. The snapshot diff is a **net diff**, not a temporal sequence. It cannot show *"at 14:02 you
   edited the headline, at 14:05 you switched the preset to Facebook"* — multiple edits to the
   same field collapse to one line, and there is no per-edit timestamp/actor. Owner explicitly
   asked for a detailed, time-ordered trail ("changelog missing a lot of changes I've already
   did").

The net-diff model can't produce a temporal trail because the intermediate states aren't stored —
autosave overwrites the draft snapshot in place (ADR-0033: snapshots are the only source of truth).
Capturing "what happened when" requires recording edits as they occur.

## Options considered

### Option A — Reuse the existing `activity_event` table with new types
- Emit `study_edited_*` rows into `activity_event` (already powers the activity feed + the
  changelog's non-versioned events).
- **Pros:** no migration; one timeline table.
- **Cons:** pollutes the personal/workspace **activity feed** (ADR-0014 surfaces `activity_event`
  to followers/dashboards) with high-frequency edit noise; no natural place for coalescing; the
  feed's semantics ("notable events others might care about") don't fit "I nudged a slider."

### Option B — Dedicated append-only `study_edit_event` table with time-coalescing
- A study-scoped table written by a single `recordStudyEdit(experimentId, actorId, kind, summary)`
  helper. Same-kind edits by the same actor within a short window **coalesce** (update the latest
  row's timestamp + summary) so autosave doesn't spam.
- **Pros:** isolated from the activity feed; coalescing keeps it readable; cheap append; the
  changelog "Detailed" view reads it directly; future provenance/audit uses have a home.
- **Cons:** a migration; instrumentation at each write mutation; a second source the changelog
  merges with the snapshot diff.

### Option C — Keep net-diff only (do nothing for the temporal trail)
- **Pros:** zero work; the ADR-0033 amendment alone fixes the never-frozen-draft gap.
- **Cons:** doesn't satisfy the owner's explicit ask for a time-ordered trail.

## Decision

We will add a dedicated append-only **`study_edit_event`** table (Option B), written by a single
coalescing helper, and surface it as the changelog's **Detailed** timeline — *alongside* the
existing snapshot-diff "Summary" view, which stays the source of truth for drift.

The snapshot diff answers "how does the current plan differ from the frozen one?" (the open-science
question); the edit log answers "what did I do, and when?" (the provenance question). They are
different artifacts and we keep both. The edit log is **advisory** — it never gates anything, is
never pushed to OSF, and the snapshot remains the single source of truth for what participants take.
Coalescing (same study + actor + kind within a 2-minute window updates the latest row instead of
inserting) keeps autosave-driven edits from flooding the trail.

## Consequences

- **Easier:** a researcher can see a real time-ordered history of their own edits; future audit /
  provenance features have a table to build on.
- **Harder:** every write mutation must remember to emit an edit event (mitigated by routing the
  block writes through the shared `writeBlocks` choke point and adding a thin call to the handful of
  non-block mutations); the changelog now merges two sources.
- **Committed to:** keeping the edit log advisory (never authoritative, never a gate, never
  exported); coalescing semantics; the log is workspace-private (it inherits study tenancy, never
  surfaced publicly or to followers).
- **Precluded:** we are NOT turning this into the participant-data or the version system — frozen
  versions + snapshots remain authoritative (ADR-0033/0056). The edit log is not a substitute for a
  named version save.

## Revisit triggers

- The trail becomes noisy despite coalescing → widen the window or coalesce by field.
- A compliance need requires an authoritative, tamper-evident audit log → revisit storage +
  immutability guarantees (this advisory log is not that).
- We add real-time multiplayer editing → per-edit attribution may need finer granularity.

## References

- ADR-0033 — auto-changelog from snapshot diffs (amended alongside this ADR for the
  never-frozen-draft baseline diff).
- ADR-0056 — study lifecycle spine + dashboard.
- ADR-0014 — participant-data boundary + activity-feed semantics (why we did NOT reuse
  `activity_event`).
- `04_architecture/data-model/08-study-edit-event.md` — the table.
- `05_app/server/modules/changelog.ts` — `changelogBetween` / the Detailed merge.
