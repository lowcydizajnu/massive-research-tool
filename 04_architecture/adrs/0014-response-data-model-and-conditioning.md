# ADR 0014 — Response data model + minimum viable conditioning

- **Status:** accepted
- **Date:** 2026-06-02
- **Deciders:** project owner + Claude
- **Tags:** data-model, conditioning, privacy, v1.5

## Context

V1.5 has to support a real social-psychology study end-to-end: Hanna preregisters a study, shares a recruitment URL, anonymous participants take it, Hanna sees aggregate results. Without random assignment to experimental conditions, the preregistration story is hollow — a preregistered hypothesis that doesn't reference experimental manipulation isn't preregistration in the sense researchers mean. The Pennycook 2021 misinformation study that's been our reference case throughout the build has a between-subjects condition (control vs. warning-labeled headlines); the V1.5 product has to handle that minimum.

Project owner explicitly chose "minimum viable conditioning" on 2026-06-02: N condition arms at study level, per-block "show only if condition" rule, random assignment at Run start, per-condition aggregation in Results, stimulus shuffling toggle. Branching logic ("if response to Q3 = X, show Q4a") and within-subjects counterbalancing beyond stimulus order are deferred to V1.6.

The data-model questions this forces:

1. **Where do conditions live?** Tied to `ExperimentVersion` (so preregistered versions snapshot their conditions immutably per ADR-0002 / ADR-0004) — but how exactly.
2. **What's the response storage shape?** New tables for `recruitment_session`, `response`, `response_item`, `condition`. How they relate. PII boundary.
3. **Anonymous-participant identifier strategy.** Per ADR-0013 there's no Clerk auth on the participant side. What's the stable identifier? How does it interact with external recruitment platforms (Prolific assigns its own PIDs)?
4. **How is the "show only if condition" rule stored?** It's part of the block, but blocks live in the JSON `definition_snapshot` per ADR-0012. Does the rule live in JSON or in a relational column?
5. **What's recorded on the response row at run start vs. at completion?** Affects partial-response semantics.

This ADR settles all five.

## Options considered

### Option A — Conditions as a relational table, immutable on preregistered versions

A `condition` table with FK to `experiment_version`. Each row: name, slug, allocation_weight (default 1.0). Per-block "show only if" stored as an array of condition IDs in the block's JSON config. Random assignment selects from `condition` rows where `experiment_version_id = currentRun.experimentVersionId`.

- **Pros:** clean relational model; per-condition aggregation in Results is a simple GROUP BY; matches the rest of our schema (one table per first-class concept); the array-of-condition-IDs in block JSON is small and validated against the relational rows at write time.
- **Cons:** the block JSON now references DB IDs (string ULIDs is fine; not a real cost); we have to update existing conditions when an ExperimentVersion is forked (since the new fork has its own condition rows pointing at the same logical conditions). This is the same forking-of-related-rows problem we already handle for ModuleInstances.

### Option B — Conditions as JSON inside `definition_snapshot`

Conditions defined entirely in the JSON snapshot of an ExperimentVersion. No relational table. Random assignment reads the JSON, picks a key. Per-block "show only if" stores condition keys (strings).

- **Pros:** zero schema change; conditions snapshot atomically with the rest of the version per ADR-0002 immutability; no cross-table integrity to worry about.
- **Cons:** can't query "give me every response for condition X" without parsing JSON in SQL or denormalizing into the response row anyway; per-condition aggregation in Results becomes painful; we lose the database's ability to enforce that a response's recorded condition_id is a valid condition for that experiment version.

### Option C — Conditions table at the Experiment level (not ExperimentVersion)

Conditions defined once for the whole Experiment; ExperimentVersions reference them. Versions can add new conditions but not remove existing ones.

- **Pros:** conditions are stable across versions; less data duplication.
- **Cons:** breaks the ADR-0002 immutability principle — a preregistered version's conditions could change if a later version edits them; even with append-only restrictions the semantic clarity suffers. Also makes forking semantics confusing (does the fork get the original conditions or get to start fresh?).

