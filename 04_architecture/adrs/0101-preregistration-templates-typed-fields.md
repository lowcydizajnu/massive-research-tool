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

**Typed field set (v1).** Extend `StudyOverview` with: `templateKey` (the researcher's *explicit* template choice — **optional**, and resolved through `planTemplateKey()`, which falls back to the derived default; `readOverview` must never materialize that default, or the round-trip writes in `setReplicationIntent` / `injectReplicationRecipe` would persist it as a real choice and freeze the wrong template before a replication intent is even declared); `samplingPlan` (text + reasoning markdown); `analysisPlan` (text + markdown); `variables[]` — a **structured typed list**, each entry keyed by the measuring block's `instanceId` + a `role` (`iv | dv | covariate | exclusion`), not a text blob, because the design spans two independent mechanisms (the `condition` table for between-subjects arms and snapshot `factors[]`/`variantBindings[]` for factorial cells). A variable's **data type is derived from its linked block** (`CoreModuleDef.responseSchema`) rather than stored, so there is no second source of truth to disagree with the block. And `expectedOutcomes[]` (per-hypothesis). We **reuse** the existing typed `abstract` and `hypotheses[]` unchanged, and **keep `sections[]` free-markdown** for non-templated prose and backward compat. Every field stays **optional** (see the OSF constraint below).

**`dataCollectionStatus` is derived, never stored.** It is *not* a `StudyOverview` field. It is computed server-side from live `experiment.finishedAt` + whether any **participant response** (`response.mode = "run"`) exists for the study, and it exists only to (a) render a read-only chip on the Overview stage and (b) drive the hard gate below. Storing it on the plan would buy nothing and could go stale: because the gate refuses to create a preregistration once collection has started, **every preregistration that exists was necessarily filed before data collection — by construction**. The guarantee is carried by the gate, not by a field a client could forge or a snapshot could hold past its truth.

**Each template declares its exposed field set, and that set drives the UI.** `PREREG_TEMPLATES[].fields` lists the typed fields a template asks for, and the Overview stage renders exactly those — so picking a template visibly changes the questions in front of the researcher, mirroring how OSF's registration templates work. This is load-bearing, not cosmetic: shipped without it, the picker changed nothing on screen and was indistinguishable from a broken control (owner, 2026-07-15), and the Replication recipe was half-built — its own three OSF questions (`77-12` original study, `77-2` target effect, `77-73` differences) existed only as sections auto-seeded onto **forks**, so a non-fork choosing the Recipe had nowhere to answer them. They are now typed fields (`originalStudy`, `targetEffect`, `differences`) shown only for that template. Fields stay additive on one overview object, so switching template hides a field without destroying its value.

**Template picker — v1 exposes exactly two templates:** **Open-Ended** (default) and **Replication Recipe** — the two OSF registration schemas we already map and that are **all-optional** (a partial fill never 400s at `POST /registrations`). Stricter OSF templates with required questions (standard OSF Preregistration, AsPredicted, EEG/ERP, Eye-tracking) are **out of v1 scope** — they'd need a client-side required-field gate + late-400 handling, deferred to item ⑨/Later. User-facing label: **"Preregistration template"** (mirrors OSF's own "registration templates"); added to the `design-rules.md` Vocabulary table with an explicit note that it is **not** `workspace_template` and **not** the retired Framework. The chosen `templateKey` persists into `overview`.

**OSF mapping seam (unblocks the ADR-0005 deferral).** `templateKey` drives the explicit OSF `schemaName` selection via the existing by-name `resolveSchemaId()` (`05_app/server/adapters/registry.osf.ts`), **superseding** the implicit `replicationIntent → Recipe / else Open-Ended` branch in `registry-push.ts`. Each template gets a typed `build*Responses()` mapper alongside `osf-recipe.ts` that reads the **typed fields** instead of the heading regex / magic section id. During transition the mappers read **both** new typed fields **and** the legacy heading-based sections, so existing/frozen studies still push. The Recipe response keys already verified against live OSF (`77-2`/`77-12`/`77-33`/`77-73`/`77-80`) are preserved exactly. The inert `RegistrationPayload.templateFields` seam (always `{}` today) is retired in favor of the proven `schemaName` + `registrationResponses` path.

**Plan-before-data = hard gate.** `studies.preregister` is **hard-blocked** once the study has recorded a **participant response**, or is finished, throwing `PRECONDITION_FAILED`. The threshold is a recorded response — **not** "recruitment was opened" (project-owner direction 2026-07-15): opening recruitment and closing it again with nobody having taken the study leaves the plan demonstrably pre-data, so it must not burn the researcher's right to preregister. `mode: "preview"` responses are excluded — they are the researcher's own test-runs of their draft, and counting them would mean previewing your own study locks you out of preregistering it. This mirrors the ADR-0084 branding/IRB gate exactly: advisory row on the pre-flight checklist, **enforced in the mutation**. It is the deliberate exception to the checklist's usual advisory-with-friction stance (`preflight.ts`: "mutations never enforce — researcher autonomy"), because here the thing being protected *is the meaning of the word*: a plan filed after the data exist is not a *pre*registration, and researcher intent cannot make it one. There is no override. Two scope limits follow from that reasoning: **`amend` is exempt** (documenting a mid-flight change is exactly what ADR-0004 amendments are for), and **`publish`/`saveAsNamed` are unaffected** (a record or a Saved version after collection is normal, and both remain the honest alternatives named in the blocking copy).

