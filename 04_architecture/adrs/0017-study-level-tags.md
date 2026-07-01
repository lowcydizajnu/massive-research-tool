# ADR 0017 — Study-level tags

- **Status:** accepted
- **Date:** 2026-06-03
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, follow-targets, v1.7

## Context

[ADR-0015](0015-notifications-comments-activity.md) locked **tag** as one of the four V1.7 follow targets: a researcher follows a research-area tag (e.g. `misinformation`) and any public study preregistered/published/amended with that tag enters their Follows feed. `activity_event.related_tag_slugs` (a `text[]`, GIN-indexed) already exists to drive that join.

But there is no place for those tags to come from. Studies (`experiment`) have **no tags** today. The only tags in the system are `module.category_tags` — block-picker filter metadata on module definitions, not research-area labels on a study. So the tag follow target has a feed column and a join, but no authored data and no UI host. The `+ Follow` affordance on "tag chips" (IA §Following) has nothing to attach to.

This decision is the data home for study-level tags: how they're stored, normalized, and emitted into `activity_event` so the tag-Follows feed has content.

## Options considered

### Option A — `tags text[]` column on `experiment`, free-form slugs (chosen)

A study carries an array of normalized tag slugs directly on the `experiment` row. Authored in the Builder (Details panel); normalized to lowercase-hyphenated slugs on write. Preregister / named-version events copy the study's tags into `activity_event.related_tag_slugs`.

- **Pros:** Minimal — one column, no new table, no join to render a study's tags. Mirrors `activity_event.related_tag_slugs` exactly (same `text[]` shape), so emission is a direct copy. The follow target is just the slug string — no id indirection. GIN-indexable if we ever filter studies by tag.
- **Cons:** No referential integrity / canonical tag list (typos make divergent slugs); no per-tag metadata (display name, description, count) without a scan; renaming a tag globally isn't possible. Free-form means the tag namespace is emergent, not curated.

### Option B — a `tag` table + `study_tag` join table (controlled vocabulary)

Tags are first-class rows; studies link via a join table; follows reference `tag.id`.

- **Pros:** Referential integrity; per-tag metadata + canonical display; global rename; clean autocomplete from existing tags; usage counts.
- **Cons:** Two new tables + a join on every render; a slug↔id mapping to thread through `activity_event` (which stores slugs, not ids) — or migrate that column; curation/merge tooling becomes its own surface. Heavy for V1.7's "let people follow a topic" need.

### Option C — derive study tags from its modules' `category_tags`

No new storage; a study's tags = the union of its blocks' module `category_tags`.

- **Pros:** Zero new data; tags already exist.
- **Cons:** Conflates two different concepts (module-picker filters vs research-area labels); researchers can't tag a study with a topic that isn't a module category; a study's topic isn't a function of which UI widgets it uses. Wrong model.

## Decision

**We will add a `tags text[]` column to `experiment` holding free-form, normalized tag slugs (Option A).** Tags are authored in the Builder, normalized on write to lowercase-hyphenated slugs (`"Misinformation"` → `misinformation`, deduped, capped at a small count per study), and copied into `activity_event.related_tag_slugs` when a study emits a Follows-relevant event (preregister / named version / fork). The followable unit is the slug itself; following a tag means `follow(target_type='tag', target_id=<slug>)`.

We chose the lightweight column over a controlled-vocabulary tag table because V1.7's job is to let researchers label studies and follow topics, not to curate a taxonomy. A `tag` table buys integrity and metadata we don't need yet, at the cost of a join, a slug↔id remap of the existing `activity_event` column, and curation tooling. The emergent-namespace risk (typo'd slugs) is acceptable at current scale and is exactly what a later curation pass would clean up — which is the revisit trigger below. Storing slugs (not ids) keeps the column shape identical to `activity_event.related_tag_slugs`, so emission is a copy with no mapping.

## Consequences

- **Easier:** tag chips render straight from `experiment.tags` (no join); the tag-Follows feed works by copying `tags` → `related_tag_slugs`; the `+ Follow` affordance attaches to a plain slug; no migration of `activity_event`.
- **Harder:** no canonical tag list or autocomplete-from-existing without a `SELECT DISTINCT unnest(tags)` scan; no global rename; typo'd slugs fragment a topic silently.
- **Committed to:** slugs as the tag identity (in `experiment.tags`, `activity_event.related_tag_slugs`, and `follow.target_id` for tag follows) — these three must agree on normalization.
- **Precluded (until revisited):** per-tag metadata, curated/verified tags, tag merge/rename. A future controlled vocabulary would migrate the slugs into a `tag` table and backfill, keeping the slug as the natural key.

## Revisit triggers

- Tag fragmentation becomes a real problem (many near-duplicate slugs for one topic) — introduce a controlled vocabulary / autocomplete-from-existing.
- We need per-tag pages, descriptions, or verified/curated tags.
- A study needs tag-scoped permissions or tag ownership.
- Tag volume per study or filtering-by-tag performance forces a normalized model.

## References

- [ADR-0015 — Notifications, comments, activity feed](0015-notifications-comments-activity.md) (tag follow target + `related_tag_slugs`).
- [follow-affordances.md](../../03_design/wireframes/follow-affordances.md) (the tag chip + `+ Follow` host).
- `05_app/server/db/schema.ts` — `experiment.tags`, `activity_event.related_tag_slugs`, `follow`.
