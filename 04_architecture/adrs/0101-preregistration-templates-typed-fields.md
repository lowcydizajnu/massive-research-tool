# ADR 0101 — Add typed preregistration templates and structured plan fields

- **Status:** accepted
- **Date:** 2026-07-15
- **Deciders:** project owner
- **Tags:** data-model, osf, preregistration, runtime, discovery

## Context

The OSF "Lifecycle Open Science" alignment review (insight [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md), Round 2 item ⑤) found the **PLAN** pillar is our biggest structural gap. A study's preregistration today is a `StudyOverview` object riding inside `experiment_version.definition_snapshot.overview` (`05_app/server/modules/blocks.ts`), read through the tolerant `readOverview()`. Only **`abstract` (string)** and **`hypotheses[]` (string[])** are typed and first-class; sampling, analysis plan, variables, and expected outcomes have **no typed home** — the researcher writes them (or doesn't) as free-markdown `sections[]`. LOS is precisely about *structured* plans, so this is the connective tissue we're missing.

That untyped shape has a concrete downstream cost. When we file the plan to OSF (`05_app/server/jobs/registry-push.ts` → `05_app/server/modules/osf-recipe.ts`), the Replication Recipe mapper pulls the analysis plan by a **fragile heading regex** (`/analysis/i.test(section.heading)`) and the sample size by a **magic section id** (`recipe-planned-sample`) — rename a heading and content silently drops. The field-by-field OSF mapping was explicitly **deferred in [ADR-0005](0005-osf-integration.md)** for exactly this reason: there was no typed source to map from. Which OSF "template" we file under is also chosen *implicitly* today — `overview.replicationIntent` set → Replication Recipe schema, else Open-Ended — with no researcher-visible picker.

Two prior decisions bound this work. **[ADR-0002](0002-forking-model.md):** frozen versions are append-only and every snapshot must be **self-describing** (anything needed for replication lives *inside* `definition_snapshot`, not in side columns). **[ADR-0004](0004-preregistration-amendments.md):** a preregistered plan is never edited in place; any post-freeze change is a new superseding version via `studies.amend` with a required `change_summary` (DB CHECK-enforced). Any typed prereg field must obey both. This ADR also sets up item ⑨ (auto-derive method/design sections from the runnable study) and item ⑥ (plan↔report link-back), which read from whatever typed shape we land here.

## Options considered

The two real forks are **(1) where typed plan fields are stored** and **(2) how the template catalogue is stored**. They compose, so the options below pair them.

### Option A — Extend the snapshot `StudyOverview` + an in-repo template registry

- Add the new typed fields (`templateKey`, `samplingPlan`, `dataCollectionStatus`, `analysisPlan`, `variables[]`, `expectedOutcomes[]`) **inside** `definition_snapshot.overview`, each defaulted in the tolerant `readOverview()`. The template catalogue is a static **TS/Zod registry** in `05_app/server/modules/` (mirroring the existing `osf-recipe.ts` response-key maps), each entry declaring its `templateKey`, exposed field-set, and OSF `schemaName`.
- **Pros:** Zero migrations, zero seeds. Fields freeze automatically — the four freeze mutations (`saveAsNamed`/`preregister`/`amend`/`publish`) copy the snapshot **wholesale**, so typed fields ride along with no per-field code. Every existing frozen version stays valid (defaults fill the gap). Travels through fork/replicate/template-clone for free. Matches how `abstract`/`hypotheses[]` already live and how [ADR-0099](0099-study-variables.md) extended the snapshot. The in-repo registry sidesteps the `db:seed:prod`-invisibility trap that a seeded catalogue would inherit.
- **Cons:** Plan fields aren't independently queryable in SQL (must read the jsonb) — acceptable, since the plan is always read as a whole snapshot. The tolerant reader must gain a default per new field or old snapshots break.

### Option B — New typed columns on `experiment_version` (or a normalized `prereg_field` table) + a seeded template table

