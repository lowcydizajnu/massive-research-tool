# Data model — Study edit event log

> Implements [ADR-0086](../adrs/0086-study-edit-event-log.md). An **advisory, append-only** trail of researcher edits to a study's working draft, surfaced as the changelog's **Detailed** timeline. It is never authoritative (the definition snapshot + frozen versions remain the source of truth, ADR-0033/0056), never gates anything, and is never exported or published.

## `study_edit_event`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text` PK (ULID) | Append order = chronological. |
| `experiment_id` | `uuid` not null → `experiment.id` (cascade) | Study scope; inherits tenancy from the experiment. Indexed `(experiment_id, created_at desc)`. |
| `actor_user_id` | `uuid` null → `user.id` (set null) | Who made the edit (nullable so a deleted user doesn't break the trail). |
| `kind` | `text` not null | Edit category — `blocks` \| `theme` \| `social-post` \| `consent` \| `overview` \| `conditions` \| `variants` \| `wording` \| `title` \| `irb`. Text + app-validated (mirrors `dashboard_kind`/`visibility`); a new kind needs no migration. |
| `summary` | `text` not null | Researcher-readable one-liner (e.g. `Edited the post content`, `Switched design preset to Facebook`). ≤ 280 chars. |
| `detail` | `jsonb` not null, default `'[]'` (ADR-0086 am.) | Humanized names of the fields this edit touched (e.g. `["Title", "Capture username"]` for a block edit) — the changelog **Detailed** sub-list. Merged (union, deduped, capped at 15) across coalesced edits. Only block-config edits populate it today; other kinds leave `[]`. Advisory like `summary`. |
| `created_at` | `timestamptz` not null, default `now()` | Coalescing updates this to the latest edit time. |

## Invariants & boundaries

- **Advisory only (ADR-0086):** never read by the runtime, the freeze/preregister gates, the results pipeline, or OSF push. Deleting the whole log would lose history but change no study behavior.
- **Coalescing:** `recordStudyEdit(experimentId, actorId, kind, summary, detail?)` updates the most recent row for the same `(experiment_id, actor_user_id, kind)` when it is **< 2 minutes old** (replacing `summary`, **unioning `detail`**), otherwise inserts. This keeps autosave-driven edits (slider drags, keystroke-debounced commits) from flooding the trail while preserving distinct editing sessions. Because coalescing keys on `kind` (not block instance), editing two different blocks within the window merges into one row whose `detail` unions both blocks' fields — an accepted approximation for an advisory log.
- **Tenancy / privacy:** workspace-private — surfaced only on the study's own changelog to workspace members. Never on the public record, the activity feed, or to followers (deliberately NOT `activity_event`, per ADR-0086 / ADR-0014).
- **Not the version system:** an edit event is not a frozen version. Conscious "Save version" / Preregister / Publish still create `experiment_version` rows; the edit log only narrates the in-between.

## Relationship to the snapshot diff

The changelog has two layers:

- **Summary** — the existing read-time snapshot diff (`changelogBetween`): drift from the last frozen plan + the per-version auto-changelog. The open-science view.
- **Detailed** — Summary plus this time-ordered edit trail interleaved by timestamp. The provenance view.

Both render from data already scoped to the study; the edit log adds the temporal sequence the net-diff cannot reconstruct.