**Provenance for item ⑨.** Each typed field carries a `source: "derived" | "researcher"` split now, with a per-field derived slot the future auto-deriver can (re)populate without clobbering researcher prose. **v1 fills fields researcher-by-hand**; the deriver itself is deferred to item ⑨. Derivation-shaped logic (and `readOverview`, and the OSF mappers) stays as **pure functions in server/`lib`** — never imported as a server func into the `'use client'` picker island's render path (per the RSC/client-boundary hazard that has bitten Run/Preregister before).

**Deferred, deliberately:** DOI ownership (mint our own DataCite DOI vs. adopt the OSF registration DOI) → items ⑦/⑩; OSF schema-version **pinning** → keep runtime resolve-by-name for v1 (safe while only the two all-optional schemas are exposed).

## Consequences

- **What becomes easier.** The plan is structured, not prose; the deferred field-by-field OSF push (ADR-0005) is unblocked; item ⑥ can diff a report claim against typed plan fields; item ⑨ has a typed target + a provenance slot to write into; renaming a section heading can no longer silently drop analysis/sample-size from the OSF filing.
- **What becomes harder.** `readOverview()` must gain and forever keep a default for each new field; the OSF mappers carry a dual (typed + legacy) read path until legacy studies age out; the `variables[]` structured shape needs its own editor + tests.
- **What we are now committed to.** The snapshot as the single home for plan data (ADR-0002); the in-repo registry as the template source of truth; "Preregistration template" as a distinct vocabulary term; every OSF template we expose being partial-fill-safe.
- **What we are now precluded from.** SQL-querying individual plan fields without reading the jsonb; exposing a required-question OSF template without first building required-field gating; editing a preregistered plan in place (amend-only, ADR-0004).
- **Accepted user-visible cost.** The **first participant response** is a one-way door for preregistration. In practice this is narrow: recruitment cannot open at all until a study is preregistered *or* published (`openRecruitment` requires a runnable version), so the normal path — preregister → recruit → amend — never meets the gate. The gate only refuses the researcher who **published instead of preregistering**, collected real data, and then wants to call the plan a preregistration retroactively. That is precisely the claim it should refuse. The blocking copy names the honest alternatives (a Saved version, or a published Record).

## Revisit triggers

- A researcher needs a stricter OSF template (standard OSF Prereg, EEG/ERP, Eye-tracking) → build the client-side required-field gate + late-400 handling first.
- Item ⑨ lands → wire the auto-deriver into the `source: "derived"` slots; measuring types derive from `CoreModuleDef.responseSchema`/`collectsResponse`/`conditionSource`.
- OSF revises a registration schema under the same name and response keys drift → move from resolve-by-name to pinned schema ids+versions.
- Researchers hit the plan-before-data gate in a case we'd call legitimate → reconsider the *threshold* (e.g. discount abandoned/screened-out responses, or responses on a version the researcher never intended to run), **not** a per-researcher override; the gate's value is that it has no exceptions. The threshold already moved once, from "recruitment ever opened" to "any participant response recorded" (owner, 2026-07-15), for exactly this reason.
- Plan fields need cross-study querying (analytics/discovery facets) → consider projecting selected fields to a column or materialized view (without moving the source of truth off the snapshot).

## Amendment 1 — 2026-07-16 — the dual read was filing our own prompts to OSF

Found by the owner asking that Replication be *"aligned and synced with what we have already added and plan to add."* It was not. This ADR added typed plan fields and a dual read (**typed field wins, else the legacy seeded section**) — but nobody updated `studies.fork`, which still seeds the pre-⑤ Recipe sections. The two mechanisms then collided in the worst available way.

**A fresh replication that the researcher never fills in files this to OSF today** (reproduced by running `injectReplicationRecipe` → `buildRecipeResponses` exactly as `fork` does):

| Question | What we send |
|---|---|
| `77-33` Planned sample | *"Target N and the power analysis that produced it (aim for high power on the ORIGINAL effect size)."* |
| `77-2` Description | *"Replicating **X** (direct replication). Define the effect being replicated, with the original's key statistics."* |

That is **our guidance text, published as the researcher's scientific commitment**, in a field where a reader expects a power analysis. The dual read cannot tell a section the researcher wrote from a section we pre-filled with a prompt, because `injectReplicationRecipe` seeds the guidance as the section's `contentMd`.

And on the way there, the researcher is asked each question **twice** — a typed "Target effect" field *and* a "Target effect" prose section, both on the Overview stage, for the same OSF answer.

### D8 — `fork` no longer seeds the Recipe sections