- Give each typed field its own column (or its own row in a child table keyed by `experiment_version_id`); store the template catalogue as DB rows.
- **Pros:** Fields are directly queryable; the catalogue is editable without a deploy.
- **Cons:** Requires a migration (and per the migrate-prod-before-push rule, a prod DB step gating the deploy). **Violates ADR-0002's self-describing-snapshot principle** — replication data would live outside the snapshot. Every freeze mutation must now copy each column/row tip→frozen by hand (the wholesale-copy advantage is lost). A child table adds its own join, its own freeze-copy, and its own immutability discipline — [ADR-0099](0099-study-variables.md) already rejected an analogous "new table" on weight grounds. A seeded catalogue is invisible in prod until `db:seed:prod` runs (known trap).

### Naming — sub-decision (both options)

The user-facing concept must not collide with two existing primitives: **`workspace_template`** (a starter *study design*) and the deliberately **retired "Framework"** primitive (removed 2026-06-22; it templated the study *design*, the wrong layer for LOS's PLAN pillar). Options were: reuse "Template" (overloaded), revive "Framework" (recreates the wrong-layer overload the insight explicitly flags), or a distinct term.

## Decision

Take **Option A**. Typed preregistration fields live **inside `definition_snapshot.overview`**, defaulted in `readOverview()`; the template catalogue is an **in-repo TS/Zod registry**. Migration-free, freeze-for-free, backward-compatible. Specifics:

**Typed field set (v1).** Extend `StudyOverview` with: `templateKey` (which preregistration template is in force); `samplingPlan` (text + reasoning markdown); `dataCollectionStatus` (a **derived hard gate**, see below); `analysisPlan` (text + markdown); `variables[]` — a **structured typed list**, each entry keyed by block `instanceId` + `role` (`iv | dv | covariate | exclusion`) + `dataType`, not a text blob, because the design spans two independent mechanisms (the `condition` table for between-subjects arms and snapshot `factors[]`/`variantBindings[]` for factorial cells); and `expectedOutcomes[]` (per-hypothesis). We **reuse** the existing typed `abstract` and `hypotheses[]` unchanged, and **keep `sections[]` free-markdown** for non-templated prose and backward compat. Every field stays **optional** (see the OSF constraint below).

**Template picker — v1 exposes exactly two templates:** **Open-Ended** (default) and **Replication Recipe** — the two OSF registration schemas we already map and that are **all-optional** (a partial fill never 400s at `POST /registrations`). Stricter OSF templates with required questions (standard OSF Preregistration, AsPredicted, EEG/ERP, Eye-tracking) are **out of v1 scope** — they'd need a client-side required-field gate + late-400 handling, deferred to item ⑨/Later. User-facing label: **"Preregistration template"** (mirrors OSF's own "registration templates"); added to the `design-rules.md` Vocabulary table with an explicit note that it is **not** `workspace_template` and **not** the retired Framework. The chosen `templateKey` persists into `overview`.

**OSF mapping seam (unblocks the ADR-0005 deferral).** `templateKey` drives the explicit OSF `schemaName` selection via the existing by-name `resolveSchemaId()` (`05_app/server/adapters/registry.osf.ts`), **superseding** the implicit `replicationIntent → Recipe / else Open-Ended` branch in `registry-push.ts`. Each template gets a typed `build*Responses()` mapper alongside `osf-recipe.ts` that reads the **typed fields** instead of the heading regex / magic section id. During transition the mappers read **both** new typed fields **and** the legacy heading-based sections, so existing/frozen studies still push. The Recipe response keys already verified against live OSF (`77-2`/`77-12`/`77-33`/`77-73`/`77-80`) are preserved exactly. The inert `RegistrationPayload.templateFields` seam (always `{}` today) is retired in favor of the proven `schemaName` + `registrationResponses` path.