## Decision

**We will use Option A** — conditions as a relational table FK'd to `experiment_version`, with the "show only if" rule stored as a string-array of condition IDs in the block's JSON config (validated at write time against the relational rows).

The full data model added in V1.5:

```sql
-- Conditions for a specific experiment version (immutable per ADR-0002).
CREATE TABLE condition (
  id                       text PRIMARY KEY,          -- ULID
  experiment_version_id    text NOT NULL REFERENCES experiment_version(id),
  slug                     text NOT NULL,             -- 'control', 'warning-labeled'
  name                     text NOT NULL,             -- 'Control', 'Warning-labeled headlines'
  description              text,                      -- researcher's preregistered description
  allocation_weight        numeric NOT NULL DEFAULT 1.0,  -- relative weight; defaults to equal
  position                 integer NOT NULL,          -- display order
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_version_id, slug)
);

-- A run-time recruitment configuration; Hanna shares this URL.
CREATE TABLE recruitment_session (
  id                       text PRIMARY KEY,          -- ULID; appears in the recruitment URL
  experiment_version_id    text NOT NULL REFERENCES experiment_version(id),
  status                   text NOT NULL CHECK (status IN ('open', 'paused', 'closed')),
  target_n                 integer,                   -- nullable; null = unlimited
  current_n                integer NOT NULL DEFAULT 0,
  opened_at                timestamptz NOT NULL DEFAULT now(),
  closed_at                timestamptz,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb  -- e.g. { prolificStudyId: '...' }
);

-- One per participant attempt; assigned to exactly one condition.
CREATE TABLE response (
  id                       text PRIMARY KEY,          -- ULID; this is the [sessionId] in /take URLs
  recruitment_session_id   text NOT NULL REFERENCES recruitment_session(id),
  experiment_version_id    text NOT NULL REFERENCES experiment_version(id),  -- denormalized for queryability
  condition_id             text NOT NULL REFERENCES condition(id),
  external_pid             text,                       -- Prolific PID or equivalent; opaque, NOT a primary key
  mode                     text NOT NULL CHECK (mode IN ('run', 'preview')),
  status                   text NOT NULL CHECK (status IN ('started', 'completed', 'abandoned', 'disqualified')),
  current_question_index   integer NOT NULL DEFAULT 0,
  started_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  abandoned_at             timestamptz,
  client_metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- user agent, locale, screen size
  UNIQUE (recruitment_session_id, external_pid) WHERE external_pid IS NOT NULL  -- prevent double-take from same Prolific PID
);

-- One per answered question/block.
CREATE TABLE response_item (
  id                       text PRIMARY KEY,
  response_id              text NOT NULL REFERENCES response(id),
  block_instance_id        text NOT NULL,             -- matches the instanceId in definition_snapshot
  block_position           integer NOT NULL,
  module_source            text NOT NULL,             -- 'core'
  module_key               text NOT NULL,             -- 'likert-7'
  module_version           text NOT NULL,             -- '1.0.0' — denormalized for replication
  answer                   jsonb NOT NULL,            -- module-specific; validated against ModuleVersion.responseSchema
  answered_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, block_instance_id)
);
```

**Block-level "show only if condition" rule:**

Stored in the block's JSON config inside `definition_snapshot` (per ADR-0012 block format):

```json
{
  "instanceId": "01HXX...",
  "source": "core",
  "key": "social-post",
  "version": "1.2.0",
  "config": { ... module-specific ... },
  "visibility": {
    "showIfCondition": ["control", "warning-labeled"]  // optional; absence = show always
  }
}
```

Validated at write time: every slug in `showIfCondition` must exist in the `condition` table for that ExperimentVersion. The visibility check runs server-side per question at runtime — never trust the client.

