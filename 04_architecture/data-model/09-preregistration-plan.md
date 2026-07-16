# Data model — Preregistration plan (typed `StudyOverview`)

> Implements [ADR-0101](../adrs/0101-preregistration-templates-typed-fields.md) (LOS Round 2 item ⑤). The study **plan** is not a table. It is the `overview` object inside `experiment_version.definition_snapshot` (jsonb), defined by `StudyOverview` in `05_app/server/modules/blocks.ts` and read through the tolerant `readOverview()`. This entry documents the typed fields item ⑤ adds, why they live in the snapshot rather than in columns, and how they map to OSF.
>
> **No migration. No seed.** Every field below is optional with a default in `readOverview()`, so existing rows — including immutable, already-frozen preregistrations — read back cleanly.

## Why the snapshot, not columns

[ADR-0002](../adrs/0002-forking-model.md) requires each frozen version's snapshot to be **self-describing**: everything needed to reproduce the study lives *inside* `definition_snapshot`, not in side columns. Two consequences make this the cheap option rather than the expensive one:

- **Freeze-for-free.** The four freeze mutations (`saveAsNamed`, `preregister`, `amend`, `publish` in `studies.ts`) each allocate the next version number and INSERT a new row copying `definitionSnapshot` **wholesale** from the working tip. A field added inside `overview` therefore freezes with zero per-field code. Columns would have to be copied by hand in all four.
- **Travels for free.** Fork / replicate / template-clone all carry the snapshot, so the plan follows the study without extra plumbing.

The cost we accept: plan fields are not independently SQL-queryable (you read the jsonb). That is fine — the plan is always read as a whole.

## `StudyOverview` — the shape

`definition_snapshot.overview`. Pre-existing fields are unchanged; **bold** rows are added by item ⑤.

| Field | Type | Notes |
| --- | --- | --- |
| `abstract` | `string` | ≤5000. Pre-existing, typed since V1.12 B1. Part of the OSF description. |
| `hypotheses` | `string[]` | Each ≤1000, rendered `H1…Hn`. Pre-existing, typed. |
| `sections` | `OverviewSection[]` | `{id, heading, contentMd}`; heading ≤200, markdown ≤20000, ≤30. Free-markdown prose — **kept** for anything the template doesn't type, and for back-compat. |
| `replicationNotes` | `string` | ≤5000. Replications only. |
| `replicationIntent` | `"direct" \| "conceptual" \| "extension"` (optional) | ADR-0039. Now also the **back-compat source** for `templateKey` (below). |
| **`templateKey`** | **`"open-ended" \| "replication-recipe"` (optional)** | **The researcher's EXPLICIT choice; absent = never chosen. Never read it directly — resolve with `planTemplateKey(overview)`, which falls back to the derived default. See Invariants.** |
| **`samplingPlan`** | **`PlanField`** | **Target N + the power analysis behind it. ≤2000. Files to the Recipe's sample-size answer.** |
| **`analysisPlan`** | **`PlanField`** | **≤20000, markdown. Files to the Recipe's analysis answer.** |
| **`variables`** | **`PlanVariable[]`** | **≤50. Structured, not prose — see below.** |
| **`expectedOutcomes`** | **`ExpectedOutcome[]`** | **≤50. Per-hypothesis predictions.** |

### Supporting types

| Type | Shape | Notes |
| --- | --- | --- |
| `FieldSource` | `"researcher" \| "derived"` | The **provenance slot** reserved for item ⑨ (auto-derivation). v1 writes only `"researcher"`; no provenance UI ships yet. |
| `PlanField` | `{ text: string; source: FieldSource }` | A typed text field that item ⑨ may later populate without clobbering researcher prose. |
| `VariableRole` | `"iv" \| "dv" \| "covariate" \| "exclusion"` | Independent / Dependent / Covariate / Exclusion in the UI. |
| `PlanVariable` | `{ id: string; name: string; role: VariableRole; instanceId: string \| null; notes: string; source: FieldSource }` | `instanceId` links the variable to the block that measures it (`null` = not linked). |
| `ExpectedOutcome` | `{ id: string; hypothesisIndex: number \| null; prediction: string; source: FieldSource }` | `hypothesisIndex` is 1-based into `hypotheses[]`, or `null`. |

**Why `variables` is structured and not a text blob.** The design spans two independent mechanisms — the `condition` table (between-subjects arms) and snapshot `factors[]` / `variantBindings[]` (factorial cells) — so a prose blob could not be reconciled with either. Keying a variable to its measuring block (`instanceId`) is also what makes item ⑨ possible: block definitions already declare `collectsResponse` and a `responseSchema`, so the deriver can enumerate real measures rather than guess at names.

**`dataType` is derived, not stored.** A variable's data type follows from the block that measures it (`CoreModuleDef.responseSchema`), so storing a researcher-entered copy would add friction and a second source of truth that can disagree with the block. Unlinked variables simply have no known data type.

## `dataCollectionStatus` — derived, never stored

Not a `StudyOverview` field. Computed server-side from live `experiment.finishedAt` + the study's `recruitment_session` rows:

| Value | Condition |
| --- | --- |
| `"finished"` | `experiment.finished_at` is set. |
| `"collecting"` | a `recruitment_session` exists for any version of the study (recruitment has ever been opened). |
| `"not-started"` | otherwise. |

