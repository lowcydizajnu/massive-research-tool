# ADR 0105 — Publish a dataset to OSF (opt-in, permanent)

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Paweł Rosner
- **Tags:** integration, osf, privacy, data, record

## Context

LOS Round 2 item ⑧: *"opt-in **publish dataset to OSF** (aggregate/de-identified)"*. ADR-0103 established that an OSF resource is a typed DOI; ADR-0104 established that **OSF mints, we do not**, and that a child component can be minted independently. So item ⑧ is now mechanically possible: deposit the dataset in its own OSF component, ask OSF to mint that component's DOI, and register it as a `data` resource on the registration.

Two facts from the existing code decide the shape.

**We already have a vetted public dataset.** `studyRecord.publishDataset` stores `study_record.dataTable` — a snapshot the researcher deliberately published on their record (ADR-0056 E2). `data-publish-control.tsx` defaults to **excluding** `externalPid` and per-respondent viz links, marks `externalPid` with a `⚠︎` if re-added, requires a *"Confirm the data is anonymous"* checkbox, and is **default OFF**. So a curated, consented artifact already exists. Item ⑧ does not need to invent a second export or a second privacy review.

**`external_pid` is real re-identification.** ADR-0014's PII boundary is precise: we never store IPs or user-agents, but we *do* store `external_pid` — the Prolific/CloudResearch worker ID — *"so she can reconcile payment"*. ADR-0014's own words: the researcher *"does NOT see anything that could be re-identified externally without join-with-Prolific work she does herself."* A worker ID **is** that join key. In a public dataset it is re-identifiable by anyone with panel access, and it is a known real-world disclosure hazard.

**The asymmetry that forces this ADR:** publishing on our record is **reversible** — `unpublishDataset` clears `dataTable` and it is gone. Depositing to OSF and minting a DOI is **not**. ADR-0104 verified there is no DELETE route for a minted node DOI. The researcher consents; the *participant* bears the permanence. Those are different people, and only one of them is in the room.

## Options considered

### Option A — Deposit the already-published `dataTable`, and hard-block a PID *(chosen)*

- Item ⑧ deposits exactly what `publishDataset` stored. Requires `dataPublished = true` first. If `dataTable` contains an `externalPid` column, the deposit is **refused** with the reason named.
- **Pros:** no second privacy surface — if it is not public on their own record, it cannot go to OSF; reuses the consent and column picker already built; the refusal is checkable, not advisory.
- **Cons:** a researcher who deliberately published PIDs on their record (warned, consented) cannot deposit until they remove that column. That is friction we are choosing to impose.

### Option B — Deposit `dataTable` as-is; warn harder

- Mirror the record's stance: warn about the PID, let them proceed.
- **Pros:** consistent with *"not forced researcher"*; treats the researcher as the adult they are.
- **Cons:** the warned party is not the harmed party. The record's warning is survivable because the act is reversible; here it is permanent. A warning cannot un-mint a DOI.

### Option C — Build a fresh, separate de-identified export for OSF

- **Pros:** could be stricter than the record's.
- **Cons:** two datasets claiming to be "the data" is worse than one; a second privacy review to keep in step with the first; and it discards the researcher's actual curation.

## Decision

**We will deposit exactly the dataset the researcher already published on their record, and we will refuse the deposit if it contains a participant identifier.**

The reasoning is the asymmetry. Everywhere else in this product we warn and let the researcher decide, because they can undo it. A DOI cannot be undone, and the person exposed by it never agreed to permanence — they agreed to take a study. Where an act is irreversible *and* the cost lands on a third party, a warning is not consent, it is paperwork. This is the same shape as ADR-0102's ratchet ("no binding, no *Preregistered*") and ADR-0103's ("no DOI, no resource"): the system refuses to assert what it cannot stand behind.

*"Not forced"* is preserved where it means something: **nothing here is required.** Publishing a dataset is opt-in, depositing it is a further opt-in, and a researcher who wants their PIDs public can still have that on their own reversible record. What they cannot do is make it permanent through us.

### D1 — The deposit source is `study_record.dataTable`, never a fresh export

Precondition: `dataPublished = true`. If it is not public on their record, there is nothing to deposit. This keeps one dataset, one curation, one consent.