**Stimulus shuffling toggle** lives in the block's config as `{ "randomizeStimulusOrder": true }`. Modules that support shuffling read this and emit stimuli in a participant-deterministic random order (seeded from `response.id` so the same participant sees the same order on resume).

**Random assignment at Run start:**

When a participant arrives at `/take/[studyId]/start` (or any other entry, but only on first entry per recruitment_session), the server:

1. Creates a new `response` row with `status='started'`, `current_question_index=0`, `condition_id=<chosen by weighted random over the experiment_version's conditions>`.
2. Redirects to `/take/[studyId]/[response.id]/0`.

The condition is recorded once, immutable thereafter. Resume after browser close: server looks up the `response` by ID in the URL; condition stays as originally assigned.

**Anonymous-participant identifier:**

The primary key is `response.id` (server-minted ULID). `external_pid` is a free-text opaque field where Prolific's PID, CloudResearch's worker ID, or a manually-pasted identifier lives. It's used for deduplication (the partial unique index prevents the same external PID from completing the same recruitment_session twice) and for payment reconciliation (Hanna exports `external_pid` to mark completers in Prolific). It's *never* the primary key, *never* surfaced to other participants, *never* joined to demographic data.

**PII boundary:**

Hanna sees aggregate-per-condition + per-anon-id rows showing `response.id`, `condition.slug`, `started_at`, `completed_at`, `external_pid` (so she can reconcile payment), and `response_item.answer` JSON. She does NOT see anything that could be re-identified externally without join-with-Prolific work she does herself. We never store IP addresses, never store user-agent strings beyond an opaque hash used for bot detection.

**Preview mode** writes to the same tables with `response.mode='preview'`. Results queries filter to `mode='run'` by default; Hanna can flip a toggle in Results to include preview responses for debugging.

## Consequences

**What becomes easier:**
- Per-condition aggregation in Results is `SELECT condition_id, COUNT(*) FROM response WHERE recruitment_session_id = ? GROUP BY condition_id` — trivially queryable.
- Preregistered conditions are immutable in the same way preregistered modules are immutable (both ride on the ExperimentVersion snapshot via the FK + immutability invariant from ADR-0002). Amendments per ADR-0004 work the same way for conditions — a new preregistered version with `supersedes_version_id` can add or rename conditions; both versions remain queryable.
- Forking semantics are clean: a fork creates a new ExperimentVersion, copies the condition rows (new IDs, same slugs), participant data does not travel per ADR-0002.
- Partial responses are first-class. A participant who closes their browser mid-study has a `response` row with `status='started'` and a `current_question_index` pointer. They can resume from the same URL; the URL contains the response.id so they're not lost. Hanna sees abandonment as `status='abandoned'` when a configurable timeout passes.
- The PII boundary is enforced at the schema level — there's nowhere to accidentally store an email address against a response.

**What becomes harder:**
- Block config validation now has to cross-check against the `condition` table. The Zod schema for a block can't be fully self-contained; it needs a context-aware validator that takes the experiment version as input. This is the standard pattern for relational-validated JSON and doesn't introduce new architecture, just a discipline.
- Forking has one more relation to copy (the `condition` rows). Add it to the fork procedure; tested in the same e2e that proves fork semantics today.
- Adding branching logic (V1.6) means more block config keys (`nextBlock`, conditional rules) and a flow validator. The visibility rule we added here is the simplest case of that pattern; the V1.6 work will extend it.

**What we are now committed to:**
- The five-table data model above. Migrations land in V1.5 as the first work item, before any participant runtime code.
- Anonymous participants via server-minted `response.id`; external PIDs are opaque metadata, never primary keys.
- Per-condition immutability tied to `ExperimentVersion`; condition rows snapshot with the version.
- PII boundary: no IPs, no user-agent strings beyond an opaque hash, no demographic joins server-side.
- Preview writes to the same tables with a `mode` discriminator; Results filters appropriately.

