# ADR 0004 — Amendments to preregistered versions

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** data-model, preregistration, immutability, transparency, open-science

## Context

ADR-0002 establishes that ExperimentVersions of `kind: preregistered` are immutable and cannot be deleted. This is what gives preregistration its scientific value: a credible time-stamped commitment to a plan that cannot be quietly rewritten after results are known.

A real-world scenario forces the question this ADR addresses: a researcher preregisters a study and then notices a typo, a broken stimulus URL, an omitted exclusion criterion, or any other small but real problem. They cannot edit the preregistered version (immutability), but they also cannot ignore the problem (it affects what reviewers and replicators see). The status quo from existing platforms (OSF Registries, ClinicalTrials.gov, AsPredicted) is the **amendment**: a new preregistered version that supersedes the previous one, with visible lineage and a required explanation of what changed.

This ADR formalizes the amendment mechanism inside our model. It is a refinement of ADR-0002, not a replacement — ADR-0002's immutability principle remains the load-bearing rule; this ADR specifies how legitimate corrections are handled without violating it.

Project owner's framing (2026-05-28): "Agree on being strict and follow standards." Standards here mean the OSF / ClinicalTrials.gov convention.

## Options considered

### Option A — Allow silent edits to preregistered versions

Make `kind: preregistered` editable, perhaps with an audit log of who edited what.

- **Pros.** Simplest UX for fixing typos.
- **Cons.** Destroys the credibility model. A preregistration that could be edited after data are seen is not a preregistration in any meaningful sense. Even with an audit log, casual readers and reviewers would see only the current state. **Rejected on principle.**

### Option B — Display-only annotations on the preregistered version

A "researcher note" field on the immutable version, editable separately, that displays alongside the original content.

- **Pros.** Lightweight for trivial fixes.
- **Cons.** Opens the door to "fixing" content under the guise of formatting commentary. Reviewers must read the original AND every annotation to understand what's being claimed. The line between "annotation" and "edit" gets fuzzy fast. **Rejected** — the UX convenience does not outweigh the credibility cost.

### Option C — Amendment as a new superseding preregistered version (chosen)

Any correction — typo to scope change — is filed as a new ExperimentVersion of `kind: preregistered` that supersedes the previous one. The supersedes relationship is explicit and required. A change summary is required. Both versions remain public, immutable, and findable forever.

- **Pros.** Preserves immutability of every preregistered version. Audit trail is structural, not buried in logs. Aligns with OSF / ClinicalTrials.gov / AsPredicted conventions, so users familiar with those platforms recognize the model. Reviewers can see the full evolution. Researchers tempted to abuse the mechanism cannot hide the originals.
- **Cons.** Slightly more friction for trivial corrections (a typo requires a new amendment, not a quick edit). UX must make this low-friction to prevent researchers from publishing with the errors rather than filing the amendment.

## Decision

**We will adopt Option C: amendments are new preregistered versions that supersede the prior one. No silent edits, no display-only annotations. The system makes corrections impossible to hide but easy to file.**

### The four load-bearing rules

1. **One mechanism for all corrections.** Whether the change is a typo fix, a broken-URL correction, a clarification, or a methodological adjustment, it goes through the same amendment pathway. The system does not classify legitimacy — it makes the change auditable and lets readers judge.
2. **`supersedes_version_id` is a required pointer when amending.** A new preregistered version that amends a prior one carries this FK. The pointer is permanent; both versions remain queryable.
3. **`change_summary` is required when `supersedes_version_id` is set.** A non-empty string explaining what changed and why. Enforced at the DB level (CHECK constraint) and at the application level (validation before write). Empty or placeholder strings rejected.
4. **Amendments inherit the immutability and persistence guarantees of their kind.** A `kind: preregistered` amendment cannot itself be edited or deleted, just as the original cannot. It can be further amended by another superseding version.

### Schema additions to ExperimentVersion

Extends ADR-0002's ExperimentVersion entity (also reflected in `04_architecture/data-model/00-core-entities.md`):

| Field | Type | Description |
| --- | --- | --- |
| `supersedes_version_id` | uuid FK → ExperimentVersion (nullable) | The preregistered version this one amends. Null for original preregistrations. |
| `change_summary` | string (nullable) | Required (non-null, non-empty) when `supersedes_version_id` is set. Free-form explanation of what changed and why. |
| `amendment_classification` | enum (nullable) | Optional: `typo` / `methodological-correction` / `clarification` / `scope-change` / `other`. Used for filtering and review workflows. Researchers may decline to classify; reviewers can filter on it when present. |

DB-level CHECK: `(supersedes_version_id IS NULL AND change_summary IS NULL) OR (supersedes_version_id IS NOT NULL AND change_summary IS NOT NULL AND length(trim(change_summary)) > 0)`.

