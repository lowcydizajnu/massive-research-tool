# Data model — Study Record

> Implements [ADR-0054 §41](../adrs/0054-finished-state-and-study-record.md). Migration `0024_shallow_tempest.sql`. The Record is the readable, citable face of a *finished* study (the Finished state itself lives on `experiment.finished_at`, migration 0023). One row per experiment.

## `study_record`

| Column | Type | Notes |
| --- | --- | --- |
| `experiment_id` | `uuid` PK → `experiment.id` (cascade) | One Record per study. Created lazily on first compose. |
| `visibility` | `text` not null, default `'workspace'` | `workspace` \| `public`. Text + Zod-validated at the tRPC layer (mirrors `dashboard_kind`); a public Record requires the study be public-replicable **and** carry an abstract. |
| `abstract` | `text` null | Authored. Required to publish public (validated at publish, not by a DB constraint, so a draft Record can exist without one). |
| `article_url` | `text` null | Authored — journal URL. |
| `article_doi` | `text` null | Authored — published-article DOI (distinct from the OSF registration DOI on `experiment_version`). |
| `layout` | `jsonb` not null, default `'[]'` | Ordered section instances `{ type, content?, hidden? }`. Bound types (`method`/`results`/`data`/`preregistration`/`replications`/`materials`) carry only `{type, hidden}` and resolve from study data server-side; authored types (`abstract`/`narrative`/`article-link`/`custom`) carry `content`. Unknown types are filtered at resolve time (forward-compat, same as `dashboard_layout`). |
| `published_at` | `timestamptz` null | Stamps the first public publish. |
| `data_published` | `boolean` not null, default `false` | E2 (ADR-0056 amendment) — researcher opt-in to publish the response dataset. Default off. |
| `data_table` | `jsonb` null | Immutable `{headers, rows}` snapshot built at publish from the Export Data view, with the owner's chosen columns (participant id excluded by default). Rendered on the public record only when `data_published` **and** `visibility = public`. |
| `updated_at` | `timestamptz` not null, default `now()` | Touched on every composer save. |

## Invariants & boundaries

- **PII boundary (ADR-0014):** public `data`/`results` sections resolve **aggregate/derived only** — never raw participant rows. Enforced in the section resolvers, never merely hidden in the UI.
- **Composition reuses the dashboard model:** the layout + resolver pattern mirrors `dashboard_layout` (ADR-0045 / Stream F) rather than a second drag-and-drop engine. Section *types* live in a server-side registry with per-type resolvers.
- **Visibility gate:** flipping to `public` requires the experiment be public-replicable (same gate as Browse) + a non-empty `abstract`; otherwise the publish mutation rejects.
- **Lifecycle:** the Record is independent of OSF — OSF is the archive, the Record is the face (ADR-0054); OSF sync rides the deferred OSF-OAuth work ([[osf-5-deferred]]).

## `saved_record` (ADR-0056, migration 0025)

A per-user **bookmark / reading list**, distinct from Follow (which feeds the activity stream). One row per `(user_id, experiment_id)` (unique index), `created_at`, cascade on user/study delete. Surfaced as the **Saved studies** widget on the personal dashboard; toggled from the public record's Save button. No PII; purely a pointer.

## Section model v2 (ADR-0056)

`study_record.layout` entries are extended (jsonb, migration-free) to `{ type, title?, content?, hidden?, fields? }`: bound sections accept a `title`/`content` **override** (preregistration stays frozen, ADR-0044); `fields` carries the **Hypotheses** structured data (effect / direction / statistic kind / value / analysis), all optional. Authored content is Markdown, sanitised client-side (`lib/study-record/record-markdown.ts`). The article DOI/URL fold into the Abstract section. Citation import is via the `CitationAdapter` (Crossref) — see the lock-in inventory.

## Related

- [00-core-entities](00-core-entities.md) — `experiment` (`finished_at`/`finished_by_user_id`).
- ADR-0054 (Finished state + Record), ADR-0056 (v2 + Study Dashboard), ADR-0045 (dashboard customization this reuses), ADR-0014 (PII boundary), ADR-0018 (public-replicable gate), ADR-0007 (CitationAdapter seam).