**Rejected:** exporting fresh at deposit time. It would bypass the column picker the researcher actually used and could deposit data they never chose to publish.

### D2 — A participant identifier in `dataTable` is a hard refusal

If `dataTable.headers` contains **the literal string `external_pid`**, `PRECONDITION_FAILED` naming the column and the reason. The researcher removes it from the record's published set and retries.

**The literal matters, and this ADR originally got it wrong.** It said `externalPid`. That is the internal `ExportColumn.key` (`lib/export/dataset.ts:28`), but `buildMatrix` emits `headers: visible.map((c) => c.label)` (`dataset.ts:237`) — the **label**, `external_pid`. A refusal written against `externalPid` matches nothing, never fires, and hands a permanent DOI to a dataset carrying worker IDs: the precise harm this ADR exists to prevent, defeated by a camelCase/snake_case mismatch. Test the refusal against a `dataTable` built by the real export path, never a hand-written fixture — a fixture would agree with whichever spelling the code used.

**This check must live on the server, not the picker.** `publishDataset` validates shape and ownership only; the `external_pid` default-exclusion and the anonymity checkbox are both in `data-publish-control.tsx`, so a `dataTable` already in the database may contain PIDs (the researcher can re-add the `⚠︎`-marked column, and ADR-0056 E2 deliberately lets them, because the record is reversible). The deposit is where reversibility ends, so the deposit is where the check binds.

**Rejected:** stripping it silently at deposit. Then the record and the DOI would disagree about what "the data" is, and we would have edited a researcher's dataset without telling them.

### D3 — The dataset gets its own component, not the project

Deposit into a **child component** of the study's OSF project (verified: a child can be minted independently of its parent). This keeps the dataset's DOI distinct from the materials' DOI and from the registration's — three different artifacts, three identifiers, which is what the resource types are for.

### D4 — One mint path, two callers

The mint (`POST /v2/nodes/{id}/identifiers/`, `category: "doi"`, per ADR-0104 D3) is written once and used by both item ⑦ (materials → project DOI) and item ⑧ (dataset → component DOI). Both require the node public + caller admin, both are consented, neither is a side-effect of an upload.

### D5 — Consent states the two things that are permanent

Before the click: **this makes an OSF component public**, and **the DOI cannot be removed**. Both consequences, in researcher language, before the act — not a toast after it. Precedent: the ADR-0084 branding gate (advisory row, enforced in the mutation) and item ⑤'s plan-before-data gate.

### D6 — Withdrawal is honest about what it can and cannot undo

`unpublishDataset` clears our record's copy. It does **not** retract the OSF component or its DOI. The UI must not imply otherwise: once deposited, "remove from the record" and "remove from the scholarly record" are different acts, and we can only do the first.

## Amendment 1 — 2026-07-16 — re-deposit: never overwrite, and D3's single column is wrong

This ADR was written without an answer to the question that had blocked the `data` slot all along, named in `makeOutputCitable`'s own docblock: *"what a RE-deposit does to a DOI that already points at it."* Project-owner direction, 2026-07-16: **"we need to avoid ambiguity and make it transparent but not block"** — and the motivating case, in the owner's words: *"it might be case of collecting more responses to reach the effect size."*

That case is legitimate research, and refusing it would be the wrong call. But it is also indistinguishable, from the outside, from optional stopping — and the silent-overwrite path is precisely the one that makes optional stopping invisible. So: never block, never hide.

### D7 — A re-deposit is a new artifact, never an overwrite

Each deposit gets **its own child component, its own DOI, and its own `data` resource on the registration**. Earlier deposits are untouched: their DOIs keep resolving, their components stay up. A citation to deposit 1 continues to mean what it meant on the day it was made.

**Verified live 2026-07-16:** OSF accepts two finalized `data` resources with different DOIs on one registration; both are returned by `GET /v2/registrations/{id}/resources/`. The constraint was never OSF's — it is ours.

**Rejected:** re-uploading into the same component. `uploadMaterials` new-versions a file in place and the DOI is per-node, so the same DOI would silently start resolving to different data. That is the one outcome the docblock refused to ship, and it is what the code does today by default.

### D8 — D3's single column cannot express this; supersede it

