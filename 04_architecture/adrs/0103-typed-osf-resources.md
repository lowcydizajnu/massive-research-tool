# ADR 0103 — Typed OSF resources (outputs as DOIs)

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Paweł Rosner
- **Tags:** integration, osf, data-model, record

## Context

LOS Round 2 item ⑦ was written as: *"register outputs as typed OSF resources pointing at the registration DOI"* (`01_research/insights/los-alignment-and-templates.md`), scored **"Partial (1 of 5)"** on the strength of Materials reaching OSF via ADR-0094.

**Both halves of that framing are wrong, and grounding proved it before any code was written.** Verified against the live `api.osf.io` and the `CenterForOpenScience/osf.io` source:

- An OSF **resource** is a **typed DOI**, not a file and not a URL. `ResourceSerializer` (`api/resources/serializers.py`) exposes `resource_type`, `pid`, `description`, `finalized`. `OutcomeArtifact` is *"a through-table … between an Outcome and an external Identifier"*. The PID is constrained: *"for now, only `doi` is supported"* (`osf/models/outcome_artifacts.py`).
- The resource points at **the output's own DOI**, **not** the registration's. The registration is named by a JSON:API relationship, and attaching the registration's own DOI raises `IsPrimaryArtifactPIDError`; `ArtifactManager.for_registration` structurally excludes the registration's identifier. Live registration `pbu8x` carries `resource_type: "data"` → `10.48324/dandi.001075/0.240930.1859` and `"analytic_code"` → `10.5281/zenodo.21378393` — **external Zenodo/DANDI DOIs**.
- We are therefore at **0 of 5, not 1 of 5**. ADR-0094's Materials push writes raw bytes to `files.osf.io/v1` (WaterButler) on the *mutable project node*. That is a different host and a different API surface, and it produces no DOI. It has never created a typed resource.

The five public types are exactly `data`, `analytic_code`, `materials`, `papers`, `supplements` (`ArtifactTypes.public_types()`; the wire format is the enum name lowercased, so `analytic_code` keeps its underscore). Registrations expose matching read-only filterable badges `has_data` / `has_analytic_code` / `has_materials` / `has_papers` / `has_supplements`.

This lands on a fact with product consequences: **every resource needs a DOI for the artifact itself, and we mint none.** There is no DataCite adapter and no DOI minting anywhere in `05_app` — the only DOI we produce is OSF's registration DOI, which is the one DOI a resource may *not* use. Of our outputs, exactly one already has a real DOI: `study_record.articleDoi`, which the researcher pastes.

Whether we should mint our own DOIs is a question the insight itself parked as unanswered and owner-owned (*"DOI ownership — should the record mint its own DataCite DOI, or always adopt the OSF registration DOI as canonical?"*). This ADR must not smuggle that decision inside an integration task.

## Options considered

### Option A — Mint our own DOIs (DataCite), then register everything

- Add a DataCite adapter, mint a DOI per dataset/code bundle, register all five types automatically.
- **Pros:** all 5 badges; our outputs become independently citable; the strongest LOS story.
- **Cons:** answers "DOI ownership" by fiat inside an integration ticket; a new vendor seam and a new row in the lock-in inventory (ADR-0007); DataCite membership is a real-world cost and commitment the agent cannot incur; a DOI is a permanent promise, and minting one for a mutable CSV export is a claim we cannot keep.

### Option B — Papers automatically, everything else by researcher-supplied DOI *(chosen)*

- Register `papers` from the article DOI we already hold. For `data` / `analytic_code` / `supplements` / `materials`, let the researcher paste a DOI for anything they have already deposited (Zenodo, Dryad, DANDI, an OSF project).
- **Pros:** every registered resource is true by construction — a DOI exists because someone deposited something; no minting, no new vendor; matches what real OSF registrations actually contain (verified: Zenodo/DANDI DOIs); leaves DOI ownership genuinely open.
- **Cons:** 4 of 5 badges require researcher effort; a researcher with no deposit gets nothing automatic; we depend on them pasting a correct DOI.

### Option C — Defer ⑦ until ⑧ (publish dataset to OSF) lands

- Hope that ⑧ yields a DOI for the dataset, then register it.
- **Pros:** would make `data` automatic.
- **Cons:** **unverified** that the ⑧ path mints a DOI at all — OSF mints DOIs for registrations, and whether a dataset component gets one on that path was not confirmed. Blocking ⑦ on an unverified assumption about ⑧ is exactly the reasoning this ADR exists to avoid.

## Decision

**We will register typed OSF resources only for outputs that already have a DOI: `papers` automatically from `study_record.articleDoi`, and `data` / `analytic_code` / `supplements` / `materials` from a DOI the researcher supplies. We will not mint DOIs.**