Owner decision 2026-07-16 (*"the fix, not the alternative"*): a new fork gets the **typed fields only**. `injectReplicationRecipe` keeps setting `replicationIntent` — which is what actually drives `planTemplateKey` → the Recipe schema — and stops appending `recipe-target-effect` / `recipe-original-result` / `recipe-planned-sample` / `recipe-differences`.

**The dual read stays, narrowed to what it was written for**: studies **frozen before item ⑤**, whose sections are the only place their plan exists and which can never be rewritten. Those keep filing exactly as they do now. New studies have no seeded sections, so the fallback simply never fires — and an empty typed field files as empty, which is honest.

**Rejected:** seeding the sections empty with the guidance as a placeholder. It fixes the prompt-as-answer but leaves two fields asking one question, and the duplication is what let the two drift apart in the first place.

**The general rule this exposes:** a fallback must never be able to return *content the system authored*. Seeding a field with prompt text makes "empty" indistinguishable from "answered", and any downstream reader — a dual read, a deriver, an OSF filing — will treat the prompt as the answer. Guidance belongs in a placeholder, a label, or help text; never in a value.

## References

- Insight: [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md) (Round 2 item ⑤; templates detail; open question on DOI ownership)
- Related ADRs: [ADR-0002](0002-forking-model.md) (append-only, self-describing snapshot), [ADR-0004](0004-preregistration-amendments.md) (amend-not-edit), [ADR-0005](0005-osf-integration.md) (OSF integration; the deferred field-by-field mapping this unblocks), [ADR-0099](0099-study-variables.md) (prior snapshot-extension precedent), [ADR-0100](0100-study-license.md) (study-level metadata; contrast: license is study-level, plan fields are version-frozen)
- Implementation substrate: `05_app/server/modules/blocks.ts` (`StudyOverview`/`readOverview`), `05_app/server/trpc/routers/studies.ts` (`setOverview` + the four freeze mutations), `05_app/server/jobs/registry-push.ts` (schema selection), `05_app/server/modules/osf-recipe.ts` (field→response-key mappers), `05_app/server/adapters/registry.osf.ts` (`resolveSchemaId`), `05_app/components/feature/overview/overview-editor.tsx` (editor surface)
- Wireframes: [overview-stage](../../03_design/wireframes/overview-stage.md) (the template picker + typed plan-field editors + the derived data-collection chip), [preregister-stage](../../03_design/wireframes/preregister-stage.md) (the template line + the plan-before-data blocking state)
- Prior art for the hard-gate pattern: `05_app/server/modules/preflight.ts` (advisory-with-friction by default) + `assertBrandingGate` in `05_app/server/trpc/routers/studies.ts` (ADR-0084 — advisory row, enforced in the freeze mutations)
- Gate artifacts still to follow this ADR: feature spec (`04_architecture/data-model/`), then code + tests + `06_qa/audit-logs/` pass

---

## Amendment 2 (2026-07-17) — the "all-optional" premise was false

This ADR's stated reason for exposing exactly two templates (§46) is **factually wrong**, and it is corrected here rather than left for the next reader to reason from.

The claim: Open-Ended and the Replication Recipe are *"the two OSF registration schemas we already map and that are **all-optional** (a partial fill never 400s)"*.

**Open-Ended is not all-optional.** Its `summary` block is `required: true` — read live from `GET /v2/schemas/registrations/5df83f7dd28338001ac0ab0d/schema_blocks/` on 2026-07-17: 5 blocks, 2 answerable, 1 required. Our **default template has always had a required field**. (The Recipe genuinely has 0 of 83.)

We never hit a 400 for two independent reasons, neither of which is the one this ADR gives:

1. `registry.osf.ts:523` **unconditionally supplies** `summary` via `buildSummary(payload)`. The required key is filler-guaranteed, so it is never absent.
2. **OSF does not enforce required fields at all** — `required_fields=True` is passed by zero production call sites; the registration-create serializer validates no responses. See [ADR-0107](0107-osf-template-gate.md) Context for the source trace. A partial fill would not have 400'd even without the filler.

**The invariant that actually held** is not "only adopt all-optional schemas" — it is:

> **Every required key must have a guaranteed non-empty filler, or a researcher-facing home.**

This matters beyond pedantry. The all-optional rule, taken literally, permits exactly one general-purpose addition to the catalogue (AsPredicted) and permanently excludes *OSF Preregistration* — the template the project owner actually asked for. A rule derived from a false premise was about to veto the feature. [ADR-0107](0107-osf-template-gate.md) supersedes §46's scope decision and adopts the filler-or-home rule.

Also corrected: §46 says stricter templates *"need a client-side required-field gate + late-400 handling"*. **There is no late 400 to handle.** The real failure mode is silent: the registration succeeds and mints a permanent public DOI with blank required answers. §54's "safe while only the two all-optional schemas are exposed" rests on the same false premise.

Unchanged and still correct: the in-repo registry (dodging the `db:seed:prod` trap), never inventing a response key, and every typed field staying optional on our side.