**`dataCollectionStatus` = hard gate.** Preregistration is **hard-blocked** once data collection has started — derived from live `experiment.finishedAt` + `recruitmentSession.status`/`currentN`, surfaced through the existing `PreflightChecklist` that already wraps the preregister action. Not a manual toggle (which would drift from actual collection state). This enforces LOS's "plan before data".

**Provenance for item ⑨.** Each typed field carries a `source: "derived" | "researcher"` split now, with a per-field derived slot the future auto-deriver can (re)populate without clobbering researcher prose. **v1 fills fields researcher-by-hand**; the deriver itself is deferred to item ⑨. Derivation-shaped logic (and `readOverview`, and the OSF mappers) stays as **pure functions in server/`lib`** — never imported as a server func into the `'use client'` picker island's render path (per the RSC/client-boundary hazard that has bitten Run/Preregister before).

**Deferred, deliberately:** DOI ownership (mint our own DataCite DOI vs. adopt the OSF registration DOI) → items ⑦/⑩; OSF schema-version **pinning** → keep runtime resolve-by-name for v1 (safe while only the two all-optional schemas are exposed).

## Consequences

- **What becomes easier.** The plan is structured, not prose; the deferred field-by-field OSF push (ADR-0005) is unblocked; item ⑥ can diff a report claim against typed plan fields; item ⑨ has a typed target + a provenance slot to write into; renaming a section heading can no longer silently drop analysis/sample-size from the OSF filing.
- **What becomes harder.** `readOverview()` must gain and forever keep a default for each new field; the OSF mappers carry a dual (typed + legacy) read path until legacy studies age out; the `variables[]` structured shape needs its own editor + tests.
- **What we are now committed to.** The snapshot as the single home for plan data (ADR-0002); the in-repo registry as the template source of truth; "Preregistration template" as a distinct vocabulary term; every OSF template we expose being partial-fill-safe.
- **What we are now precluded from.** SQL-querying individual plan fields without reading the jsonb; exposing a required-question OSF template without first building required-field gating; editing a preregistered plan in place (amend-only, ADR-0004).

## Revisit triggers

- A researcher needs a stricter OSF template (standard OSF Prereg, EEG/ERP, Eye-tracking) → build the client-side required-field gate + late-400 handling first.
- Item ⑨ lands → wire the auto-deriver into the `source: "derived"` slots; measuring types derive from `CoreModuleDef.responseSchema`/`collectsResponse`/`conditionSource`.
- OSF revises a registration schema under the same name and response keys drift → move from resolve-by-name to pinned schema ids+versions.
- Plan fields need cross-study querying (analytics/discovery facets) → consider projecting selected fields to a column or materialized view (without moving the source of truth off the snapshot).

## References

- Insight: [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md) (Round 2 item ⑤; templates detail; open question on DOI ownership)
- Related ADRs: [ADR-0002](0002-forking-model.md) (append-only, self-describing snapshot), [ADR-0004](0004-preregistration-amendments.md) (amend-not-edit), [ADR-0005](0005-osf-integration.md) (OSF integration; the deferred field-by-field mapping this unblocks), [ADR-0099](0099-study-variables.md) (prior snapshot-extension precedent), [ADR-0100](0100-study-license.md) (study-level metadata; contrast: license is study-level, plan fields are version-frozen)
- Implementation substrate: `05_app/server/modules/blocks.ts` (`StudyOverview`/`readOverview`), `05_app/server/trpc/routers/studies.ts` (`setOverview` + the four freeze mutations), `05_app/server/jobs/registry-push.ts` (schema selection), `05_app/server/modules/osf-recipe.ts` (field→response-key mappers), `05_app/server/adapters/registry.osf.ts` (`resolveSchemaId`), `05_app/components/feature/overview/overview-editor.tsx` (editor surface)
- Gate artifacts to follow this ADR: wireframe (`03_design/wireframes/`), then feature spec (`04_architecture/data-model/`), then code + tests + `06_qa/audit-logs/` pass