A DOI is a promise of permanence, and we can only make that promise for something a repository has actually undertaken to keep. Registering a resource we cannot back would put a false citation on a public registration — the same class of harm ADR-0102 exists to prevent on the record. The live evidence says this is not a compromise but the native workflow: real researchers deposit on Zenodo/DANDI and link the DOI, and OSF's own production data shows exactly that.

### D1 — A resource is a typed DOI; we never conflate it with a file

`osfResources` is a new capability on the existing `RegistryAdapter` (`05_app/server/adapters/registry.ts`), implemented only in `registry.osf.ts` per ADR-0007. It is **separate from** ADR-0094's `uploadMaterials`, which writes bytes to `files.osf.io/v1` and yields no DOI. A study may have Materials on OSF *and* no `materials` resource; those are different facts and the UI must not imply otherwise.

**Rejected:** deriving a `materials` resource from the ADR-0094 upload. That upload produces a file in a mutable project node, not a DOI. There is nothing to point at.

### D2 — `papers` is automatic; the other four are researcher-supplied

`study_record.articleDoi` is the only DOI we hold for an output. When present it registers as `papers`. Everything else is a paste. **Nothing is invented, and nothing is auto-registered that we cannot evidence.**

**Rejected:** auto-registering `data` from the export. The export is a client-side CSV with no persistent identifier (ADR-0014 keeps participant data private and public data aggregate-only); it is deposited nowhere and has no DOI.

### D3 — Creating a resource is a two-step dance, and the code must say so

`POST /v2/resources/` **ignores every attribute sent** and creates an empty, non-finalized draft; it reads only the `registration` relationship (`create()` never applies `validated_data`). Content is set by a follow-up `PATCH /v2/resources/<id>/`. The adapter performs POST → PATCH(content) → PATCH(`finalized: true`) and treats a resource that exists but is not finalized as **incomplete, not done**.

**Rejected:** a single POST carrying attributes. It silently produces an empty draft — a resource that exists, shows no badge, and looks like success.

### D4 — The registration must already have a DOI, and we gate on it rather than discover it via 409

OSF returns `409 Conflict: "Cannot add Resources to a Registration that does not have a DOI"` when the Outcome cannot be created (`NoPIDError` → `Conflict`). Our DOI arrives asynchronously via the existing OSF poll/backfill, so a study can sit preregistered-without-DOI for a while. The affordance is disabled with that reason stated until `externalRegistrationDoi` is non-null.

**Rejected:** letting the 409 surface as an error. It is a predictable state, not a failure, and it has a specific cause worth naming.

### D5 — `finalized` is a one-way latch and we treat it as one

PATCHing `finalized` back to `false` is a 409. Deleting a finalized resource is a soft delete that logs a `REMOVE` action on the parent Outcome; deleting a non-finalized one is a hard delete. Once finalized, "remove" is a public, logged act — the UI says so before the click, not after.

### D6 — Push state lives in a real table, not a snapshot

`osf_resource_link` (`experiment_id`, `resource_type`, `pid`, `description`, `osf_resource_id`, `finalized`, `state`, `error`, timestamps). This follows `osf_material_upload` (ADR-0094): a remote OSF object has its own identity and lifecycle, so it needs a row. The snapshot-extension pattern (ADR-0101) is for *authored record content* that must freeze with a version; a resource is neither authored content nor frozen — it can be added and removed after the registration is immutable.

**Accepted cost:** a migration, unlike items ⑤ and ⑥.

### D7 — Idempotency: `(pid, resource_type)` is the natural key

A pid+type pair is unique per Outcome on OSF's side. Retries reconcile against the remote list (`GET /v2/registrations/<id>/resources/`) rather than blindly POST, or a retried job strands empty drafts. The existing Inngest retry model applies unchanged.

### D8 — Vocabulary: "Linked outputs", never "resources", never "artifacts"

`00_meta/rules/design-rules.md` requires user-facing copy to be researcher-native. "Resource" is OSF's word and ambiguous in English; "artifact" is OSF's internal model name and means nothing to a researcher. User-facing: **"Linked outputs"**, with the five rendered as **Data · Analysis code · Materials · Paper · Supplements**. Internal docs and code keep OSF's exact wire values (`analytic_code` etc.) so the mapping stays checkable. The Vocabulary table gains a row.

### D9 — No new OAuth scope

Reads need `read_registration_resources`, writes `write_registration_resources`; both are composed into `osf.full_write`, which we already request. Item ⑦ therefore does **not** collide with the deferred OSF backlog #5 (refresh-on-401 + registered-contributor), whose trigger is registering the OSF OAuth app.

## Consequences

