# User flow — Replicate a study with intent and tracked divergence

- **Job-to-be-done:** [build-a-study](../jobs-to-be-done/build-a-study.md)
- **Primary persona:** [burned-replicator](../personas/burned-replicator.md)
- **Secondary personas (if any):** [principal-investigator](../personas/principal-investigator.md) (receives proposals later)
- **Grounding insights:** [replication-experience](../../01_research/insights/replication-experience.md)
- **Status:** implemented

## Goal

Sofia replicates a public study and, while adapting it, always knows what she changed, why each change exists, and whether her changes fit the KIND of replication she declared — so the protocol she preregisters carries Recipe-grade divergence documentation without a retrospective writing session.

## Preconditions

- A public, replicable study exists (ADR-0018); Sofia is signed in to her workspace.

## Postconditions

- A replication exists with `replicationIntent` declared (direct / conceptual / extension) and Recipe sections injected into its Overview.
- Every diverged block either carries a researcher-written rationale or is flagged by the readiness check.
- The Overview's divergence documentation compiles itself from the per-block rationales.

## Happy path

1. Sofia clicks **Replicate** on the public study → a dialog asks the replication kind: **Direct** ("follow the original as exactly as possible — differences need justification"), **Conceptual** ("same claim, different operationalization"), **Extension** ("original plus new conditions or measures").
2. She picks Direct → the fork is created; its Overview gains Replication Recipe sections (target effect, original result, planned sample, differences from the original) and the intent is stored with the protocol.
3. The Builder opens with a **replication banner**: "Replicating *Source cues* by Hanna · direct replication · no divergence yet · Compare ↗".
4. She rewords the Likert prompt → the block's row gains a **~ modified** badge; the banner count updates; Configure shows a **"Why does this differ from the original?"** field under the block — she writes one sentence.
5. She checks her edit against the source with **Show original** in Configure (read-only copy of the original's config, inline).
6. At Preregister, the readiness check shows replication-aware rows: every modified block justified ✓; intent declared ✓. The Overview's "Differences from the original" section lists her per-block rationales automatically.

## Branches and decision points

- **No intent chosen** (dialog dismissed): the fork is still created (never block the researcher); intent shows as "not declared" in the banner and the readiness check carries an amber row.
- **Conceptual/Extension intent**: modified/added blocks get NO amber flags (divergence is the point); only rationale-less *removals* of measures stay flagged.
- **Rationale skipped**: the block keeps its badge; the readiness check lists unjustified diverged blocks (amber, never red — researcher autonomy).

## Failure modes

- Upstream pinned version becomes unreadable (source hard-deleted): badges and Show-original degrade to "original unavailable"; editing is unaffected (the fork is self-contained).
- Intent mis-chosen: changeable any time from the banner (it is protocol metadata in the Overview, not a lock).

## Out of scope

- Power-analysis tooling for the planned-sample section (slot provided, calculator not built).
- The original author's review experience (Propose changes, ADR-0036).
- Replication outcome scoring after data collection ("did it replicate?" — future Results work).

## Diagram

```
[Browse: public study] → Replicate → ┌ intent dialog ┐ → fork created
                                     │ direct        │    + overview.replicationIntent
                                     │ conceptual    │    + Recipe sections injected
                                     │ extension     │
                                     └───────────────┘
Builder (replication mode):
  banner: Replicating X · <intent> · n diverged · Compare ↗
  block rows: [~ modified] [+ added] badges  (vs pinned original)
  Configure: [Show original ▾]  +  "Why does this differ?" → divergenceNote
Preregister: readiness check += intent declared? · diverged blocks justified?
Overview: "Differences from the original" auto-compiles per-block rationales
```

## Open questions

- Should switching intent retroactively re-evaluate flags? (It does — checks derive on read.)
- Per-rationale visibility to the original author when proposing back — bundle into the proposal message later if asked.