Application-level validation also enforces that the superseded version is itself `kind: preregistered` (you cannot amend an autosave or a named version through this mechanism — that's just regular version progression).

### Behavioral rules

- **Public URLs.** Each preregistered version (original and every amendment) gets its own permanent public URL. Citations target a specific version, not "the latest amendment." Researchers can choose to cite the original or a specific amendment depending on context.
- **Display.** When a reader views a preregistered version, the UI shows: "Amends version N (filed YYYY-MM-DD): [change_summary]" linking back to the prior version. When viewing the prior version, the UI shows: "Superseded by amendment on YYYY-MM-DD" linking forward. The lineage is visible in both directions.
- **PDF export.** PDF exports of a preregistered version include a header note if it is an amendment ("This is amendment N of [experiment title]; see [URL] for the prior version") so the paper-citation footprint is honest.
- **OSF push** (ADR-0005, forthcoming): when an amendment is filed, the OSF registration is updated by adding a new OSF registration that references the prior OSF DOI. We do not modify the prior OSF registration.
- **UI friction is deliberately low.** A "File amendment" action is one click from any preregistered version view. The form is short: change_summary (required), classification (optional), confirm. The amendment is filed as a new version immediately. The point: make legitimate corrections frictionless so researchers don't ship papers with known errors just to avoid the workflow.
- **Replication-risk flagging from ADR-0003 still applies.** If the amendment's freeze pass fails on any external assets, the new version flags `replication_risk: link_only` just like any other preregistered version.

### What this does NOT permit

- Editing the prior preregistered version's content in any way.
- Hiding the prior version from display or query.
- Filing an amendment without a non-empty `change_summary`.
- Amending non-preregistered versions through this mechanism (those just version normally).
- Cherry-picking amendment classifications to obscure scope changes (the classification is for researcher self-categorization and reviewer filtering, never enforced by the system).

## Consequences

**What becomes easier:**

- Researchers correct errors in their preregistrations without abandoning preregistration as a practice. The realistic alternative (no amendment mechanism) is publishing with known errors.
- Reviewers and replicators have a clear, structured view of how a preregistration evolved.
- Citations remain stable: every preregistered version has its own permanent URL, so citing the "version 1" doesn't break when version 2 is filed.
- OSF integration (ADR-0005) has a clean model for handling amendments — each one is just a new push to OSF.

**What becomes harder:**

- A trivial typo requires filing a new version. UX must keep this fast or researchers will avoid it.
- Reviewers must look at the full lineage to evaluate the research, not just the latest amendment. Tools should make lineage rendering easy.
- Classification (the optional `amendment_classification` field) is researcher-self-reported; sophisticated reviewers will check the classification against the actual diff. We don't fight this — we just make the diff easy to view.

**What we are now committed to:**

- ExperimentVersion gains the three new fields above.
- The DB CHECK constraint is mandatory at migration time.
- The "File amendment" UX must be low-friction.
- Lineage visibility (forward and backward) is a hard UI requirement on every preregistered-version view.

**What we are now precluded from:**

- Quietly editing preregistered content.
- Hiding amendment history.
- Empty / placeholder change summaries.

## Revisit triggers

Reopen this decision (probably as a superseding ADR) if:

- A regulatory body (e.g., for clinical trials) requires a stricter amendment model than this (e.g., reviewer approval before amendment goes live). Our model is researcher-self-service; a more regulated context might need pre-amendment review.
- Empirically, researchers turn out to abuse the mechanism (e.g., systematically filing "typo" amendments that actually change hypotheses). Mitigation would be tighter classification semantics or required reviewer sign-off for certain change classifications — but only after evidence of the problem.
- The Registered Reports workflow (peer review before data collection) gets added as a feature. Amendments to Registered Reports may require editor approval to remain valid for the journal commitment.

## References

- ADR-0002 — forking model — establishes the immutability of `kind: preregistered` versions; this ADR refines how legitimate corrections coexist with that immutability.
- ADR-0003 — asset storage — the asset-freeze pass on preregistration also runs on amendments.
- `04_architecture/data-model/00-core-entities.md` — updated to reflect the three new ExperimentVersion fields.
- `01_research/insights/researcher-tooling-pain-points.md` — confirms preregistration adoption is uneven (20-25% in psychology); low-friction amendment UX is part of removing adoption barriers.
- OSF Registries documentation: the convention this ADR follows.
- ClinicalTrials.gov amendment audit trail: the regulated-context precedent.
- AsPredicted's "extend / supersede" mechanism: the lightweight precedent.
- Future: ADR-0005 (OSF integration) will specify how amendments propagate to OSF.
- Future: a Registered Reports ADR will specify whether journal-committed registrations have stricter amendment rules.