- **What becomes easier:** a researcher who deposited data on Zenodo can make their OSF registration show the Data badge without leaving our app; the record and the registration finally agree about what exists.
- **What becomes harder:** four of five badges need researcher action. We must make pasting a DOI feel worth it rather than like homework.
- **What we are now committed to:** OSF's two-step create + finalize latch; a real table; DOIs we did not mint being first-class citizens of our record.
- **What we are now precluded from:** claiming a badge we cannot evidence. If there is no DOI, there is no resource — the same refusal as ADR-0102's "no binding, no Preregistered".
- **Accepted cost:** we ship 1 automatic badge out of 5 and call that honest, rather than 5 badges backed by DOIs we invented.

## Revisit triggers

- We decide DOI ownership (mint via DataCite vs adopt OSF's). That would make `data` and `analytic_code` automatic, and this ADR would be amended rather than replaced.
- Item ⑧ (publish dataset to OSF) is verified to yield a DOI for the dataset — then `data` becomes automatic on that path.
- OSF supports a PID type other than `doi` (the source says *"for now, only 'doi' is supported"*, which invites change).
- OSF adds a sixth `ArtifactTypes` public value.
- OSF's DOI validation against the registration agency is confirmed ON in production (currently **unverified**) — then a syntactically valid but nonexistent DOI would be rejected at create time and we must surface that specifically.

---

## Amendment 1 — 2026-07-16 — D1's rejection was wrong; `materials` can be automatic

Prompted by the owner asking the obvious question this ADR had stopped asking: *"does it make our app and its functionalities like uploading material to osf redundant, and make us just a link collectors?"*

**D1 rejected deriving a `materials` resource from the ADR-0094 upload on the grounds that "there is nothing to point at." That is false.** OSF will mint a DOI for a public project or component: `POST /v2/nodes/{node_id}/identifiers/` with `category: "doi"`. We already push the materials to that project. So there *is* something to point at — we simply never thought to ask OSF to mint it.

What changes:

- **`materials` becomes automatic**, not paste-only: upload (we already do) → the researcher consents to make the project public → we ask OSF to mint its DOI → we register that DOI as a `materials` resource. This makes ADR-0094's upload **more** valuable, not redundant: it is what turns a file copy into a citable deposit.
- **The item-⑧ question in the Revisit triggers is answered.** A child component can be minted independently of its parent, so item ⑧ can put a dataset in its own component and mint a DOI for just that dataset. `data` becomes automatic on that path.
- **The paste field is demoted to an escape hatch** (owner's steer: *"for sure for public record we can have custom fields for external doi if someone want to add them"*). It stays optional and is never required. It exists for researchers who already deposited elsewhere.
- **Nothing is forced** (owner: *"but of course not forced researcher"*). Minting requires making the researcher's own OSF project public and cannot be undone — so it is always explicit and consented, never a side-effect of upload. See ADR-0104 D3.

**We still do not mint DOIs ourselves** — ADR-0104 settles that. OSF is the registrant. The Decision above ("we will not mint DOIs") stands; what changes is that *asking OSF to mint* was never considered and is not the same thing.

The scoring in Context ("0 of 5") stands and remains correct: today we register none.

---

## References

- [ADR-0104 — DOI ownership](0104-doi-ownership.md) — amends this ADR; settles who mints.
- OSF source, fetched 2026-07-16: [`osf/utils/outcomes.py`](https://raw.githubusercontent.com/CenterForOpenScience/osf.io/develop/osf/utils/outcomes.py) (`ArtifactTypes`, `public_types()`); [`api/resources/serializers.py`](https://raw.githubusercontent.com/CenterForOpenScience/osf.io/develop/api/resources/serializers.py) (`ResourceSerializer`, `create()`); [`osf/models/outcome_artifacts.py`](https://raw.githubusercontent.com/CenterForOpenScience/osf.io/develop/osf/models/outcome_artifacts.py) (`_update_identifier`, `finalize`, `IsPrimaryArtifactPIDError`); [`api/resources/urls.py`](https://raw.githubusercontent.com/CenterForOpenScience/osf.io/develop/api/resources/urls.py).
- Live API, fetched 2026-07-16, unauthenticated: `GET https://api.osf.io/v2/registrations/pbu8x/resources/` → 200 with populated `data` / `analytic_code` / `papers` resources carrying Zenodo + DANDI DOIs. `GET https://api.osf.io/v2/resources/` → 405 (POST-only).
- [ADR-0094 — OSF materials upload](0094-osf-materials-upload.md) — the *different* surface (WaterButler bytes, no DOI).
- [ADR-0007 — Path A vs B (the vendor adapter seam)](0007-path-a-vs-b.md); [ADR-0014 — response data model](0014-response-data-model-and-conditioning.md); [ADR-0101](0101-preregistration-templates-typed-fields.md); [ADR-0102](0102-plan-report-link-back.md).
- [LOS alignment insight](../../01_research/insights/los-alignment-and-templates.md) — **corrected by this ADR** on two points: item ⑦'s direction, and the 1-of-5 score.