It exists only to render the Overview stage's read-only chip and to drive the hard gate. It is **not** stored because it would buy nothing and could go stale: the gate refuses to create a preregistration unless the status is `not-started`, so **every preregistration that exists was necessarily filed before data collection — by construction**. The guarantee is carried by the gate, not by a field a client could forge.

## Preregistration-template registry

An **in-repo TS/Zod registry** (not a DB table — a seeded catalogue would be invisible in prod until `db:seed:prod` ran). Each entry declares its `templateKey`, the typed fields it exposes, and the OSF registration schema **name** it files under (resolved at push time by `resolveSchemaId(token, schemaName)`):

| `templateKey` | User-facing label | OSF schema name | Notes |
| --- | --- | --- | --- |
| `open-ended` | Open-ended | `Open-Ended Registration` (via `OSF_REGISTRATION_SCHEMA`) | Default. Everything composes into one summary body. |
| `replication-recipe` | Replication recipe | `Replication Recipe (Brandt et al., 2014): Pre-Registration` | Typed field → response-key mapping below. |

**v1 exposes exactly these two.** Both are all-optional on OSF, so a partial fill can never 400 at `POST /nodes/{node}/registrations`. Stricter templates (standard OSF Preregistration, AsPredicted, EEG/ERP, Eye-tracking) carry required questions and are out of scope until a required-field gate exists (ADR-0101 revisit trigger).

**Vocabulary:** user-facing copy says **"Preregistration template"**. It is *not* `workspace_template` (a starter study design) and *not* the retired **Framework** primitive (which templated the design — the wrong layer for LOS's PLAN pillar).

## OSF field mapping

Response keys were **verified live against api.osf.io on 2026-06-12** (schema id `64b14a08d639e5000d2013a5`, version 2) — see `05_app/server/modules/osf-recipe.ts`. Do not invent keys.

| OSF key | Question | Typed source (item ⑤) | Legacy fallback (pre-item-⑤ studies) |
| --- | --- | --- | --- |
| `77-2` | Description | `abstract` + protocol + `variables` / `expectedOutcomes` summaries | section `recipe-target-effect` + `abstract` + protocol |
| `77-12` | Original study | fork's source title/author | unchanged |
| `77-33` | Sample size target | **`samplingPlan.text`** | section id `recipe-planned-sample` |
| `77-73` | Differences | section `recipe-differences` + per-block `divergenceNote` | unchanged |
| `77-80` | Analysis plan | **`analysisPlan.text`** | first section whose heading matches `/analysis/i` |

`variables` and `expectedOutcomes` have **no verified Recipe response key**, so they are not invented into one — they compose into the description body (`77-2`) under labelled headers, and into the Open-Ended summary. They remain fully present in the frozen plan and on the Study Record regardless.

**Dual read.** Each mapper reads the typed field first and falls back to the legacy section. This is what lets studies frozen before item ⑤ keep pushing correctly. The editor never silently migrates legacy section text into the typed field — that would rewrite a researcher's plan behind their back.

## Invariants & boundaries

- **Every field is optional.** `readOverview()` must default each one, or old snapshots (and every frozen preregistration) break. This is the single most important invariant here.
- **`templateKey` back-compat default.** A plan without a stored `templateKey` resolves to `replication-recipe` when `replicationIntent` is set, else `open-ended` (`planTemplateKey`). This exactly reproduces the pre-item-⑤ behaviour, where `registry-push.ts` chose the OSF schema implicitly from replication intent. Nothing needs migrating, and no existing study changes which schema it files under.
- **Never materialize the derived template.** `readOverview()` passes `templateKey` through only when explicitly stored, and omits it otherwise — it must NOT fill in the derived default. Several call sites round-trip a plan (`{...readOverview(snap), someField}` — `setReplicationIntent`, `injectReplicationRecipe`), so a materialized default would be written back as though the researcher had chosen it: `open-ended` would be frozen into a study *before* its replication intent was declared, and would then beat the derivation forever. Regression-tested in `server/modules/__tests__/overview.test.ts`.
- **Explicit beats implicit.** Once `templateKey` exists it drives the OSF `schemaName`, superseding the implicit `replicationIntent → Recipe / else Open-Ended` branch in `registry-push.ts`.
- **Amend-not-edit ([ADR-0004](../adrs/0004-preregistration-amendments.md)).** Typed fields are edited on the working tip only. After preregistration, changes go through `studies.amend` — a new superseding `preregistered` version with a required `change_summary` (DB CHECK `experiment_version_amendment_consistency`). Never edited in place.
- **Plan-before-data gate.** `studies.preregister` throws `PRECONDITION_FAILED` unless `dataCollectionStatus === "not-started"`. `amend` is exempt (documenting a mid-flight change is what amendments are for); `publish` and `saveAsNamed` are unaffected. Advisory row on the pre-flight checklist, enforced in the mutation — the same shape as the ADR-0084 branding/IRB gate.
- **Template switching is non-destructive.** Fields are additive on one `overview` object, not partitioned per template, so hiding a field by switching templates never drops its stored value.
- **Client cannot forge status.** `setOverview` accepts the typed plan fields; it does not accept `dataCollectionStatus` (derived) and the gate re-checks live state at freeze time.
