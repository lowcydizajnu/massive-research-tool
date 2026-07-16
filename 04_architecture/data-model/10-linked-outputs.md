# Data model — Linked outputs (OSF resource links)

> Implements [ADR-0103](../adrs/0103-typed-osf-resources.md) (LOS Round 2 item ⑦), [ADR-0104](../adrs/0104-doi-ownership.md) (who mints) and [ADR-0105](../adrs/0105-dataset-to-osf.md) (item ⑧). An OSF **resource** is a typed **DOI** attached to a registration — not a file, not a URL. This entry documents the one table item ⑦/⑧ add, why it is a table rather than a snapshot field, and what OSF holds on the other side.
>
> **This carries a migration** — unlike items ⑤ and ⑥, which rode the snapshot.

## Why a table, not the snapshot

The snapshot-extension pattern ([ADR-0101](../adrs/0101-preregistration-templates-typed-fields.md)) is for **authored record content that must freeze with a version**. A linked output is neither:

- It is **not authored content**. It is the state of a remote object on OSF, with its own identity (`osf_resource_id`), its own lifecycle (draft → finalized → soft-deleted), and its own failure modes.
- It is **not frozen**. Outputs are linked and removed *after* the registration is immutable. A paper's DOI usually does not exist until months after the plan was frozen.

The precedent is `osf_material_upload` ([ADR-0094](../adrs/0094-osf-materials-upload.md)): OSF push state has never ridden a snapshot, for exactly these reasons. We follow it.

## `osf_resource_link`

One row per (study, resource type). Five rows maximum per study — the OSF enum has exactly five public values.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `experiment_id` | uuid → `experiment.id` | the study. **Tenancy rides the study**, as everywhere else — no separate tenant column; every query joins through `experiment.tenant_id`. |
| `resource_type` | text | one of `data` · `analytic_code` · `materials` · `papers` · `supplements`. **These are OSF's wire values** (the `ArtifactTypes` name, lowercased) and are never translated in the DB. User-facing labels live in the Vocabulary map. |
| `pid` | text | the DOI, bare (`10.5281/zenodo.21378393`). OSF normalises a `https://doi.org/…` prefix away; we store what OSF stores. |
| `description` | text nullable | optional; passes through to OSF's `description`. |
| `osf_resource_id` | text nullable | OSF's own id for the resource (e.g. `6a57d09a74c36bb3b650738e`). Null until the POST succeeds. **This is what makes retries safe** — see Reconciliation. |
| `finalized` | boolean not null default false | mirrors OSF's `finalized`. **A row with `finalized = false` is not done** — an unfinalized resource shows no badge on OSF. |
| `source` | text | `minted` · `article_doi` · `external`. Why this DOI is here; drives the panel's source line. |
| `state` | text | `pending` · `linked` · `failed` |
| `error` | text nullable | the reason, for the Failed chip |
| `created_at` / `updated_at` | timestamptz | |

**Unique:** `(experiment_id, resource_type)` — one link per slot. OSF also treats `(pid, resource_type)` as the natural key on its side (ADR-0103 D7).

### Why `source` is stored, not derived

The panel says *"Minted for your OSF project"* vs *"Added by you"*, and a reader must be able to tell whether **we** made a claim or the **researcher** did. Deriving that at render time from "does the pid match articleDoi?" would be a guess that goes wrong the moment a researcher pastes the same DOI by hand. Store the fact when we know it. Same reasoning as ADR-0102's `claim` binding: the provenance *is* the point, so it is recorded, not reconstructed.

## What lives on OSF, not here

We do **not** mirror OSF's resource list. `osf_resource_link` is our record of *what we did*; OSF is the source of truth for *what is*. They can drift — a researcher can delete a resource in OSF's own UI and we would not know until we look.

**Reconciliation** (ADR-0103 D7): before creating, `GET /v2/registrations/{id}/resources/` and match on `(pid, resource_type)`. A retry after a half-finished sequence must find the existing draft rather than POST again — `POST /v2/resources/` creates an *empty* draft and ignores every attribute, so a blind retry strands invisible drafts on the researcher's registration.

## The minted-DOI side

The automatic paths mint a DOI for a node we already push to, then link it:

| Slot | Node | Mint |
|---|---|---|
| `materials` | the study's OSF **project** (ADR-0094 already uploads here) | `POST /v2/nodes/{project_guid}/identifiers/`, `category: "doi"` |
| `data` | a **child component** holding the published dataset | same endpoint, component guid |

Both require the node **public** and the caller **admin** on it, and neither is reversible — there is no DELETE route for a minted DOI. Hence ADR-0104 D3: always explicit, always consented, never a side-effect of an upload.

**Where the component guid lives:** materials reuse `osf_material_upload`'s existing project reference. The dataset component needs its own pointer — add `osf_dataset_component_guid` (text, nullable) to `study_record` rather than a new table: it is one nullable string, one per record, with no lifecycle of its own beyond "does it exist yet".

## Boundaries this model does not cross

- **No DOIs of our own.** `pid` is always someone else's identifier — OSF's, Zenodo's, a publisher's ([ADR-0104](../adrs/0104-doi-ownership.md)).
- **No participant identifier in a deposited dataset.** [ADR-0105](../adrs/0105-dataset-to-osf.md) D2 refuses the deposit when `study_record.dataTable` carries the `externalPid` column. Enforced in the mutation, not the UI — the UI already warns, and a warning cannot un-mint a DOI.
- **Nothing public here.** `osf_resource_link` never reaches `PublicStudyDetail`. The badges live on OSF's registration, which is already public; our record links to the registration, not to a mirror of its badges.

## Migration

Additive: one new table, one nullable column on `study_record`. No backfill — an absent row means "not linked", which is the correct state for every existing study.

**The deploy carries a migration**, so `db:migrate:prod` runs **before** `git push` (the reverse 500'd the site on 2026-06-26).
