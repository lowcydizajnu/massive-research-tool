# Response + conditioning entities

> **Status:** sketch → V1.5 migration. Implements the DDL in [ADR-0014](../adrs/0014-response-data-model-and-conditioning.md). The storage layer the participant runtime ([ADR-0013](../adrs/0013-participant-runtime-and-analytics.md)) writes to.
>
> **Date:** 2026-06-02
> **Related:** [ADR-0014](../adrs/0014-response-data-model-and-conditioning.md), [ADR-0013](../adrs/0013-participant-runtime-and-analytics.md), [ADR-0002](../adrs/0002-forking-model.md), [ADR-0012](../adrs/0012-block-format-and-autosave-semantics.md), [00-core-entities.md](00-core-entities.md), [05_app/server/db/schema.ts](../../05_app/server/db/schema.ts)

## Purpose

Add the four tables a real study run produces: **`condition`** (experimental arms), **`recruitment_session`** (the shareable run), **`response`** (one participant attempt), **`response_item`** (one answered block). Conditions are immutable per `ExperimentVersion` (ADR-0002); participant identity is anonymous (ADR-0013).

## Key implementation decisions (reconciling the ADR DDL with the existing schema)

1. **Mixed id types.** These tables use **ULID `text` primary keys** (consistent with ADR-0012 block `instanceId`s; `response.id` is the `[sessionId]` in `/take` URLs and benefits from being sortable + URL-friendly). They FK to the existing `experiment_version.id`, which is **`uuid`** — so a row's own PK is `text`, its `experiment_version_id` FK is `uuid`, and FKs between the new tables are `text`. ULIDs are generated in app code (the `ulid` package), not by a DB default.
2. **`pgEnum` over `text` + CHECK.** ADR-0014's DDL sketches status fields as `CHECK (x IN (...))`; we use `pgEnum` to match the rest of the schema (functionally equivalent, better typing).
3. **Partial unique index** on `response (recruitment_session_id, external_pid) WHERE external_pid IS NOT NULL` — prevents the same external PID (e.g. Prolific) double-completing a session, while allowing many direct-recruitment responses with null `external_pid`.

## Entities

### condition
Experimental arm, immutable per ExperimentVersion.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID |
| `experiment_version_id` | uuid FK → experiment_version | |
| `slug` | text | `control`, `warning-labeled`; unique per version |
| `name` | text | display |
| `description` | text? | researcher's preregistered description |
| `allocation_weight` | numeric | default 1.0 (relative weight for weighted random assignment) |
| `position` | int | display order |
| `created_at` | timestamptz | |

Unique `(experiment_version_id, slug)`.

### recruitment_session
A run-time recruitment config; Hanna shares its URL (the id appears in it).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID |
| `experiment_version_id` | uuid FK | the preregistered/published version being run |
| `status` | enum | `open` / `paused` / `closed` |
| `target_n` | int? | null = unlimited |
| `current_n` | int | default 0 (completed count, denormalized) |
| `opened_at` / `closed_at` | timestamptz | |
| `metadata` | jsonb | e.g. `{ prolificStudyId }` |

### response
One participant attempt; assigned to exactly one condition. **`response.id` is the anonymous identifier** (server-minted ULID) — `external_pid` is opaque metadata, never a key, never surfaced to other participants, never demographic-joined.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID; the `[sessionId]` in `/take` |
| `recruitment_session_id` | text FK | |
| `experiment_version_id` | uuid FK | denormalized for query speed |
| `condition_id` | text FK → condition | assigned once at start, immutable |
| `external_pid` | text? | Prolific PID etc.; opaque |
| `mode` | enum | `run` / `preview` (ADR-0013 Preview reuse) |
| `status` | enum | `started` / `completed` / `abandoned` / `disqualified` |
| `current_question_index` | int | default 0; resume pointer |
| `started_at` / `completed_at` / `abandoned_at` | timestamptz | |
| `client_metadata` | jsonb | UA/locale/screen — **no IP, no raw UA string** (PII boundary) |

Partial unique `(recruitment_session_id, external_pid) WHERE external_pid IS NOT NULL`.

### response_item
One answered block.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text PK | ULID |
| `response_id` | text FK → response | |
| `block_instance_id` | text | matches the `instanceId` in `definition_snapshot` (ADR-0012) |
| `block_position` | int | |
| `module_source` / `module_key` / `module_version` | text | denormalized for replication |
| `answer` | jsonb | validated against `ModuleVersion.responseSchema` (see dependency below) |
| `answered_at` | timestamptz | |

Unique `(response_id, block_instance_id)`.

## Block-level conditioning (in JSON, per ADR-0012)
`definition_snapshot.blocks[].visibility.showIfCondition` is an optional `string[]` of condition slugs (absence = show always). Validated at **write time** against the `condition` rows for that ExperimentVersion; the visibility check runs **server-side per question** at runtime. Stimulus shuffling is `config.randomizeStimulusOrder` (seeded from `response.id` for resume-stable order).

## Dependency surfaced (not in this migration)
- **`ModuleVersion.responseSchema`** — `response_item.answer` is validated against it, but modules currently carry only a config `schema`. The module registry needs a per-module **response schema** added when response *writing* lands (V1.5 step 4). This migration creates the tables only.

## Deferred
- Branching (`nextBlock`) + within-subjects counterbalancing beyond stimulus shuffle (V1.6, likely a new ADR).
- `participant_profile` / demographics (explicit-consent ADR; never casual).
- Abandonment timeout sweeper (a background job; lands with the Run stage).
