# ADR 0079 — App-owned system account + starter-template seeding

- **Status:** accepted
- **Date:** 2026-06-28
- **Deciders:** Paweł (project owner), Claude
- **Tags:** data-model, seeding, explore, templates

## Context

The Explore destination (ADR-0076) ships a "Run a misinformation study" scenario
card whose CTA is reserved as `{ kind: "template", templateId }` — fork a curated
starter study into the caller's workspace so a researcher can be live "in an
afternoon" rather than assembling the canonical block set by hand. Nothing yet
publishes such a template. The starter-template machinery already exists:
`workspace_template.starter` (ADR-0063) is visible cross-workspace and
`templates.useTemplate` clones a frozen `experiment_version` into the caller's
workspace with no replication gate.

A starter template must reference a real frozen `experiment_version`, and a
version must belong to an `experiment`, which is tenanted to a `workspace`, which
is owned by a `user`. So an app-shipped study needs an owner. Reusing a real
researcher's account (e.g. the project owner's) would (a) leak app content into a
person's workspace lists, (b) inflate the admin census (ADR-0075) with a study and
workspace that aren't a real customer, and (c) make the starter's lineage point at
a human. We need an owner that is unmistakably the application itself.

## Options considered

### Option A — Dedicated app-owned system account (chosen)

- Seed one `user` + one `workspace`, both flagged `is_system`, that own every
  app-shipped starter source study. Exclude `is_system` rows from the admin census
  and from Explore.
- **Pros:** clean lineage ("by Massive Research Tool"); census/Explore stay
  truthful; one obvious place to add future starters; the flag is a cheap,
  self-documenting filter; the source study stays private (only the public
  `starter` template is discoverable).
- **Cons:** two new boolean columns + a migration; every census/discovery query
  must remember the `is_system = false` filter (mitigated by tests).

### Option B — Reuse the project owner's account as the template owner

- Seed the starter study into the owner's existing workspace.
- **Pros:** no schema change.
- **Cons:** app content pollutes a real person's Studies list; the admin census
  counts it as a real workspace/study; "Use template → by Paweł" is misleading;
  fragile (breaks if that account is renamed/removed).

### Option C — Templates with no source study (synthetic snapshot)

- Drop the `source_experiment_id`/`source_version_id` FKs for starters and store
  the block snapshot inline on the template.
- **Pros:** no system account at all.
- **Cons:** breaks the `workspace_template` NOT-NULL FK contract and the `get`/
  `useTemplate` read path that resolves the frozen version; a large, load-bearing
  change to satisfy one seed. Rejected.

## Decision

We will introduce an **app-owned system account** — a `user` and a `workspace`,
both carrying a new `is_system boolean NOT NULL DEFAULT false` column — that owns
app-shipped starter source studies, and we will **exclude `is_system` rows from
the admin census and from Explore**. The first such study is the misinformation
starter, fronted by a public `starter` `workspace_template` at the fixed id
`starter-misinfo-v1` that the Explore scenario CTA forks via
`templates.useTemplate`.

Seeding is idempotent and runs from the same `db:seed:prod` path as the module
catalogue (memory: *new-core-module-needs-seed-prod*), keyed on fixed UUIDs/ids
(`lib/system/starter.ts`) so re-runs upsert rather than duplicate. The source
study is private (`forkable_by` left at its default, never `public`), so it is the
*template* that is discoverable, not the study — keeping Explore's community bands
free of app content even without the `is_system` filter.

## Consequences

- **Easier:** shipping more starters later — add a study to the system workspace +
  a `starter` template row in the seeder; no new concepts. Lineage and authorship
  read as "the app". The census stays a true customer count.
- **Harder:** every new cross-workspace census or public-discovery query must
  filter `is_system = false`. Covered by `admin.test.ts` (census excludes the
  system rows) so a regression fails CI rather than shipping.
- **Committed to:** the fixed ids in `lib/system/starter.ts` are a contract — the
  Explore CTA and the seeder share `STARTER_MISINFO_TEMPLATE_ID`; changing it
  orphans the CTA. The seeder must stay idempotent.
- **Precluded from:** treating raw row counts as the customer count anywhere
  without the filter; letting starters be owned by real accounts.

## Revisit triggers

- We add many system-owned surfaces (not just templates) and the boolean flag
  grows into a needed `account_type` enum.
- Starter templates need per-locale or per-cohort variants (the single fixed id
  no longer suffices).
- We move seeding off the `db:seed:prod` path (e.g. a migration-time data seed).

## References

- ADR-0076 (Explore destination — the reserved `template` CTA) ·
  ADR-0063 (workspace templates + `starter`) · ADR-0075 (admin role + census) ·
  ADR-0012 (definition_snapshot block model) · ADR-0035 (study consent)
- Code: `lib/system/starter.ts` (fixed ids), `server/db/seed-misinfo-starter.ts`
  (seeder), `server/trpc/routers/admin.ts` (census filters),
  `content/explore/scenarios.ts` (CTA), `server/db/migrations/0047_*.sql`.
- Memory: *new-core-module-needs-seed-prod*, *migrate-prod-before-push*.