D3 and `data-model/10-linked-outputs.md` both chose `study_record.osf_dataset_component_guid` — one nullable column, "no lifecycle of its own beyond 'does it exist yet'". D7 gives it a lifecycle: N deposits, ordered, each with its own guid, DOI, and N. One column cannot hold a sequence, and deposit 2 would orphan deposit 1's component — losing exactly the sequence D7 exists to show.

- **Drop** `study_record.osf_dataset_component_guid` (migrated in 0058, never written by anything, never deployed).
- **Add** `dataset_deposit`: `experimentId`, `ordinal`, `componentGuid`, `doi`, `rowCount`, `depositedAt`, and the `osfResourceLink` row it registered as. Unique on `(experimentId, ordinal)`.
- **Relax** `osf_resource_link_study_type_uq`. Unique on `(experimentId, resourceType)` is right for the four one-artifact slots and wrong for `data`; make it partial, excluding `data`.

**Why a table and not more columns:** the deposit is the thing with identity here — it has an ordinal, a moment, a size, and a DOI that outlives our row. That is a row, not a field.

### D9 — Transparency is deposit-to-deposit, not deposit-versus-plan

Deposit 2 states what changed since deposit 1 — *"N went 200 → 400 since deposit 1 on 3 June"* — and prompts for a Deviations entry. It does **not** block.

**Why not compare against the preregistered plan:** `samplingPlan` is a `PlanField` — free text up to 2000 chars (`blocks.ts:158`). There is no stored target number, and parsing *"N=400, 95% power"* out of prose is a guess this project does not get to make. `recruitment_session.target_n` is a real integer but lives outside the frozen snapshot and can be edited after preregistration, so treating it as the plan would assert a rigour we cannot back.

Deposit-to-deposit is also the **better** check, not merely the available one. Optional stopping is not "N ≠ the planned N" — a study can miss its target for a dozen innocent reasons. It is **N grew after the researcher saw the data**, and two dated deposits are exactly that evidence. We show the frozen `samplingPlan` text beside the delta and let the researcher — and the reader — judge against the plan themselves. `rowCount` is stored per deposit because nothing else records it: `dataTable` is a one-shot overwrite and its row count is derived at read time.

**Rejected:** adding a typed numeric `targetN` to the plan. Honest and checkable, but it changes item ⑤'s template contract and helps only studies preregistered after it ships — a fix for later, not a dependency now (added to Revisit triggers).

## Consequences

- **What becomes easier:** the `data` badge becomes automatic for anyone who published a dataset; the one-click deposit replaces export → Zenodo → account → upload → metadata → mint → copy → paste.
- **What becomes harder:** a researcher who published PIDs must remove them to deposit. Deliberate.
- **What we are now committed to:** one dataset with one curation; refusing rather than silently editing; naming permanence before the click.
- **What we are now precluded from:** depositing anything the researcher has not already chosen to make public.
- **Accepted cost:** friction for the PID case, and a "not forced" rule with exactly one exception — stated, argued, and narrow.

## Revisit triggers

- A researcher presents a legitimate case for a public PID (IRB-approved, already-public panel data) that the hard block wrongly prevents. Evidence, not speculation — then D2 becomes a consented override.
- A typed numeric `targetN` lands in the preregistration template (item ⑤'s contract), at which point D9 can compare deposit N against the *frozen plan* as well as against the prior deposit.
- ADR-0014's PII boundary changes (e.g. `external_pid` stops being stored, or new identifying columns appear — each would need adding to D2's refusal set).
- OSF gains a retraction path for minted DOIs, which would weaken the asymmetry this ADR turns on.
- We add a second deposit target (Zenodo) — D1/D2 should generalise, D3/D4 are OSF-specific.

## References

- [ADR-0104 — DOI ownership](0104-doi-ownership.md) — OSF mints; the component-DOI finding this depends on.
- [ADR-0103 — typed OSF resources](0103-typed-osf-resources.md) — a resource is a typed DOI; `data` is the badge this fills.
- [ADR-0014 — response data model](0014-response-data-model-and-conditioning.md) — the PII boundary; `external_pid` is stored for payment reconciliation.
- [ADR-0056 / E2] `studyRecord.publishDataset` + `05_app/components/feature/study-record/data-publish-control.tsx` — the existing consent + column picker this reuses.
- [ADR-0094 — OSF materials upload](0094-osf-materials-upload.md) — the upload pipe; the mint is new, the transport is not.