**What we are now precluded from:**
- Storing demographic information directly against `response` rows. If we ever need demographics, it's a separate `participant_profile` table with explicit consent flow per ADR (not in V1.5).
- Mutating conditions on a preregistered version. Amendments create new versions per ADR-0004.
- Re-using the same `response.id` across recruitment_sessions (the partial unique index on `external_pid` prevents this for external-PID-using providers; for direct recruitment Hanna just shares the URL again and gets a new response row).
- Treating Preview responses as Run responses without an explicit flag. Results queries default-exclude Preview.

## Amendment 2026-06-03 (V1.6 PR-0) — authoring conditions on the working tip + snapshot copy

V1.5 shipped the `condition` table but no authoring path (the runtime auto-created a single `control`). V1.6 PR-0 adds the condition-builder UI (`03_design/wireframes/builder-conditions.md`). Two implementation decisions this surfaced, recorded here because they're load-bearing and not obvious from the original DDL:

- **Conditions are authored on the autosave working-tip version, then COPIED into the immutable snapshot on preregister.** `condition.experiment_version_id` FK'd conditions to a version, but the Builder edits the mutable autosave tip while preregistration creates a *new* immutable version. So `studies.preregister` now copies the working-tip's conditions onto the new `kind: preregistered` version (fresh ULIDs, identical `slug`/`name`/`allocation_weight`/`position`). This mirrors how `definition_snapshot` is copied — conditions are part of the frozen design. Without this, a multi-condition study would lose its conditions at preregistration.
- **Block visibility stores condition *slugs*, not ids (already implied by the DDL), and the slug locks once a block references it.** Because `visibility.showIfCondition` holds slugs, the slug must stay stable across the snapshot copy — so a condition's slug is editable only while no block gates on it (`studies.updateCondition` rejects a slug change once referenced; the display `name` is always editable). Removing a condition strips its slug from every block's `visibility` server-side.

No schema change; this is purely the authoring + snapshot semantics layered on the existing tables.

## Revisit triggers

- Branching logic (V1.6) requires extending the block config schema with `nextBlock` rules and a per-path response model. Likely a new ADR (call it 0015 candidate) rather than reopening this one.
- Within-subjects counterbalancing beyond per-block stimulus shuffling (e.g., Latin square designs across blocks) requires a per-participant block-order plan. Likely a new ADR.
- Recruitment provider integrations (V1.6) — Prolific, CloudResearch, SONA — need to surface as first-class RegistryAdapter implementations (separate from OSF). External PID handling stays opaque; the integration handles the rest.
- The PII boundary needs to relax (e.g., a customer demands demographic data in-app for stratified sampling). Don't relax casually; new ADR with explicit consent flow and data-deletion mechanics.
- Conditions need to be cross-experiment (e.g., a Framework defines canonical conditions that all derived studies inherit). Likely a new table layer; defer until real demand.

## References

- ADR-0001 — modular composition; ModuleInstance per the schema is what `response_item` records an answer for.
- ADR-0002 — forking model; condition immutability ties to ExperimentVersion immutability.
- ADR-0003 — asset storage; stimulus assets referenced by blocks frozen on preregistration.
- ADR-0004 — preregistration amendments; condition changes ride the same amendment mechanism.
- ADR-0007 — Path A; Drizzle owns this schema, migrations committed to `05_app/server/db/migrations/`.
- ADR-0011 — scaffold strategy; data-model entries land in `05_app/server/db/schema.ts`.
- ADR-0012 — block format + autosave semantics; block JSON gains a `visibility` key for the "show only if condition" rule.
- ADR-0013 — participant runtime; this ADR is the storage layer that runtime writes to.
- `02_product/user-flows/hanna-build-a-study.md` — adds a Conditions sub-step in the Builder flow (V1.5 work).
- `04_architecture/data-model/00-core-entities.md` — needs an entry added for the five new tables once this ADR lands.
