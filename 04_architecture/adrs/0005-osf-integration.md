# ADR 0005 — Push-to-OSF integration with registry-agnostic adapter interface

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** integration, open-science, preregistration, OAuth, registry, data-model

## Context

The Open Science Framework (OSF) is the dominant open-science substrate in psychology. Per the literature insight (`01_research/insights/researcher-tooling-pain-points.md`) and the persona-segmentation insight (`01_research/insights/persona-segmentation-and-strategic-risks.md`), OSF integration is not a "would be nice" — it's a **credibility floor**. All four personas treat OSF presence as expected, even when their personal relationship to OSF differs (Maya/Hanna use it as an end-of-line drop, Marek uses it as a working surface, Sofia uses it with complicated feelings post-saga).

The preregistration substrate we built in ADR-0002 (immutable `kind: preregistered` versions), ADR-0003 (asset freeze at preregistration), and ADR-0004 (amendments via `supersedes_version_id` + required `change_summary`) all imply OSF integration as the natural external manifestation: when we preregister internally, that record needs to land on OSF too, because OSF is where the academic community looks.

This ADR specifies *how* OSF integration works and, importantly, designs the integration so that **AsPredicted, ClinicalTrials.gov, and future registries can plug in via the same interface** — OSF is V1, but the abstraction is "registry," not "OSF."

## Options considered

### Option A — Lightweight reference (URL-only)

User preregisters on OSF via OSF's own UI. They paste the resulting URL into an `external_registration_url` field on the ExperimentVersion. No API interaction.

- **Pros.** Trivially simple. No OAuth, no API surface, no maintenance burden.
- **Cons.** Doesn't actually integrate. The persona-validated "credibility floor" isn't delivered by a hyperlink. Hanna's "copying my design from one box to another" pain survives unchanged. Fails to honor the architectural commitments already made to preregistration as a first-class concept. Wastes the asset-freeze infrastructure from ADR-0003.

### Option B — Push-to-OSF on preregistration (chosen — sub-option B.3)

User connects their OSF account once (OAuth). On creation of a `kind: preregistered` ExperimentVersion (or `kind: published`), the platform asynchronously pushes a copy to OSF as an OSF registration. OSF returns a DOI and a public URL; we store both. Amendments per ADR-0004 push as new OSF registrations referencing the prior DOI. Materials covered by ADR-0003's freeze pass are uploaded to OSF as part of the registration.

Sub-options for *what* we push:

- **B.1:** JSON snapshot only — lossless, machine-readable, but the OSF page is barely human-legible.
- **B.2:** Rendered PDF + materials only — human-friendly OSF page, but lossy and not machine-reproducible.
- **B.3 (chosen):** Both — JSON for machines, a rendered PDF for humans, and OSF's preregistration-template fields populated where they map cleanly. Best of both audiences.

- **Pros.** Delivers the persona-validated credibility floor properly. Hanna's "design + prereg as one object" pain is solved. Amendments propagate via DOI references. ADR-0003's frozen assets get a destination. Integration matches what makes OSF central in the field today.
- **Cons.** OAuth + API surface to maintain. OSF API changes are our problem. First-time-user friction (one-time OAuth dance). Need async push + retry logic so a researcher's preregistration moment is not blocked by OSF availability.

### Option C — Bidirectional sync (push + pull + browse + fork-from-OSF)

Everything in Option B, plus pull-from-OSF — users browse OSF projects from inside our tool, fork an OSF-hosted study into ours.

- **Pros.** Biggest vision; uses the OSF back-catalogue as input material.
- **Cons.** Substantially more engineering. OSF wasn't designed for this — most OSF projects are not runnable artifacts; reconstructing intent is exactly the eighteen-month problem Sofia describes. Major V1 scope creep. The data model already leaves room (per ADR-0001's plugin-ready module registry — a future "registry pull" adapter is layerable later).

## Decision

**We will adopt Option B, sub-option B.3: push-to-OSF on preregistration via an OAuth-authenticated, asynchronous, registry-agnostic adapter interface. JSON + rendered PDF + OSF template-field mapping pushed for every `kind: preregistered` or `kind: published` version. Pull-from-OSF and fork-from-OSF are deferred to a future ADR.**

### The nine load-bearing principles

1. **Push is per-user, not per-tenant.** OSF identities are personal. Each researcher OAuth-connects their own OSF account; pushes use that researcher's credentials. The researcher who created the version is the "author" of the OSF registration. Multi-author work uses OSF's own contributor-add flow after push.
2. **Default-on, opt-out per registration.** When a researcher creates a `kind: preregistered` version, OSF push is the default. Opt-out is per-registration, not per-account — for cases like "I'm using AsPredicted for this one" or "I have a reason not to publicize this study yet." Default-virtue per the personas; deliberate exceptions allowed.
3. **Push is asynchronous via Inngest** (per STACK.md). The researcher's "Preregister" click writes the immutable version locally and returns immediately. The OSF push is a background job that retries on failure. The researcher's preregistration moment is never blocked by OSF availability. The version's `registry_push_status` field reflects the job state.
4. **Failed pushes flag the version honestly; they never block preregistration.** Same pattern as ADR-0003's freeze-failure handling. A version with `registry_push_status = 'failed'` after retries is still a valid local preregistration; the UI surfaces "OSF push failed: [reason]" with a manual retry option. The version is not silently downgraded.
5. **What we push (B.3):** for every push, three artifacts:
   - The full JSON snapshot of `definition_snapshot` + `module_version_locks` + `theme_snapshot` (machine-readable, lossless).
   - A rendered PDF of the human-readable preregistration (filled-in template, list of stimuli, methodology, hypotheses).
   - OSF's preregistration template fields populated where they map cleanly (research questions, hypotheses, sample plan, analysis plan, exclusion rules — from the `preregistration` block inside `definition_snapshot`).
   - Plus: all materials covered by ADR-0003's freeze pass, uploaded as OSF files.
6. **Amendments push as new OSF registrations** referencing the prior DOI. Per ADR-0004, an amendment is a new `kind: preregistered` version with `supersedes_version_id`; the OSF push for the amendment includes a "amends [prior DOI]" reference and a human-readable note linking to the prior OSF page. We do NOT modify the prior OSF registration (OSF registrations are themselves immutable).
7. **Registry-agnostic adapter interface.** The push code lives behind a `RegistryAdapter` interface with methods like `connect(user)`, `push_registration(version, materials)`, `push_amendment(version, prior_doi)`, `withdraw(doi, reason)`. The OSF adapter implements this interface. AsPredicted, ClinicalTrials.gov, PsyArXiv, etc. would be future adapters with the same interface. ADR-0001's plugin-ready philosophy applied to registries.
8. **OAuth tokens are stored encrypted, per-user, with refresh handled by the adapter.** Researchers can disconnect their OSF account at any time; future pushes from that user fail with `registry_push_status = 'no_credentials'` until reconnected. Disconnection does NOT retroactively delete pushed registrations (OSF owns them once pushed).
9. **OSF rate limits are the adapter's problem, not the application's.** The adapter implements exponential backoff, queues pushes when rate-limited, and surfaces aggregate health via metrics. The application code never sees a 429.

### Sketch of the data-model additions

Extends ExperimentVersion and adds new entities (full entry in a future `04_architecture/data-model/02-registry-integration.md`):

```
experiment_version  (new fields, extends ADR-0001/0002/0004)
  registry_push_status enum ('not_pushed' | 'pending' | 'pushed' | 'failed' | 'no_credentials' | 'opted_out')
  registry_push_attempts int (default 0)
  registry_push_last_error string (nullable)
  -- existing fields from prior ADRs:
  external_registration_url (nullable) -- the OSF URL after push
  external_registration_doi (nullable) -- the OSF DOI after push

registry  (NEW)
  id, key ('osf' | 'aspredicted' | ...), name, oauth_config json, push_config json, created_at

registry_connection  (NEW)
  id, user_id FK, registry_id FK, access_token (encrypted), refresh_token (encrypted),
  scopes string[], connected_at, last_refreshed_at, revoked_at (nullable)

registry_push  (NEW — one row per push attempt, immutable audit trail)
  id, experiment_version_id FK, registry_id FK, status enum,
  request_payload json, response_payload json (nullable), error_text (nullable),
  pushed_doi (nullable), pushed_url (nullable),
  created_at, completed_at (nullable)
```

`registry_push` is append-only — every push attempt (including failures and retries) is logged. The version's `registry_push_status` is denormalized from the latest `registry_push` row for query speed.

### Mapping our preregistration block to OSF template fields

The preregistration content inside `definition_snapshot.preregistration` (specified at ADR-0004's discussion of typed-in fields) maps to OSF's standard preregistration template roughly as:

| Our field | OSF template section |
| --- | --- |
| `hypotheses[]` | Hypotheses |
| `sample_plan.target_n` + `sample_plan.justification` | Sampling Plan |
| `sample_plan.recruitment_source` | Recruiting |
| `sample_plan.inclusion_criteria` + `exclusion_criteria` | Inclusion / Exclusion |
| `analysis_plan.tests[]` | Analysis Plan |
| `analysis_plan.primary_outcomes[]` | Primary Outcomes |
| `analysis_plan.exclusion_rules[]` | Analysis Plan / Data Exclusion |
| `manipulation_check.description` | Manipulation Check |

Fields we have that don't map to OSF cleanly are included in the JSON snapshot but not in the OSF template fields. Future OSF template revisions are an adapter-level concern.

### Behavior on `kind: published` versions

Same machinery, different metadata. A published version pushes a "publication" record (or a registration tagged as published — OSF supports both flows) and stores the DOI in `external_publication_url`. This is the natural pairing for journal-submitted work.

## Consequences

**What becomes easier:**

- Preregistration is one click for the 90% of researchers who use OSF; the OSF page is populated with a properly rendered, machine + human readable record.
- Amendments propagate without manual work — the OSF lineage matches our internal lineage.
- Asset materials get an OSF home automatically (ADR-0003's freeze investment pays off).
- Future registries (AsPredicted, ClinicalTrials.gov, PsyArXiv) plug in via the same adapter interface — adding one is a focused work item, not a rebuild.
- The "Hanna pain" (copying my design from one box to another) is structurally solved for OSF-using researchers.

**What becomes harder:**

- OAuth flows + token management to maintain (encryption at rest, refresh, revocation, scope changes).
- OSF API surface to track — breaking changes upstream become our problem.
- PDF rendering pipeline to build and maintain. Worth the cost because the same renderer serves journal submission, citation export, and the local "view this preregistration" UI.
- Background-job operational surface (Inngest dashboards, retry policies, error alerts).
- Failure-mode UX is non-trivial: "your preregistration is local but the OSF push failed" needs to be communicated clearly without alarming researchers.

**What we are now committed to:**

- A `RegistryAdapter` interface that survives multiple registries.
- Per-user OAuth, not per-tenant. Researchers own their OSF identity.
- Async push with retries; preregistration moment never blocked.
- Failed pushes are honest, not silent.
- New ExperimentVersion fields + three new entities (Registry, RegistryConnection, RegistryPush).
- Append-only `registry_push` audit trail.

**What we are now precluded from:**

- Tenant-level OSF accounts (researchers can't push under "their lab" — only under their personal OSF account).
- Silent failures or quiet "we'll try later" without status surfacing.
- Modifying prior OSF registrations on amendment (we always push new, reference old).
- Synchronous OSF dependency in any user-facing flow.
- OSF-specific logic outside the adapter (registry-agnostic interface is enforced as a code-review rule).

## Amendment 2026-06-03 — Personal Access Token as a second connect path

**Context.** OSF's CAS OAuth server rejects a `localhost` redirect URI at the authorize step (verified live: a well-formed authorize request with a matching registered `http://localhost` callback returns `invalid_client`; switching to `https://localhost` then returns "invalid request parameters" at OSF's redirect-validation stage). OAuth-on-localhost is therefore not viable for local development, and OAuth in general cannot drive an automated end-to-end test because it requires an interactive OSF login.

**Decision.** Add a second connection method alongside OAuth: a **Personal Access Token** (PAT) the researcher generates at `osf.io/settings/tokens` (scope `osf.full_write`) and pastes into Account Settings · Connections. This is the documented, standard way server-side tools authenticate to the OSF API (osfr, datalad-osf, jsPsych all use a PAT). The token is validated against `GET /v2/users/me/` and then **stored encrypted in the same `registry_connection` row as an OAuth access token** — identical crypto (AES-256-GCM, ADR unchanged), identical downstream push path. `refresh_token` is null (PATs don't refresh; the user reissues if revoked).

**Why this doesn't disturb the architecture.** The PAT is just another way to populate `registry_connection.access_token`. Everything downstream (the push job, token decryption inside the adapter, the registry-agnostic interface) is unchanged. OAuth stays in place for a future deployed `https` domain where the redirect works. Interface change is one additive method: `RegistryAdapter.connectWithToken({ userId, token })`.

**Why not** make PAT the only method? OAuth remains the better UX on a real deployment (no copy-paste of a long-lived secret), and keeping both lets production use OAuth while local/self-hosted/CI use the PAT.

## Amendment 2026-06-03 — Verified OSF registration-push flow + DOI is async

**Context.** Implementing `pushRegistration` required the exact OSF APIv2 contract. `developer.osf.io` is a client-rendered SPA (un-fetchable), so the flow was verified against two authoritative sources: the OSF swagger spec (`github.com/CenterForOpenScience/developer.osf.io`, `swagger-spec/nodes/draft_registrations_list.yaml` + `swagger-spec/draft_registrations/draft_registration_detail.yaml`) and the OSF backend serializer (`github.com/CenterForOpenScience/osf.io`, `api/registrations/serializers.py` → `RegistrationCreateSerializer`).

**Verified flow (what `registry.osf.ts` implements).** Four JSON:API calls (`Content-Type: application/vnd.api+json`), Bearer token decrypted inside the adapter:
1. `POST /v2/nodes/` — create a project node (`attributes: {title, category:"project", public:false}`).
2. `POST /v2/nodes/{node}/draft_registrations/` — relationship `registration_schema` → the schema id resolved at runtime by name (`GET /v2/schemas/registrations/?filter[name]=…`).
3. `PATCH /v2/draft_registrations/{draft}/` — set `attributes.registration_responses`.
4. `POST /v2/nodes/{node}/registrations/` — `attributes: {draft_registration, registration_choice:"immediate"}` (the default-API-version field names; the newer `draft_registration_id` requires a pinned version).

**DOI is asynchronous (contract change).** `RegistrationCreateSerializer.create()` calls `registration.require_approval()` — a newly-registered OSF registration enters **pending-approval**, and OSF mints the **DOI only on approval**. So a push cannot return a DOI synchronously. `PushResult` is changed from `{doi, url}` to `{registrationId, url, doi: string | null}`: the registration GUID + public URL are available immediately; `doi` is `null` at push time and backfilled later (poll the registration's identifiers). The `registry_push_status` `pushed` therefore means "submitted to OSF, pending approval", not "DOI minted".

**Schema choice — "Open-Ended Registration".** Its only response is a free-text `summary`, so our lossless design snapshot always validates. **Why not "OSF Preregistration"?** Its schema has many required structured fields (hypotheses, design, analysis plan, …) that we'd have to map one-to-one and keep in sync with OSF's schema versions; that field-by-field template mapping is deferred to V1.6. For V1.5 we write a human-readable summary plus the machine-readable JSON snapshot into `summary` — lossless and never rejected on missing required fields. Schema is env-overridable (`OSF_REGISTRATION_SCHEMA`).

**Amendment/withdrawal push** (`pushAmendment`/`withdraw`) stay NOT_IMPLEMENTED until V1.6 — the V1.5 anchor is "Hanna preregisters and runs", not "amends".

## Revisit triggers

Reopen this decision (probably as a superseding or extending ADR) if:

- **Pull-from-OSF / fork-from-OSF becomes a real product need.** Promotes us toward Option C territory. Sketch: a new adapter method `import_registration(doi)` that produces a draft ExperimentVersion from an OSF registration. Hard problem because OSF registrations aren't generally runnable.
- **A second registry adapter is needed (AsPredicted is the likely first).** Tests whether the abstraction held. If it didn't, we refactor and write a follow-up ADR.
- **OSF's API evolves significantly** (new template structure, new auth model, new asset model). Adapter rewrite, not architecture revision.
- **A regulatory body (e.g., for clinical trials)** requires registry behavior we can't ship via the same flow. New adapter with stricter semantics; possibly new ADR if the registration model needs to bifurcate.
- **Per-tenant OSF accounts become a real ask.** Currently precluded; if institutional research-software contracts force the question, write a superseding ADR with an explicit tenancy model for registry connections.

## References

- ADR-0001 — modular composition + theme overlays — the snapshot structure that gets pushed.
- ADR-0002 — forking model — `kind: preregistered` and `kind: published` are the trigger points for push.
- ADR-0003 — asset storage — the freeze pass that produces the materials we upload to OSF.
- ADR-0004 — preregistration amendments — `supersedes_version_id` drives the amendment-push behavior.
- `02_product/product-brief.md` §2 (open-science workflow) and §8 (segment-dependent wedge value).
- `01_research/insights/researcher-tooling-pain-points.md` — establishes OSF as a credibility floor in psychology.
- `01_research/insights/persona-segmentation-and-strategic-risks.md` — confirms OSF expectation across all three synthetic-pilot personas.
- `02_product/personas/*` — all four personas treat OSF as expected substrate.
- `STACK.md` — Inngest as the background-job platform for async push.
- Future: `04_architecture/data-model/02-registry-integration.md` — fleshes out Registry, RegistryConnection, RegistryPush entities.
- Future: ADR for AsPredicted adapter (likely tests whether the abstraction held).
- Future: ADR for pull-from-OSF / fork-from-OSF (Option C territory).
- OSF API documentation (external): the surface this ADR's adapter targets.


## Amendment 3 (2026-06-12) — Replication Recipe schema, amendments, DOI backfill (V1.31.0)

Owner direction: "fix all gaps for OSF." All contracts in this amendment were verified LIVE against `api.osf.io` on 2026-06-12 (no guessed keys):

- **Replication Recipe schema** — `Replication Recipe (Brandt et al., 2014): Pre-Registration` (schema id `64b14a08d639e5000d2013a5`, v2). Its `schema_blocks` carry 28 `registration_response_key`s (`77-2` … `77-82`) and **every one is optional**, so partial filing is valid. Declared replications (`overview.replicationIntent` set, ADR-0039) now file under this schema with auto-mapped responses: Description (`77-2`) ← target-effect section + abstract + the full auto-generated protocol sheet; Original Study Conducted (`77-12`) ← source study title; Sample Size Target (`77-33`) ← planned-sample section; Difference Influencing Effects (`77-73`) ← the per-block divergence rationales + differences section; Analysis Plan (`77-80`) ← any "analysis" section. Single-selects (Exact/Close/Different similarity ratings) are never auto-filled — the researcher completes them on OSF. Mapping lives in `server/modules/osf-recipe.ts` (pure, tested). Non-replications keep the verified Open-Ended summary flow unchanged.
- **Amendments** — a second preregistration of the SAME study is detected in the push job (a prior `pushed` version exists): the new registration files on the **same OSF project node** (`nodeId` now returned by `pushRegistration` and stored in the push row's response payload; older pushes without it fall back to a fresh node) with an `AMENDMENT — supersedes <url>` header + the ADR-0033 auto-changelog lines, prepended to the summary (Open-Ended) or the Description (Recipe). `pushAmendment` is the same verified flow with node creation skipped.
- **DOI backfill / two-way sync** — `getRegistrationStatus` reads `GET /registrations/{id}/` (`pending_registration_approval`, `withdrawn`, `public`) + `GET /registrations/{id}/identifiers/` (`category == "doi"` — verified shape). `studies.refreshRegistration` backfills `external_registration_doi`; the Preregister page shows a "Check OSF status" button while pushed-without-DOI.
- **Withdrawal — implemented + verified live (2026-06-17).** The write contract was the one piece we couldn't verify without sacrificing a real registration. Confirmed against the OSF API source (`api/registrations/serializers.py`): there is **no** direct withdraw endpoint and the `/requests/` collection is read-only — a registration is retracted by **`PATCH /v2/registrations/{id}/`** with `attributes.pending_withdrawal: true` + `withdrawal_justification`, which triggers OSF's `retract_registration` (opens a withdrawal pending the **active contributors' approval**; the public tombstone keeps title/contributors/justification). `withdraw()` now makes that PATCH (`osfIdFromDoi` derives the guid from the DOI). **Verified live** against sacrificial registration `10.17605/OSF.IO/RXZQA` via `scripts/verify-osf-withdraw.ts`: HTTP 200, `pending_withdrawal` flipped false→true, justification recorded. Note the two-step nature: our API call *initiates*; OSF's contributor-approval step *finalizes* the tombstone.

## Amendment 4 (2026-06-15) — Co-authors → OSF contributors

Owner direction: implement the deferred contributors push, after verifying the API shape (no guessing).

- **Verification.** The shape was confirmed against OSF's source-of-truth serializer `api/nodes/serializers.py` (`NodeContributorsCreateSerializer`, default branch `develop`) — the public docs site is a JS SPA and couldn't be fetched. Endpoint: `POST /v2/nodes/{node_id}/contributors/`, `data.type = "contributors"`. Writable attributes: `bibliographic` (bool, default true), `permission` (`read|write|admin`, default `write`), optional `index`; **unregistered** contributors use `full_name` + `email` (the serializer rule: provide a user id *or* a full name, and do **not** send an email together with a user id). The `send_email` query param controls the claim email.
- **What we send.** Active workspace **members other than the pusher** (who is already the node creator/admin via their OSF token) are added as **unregistered** contributors (`full_name` + optional `email`) — our users are Clerk accounts, not OSF users, so we have no OSF user ids to use the registered path. `bibliographic: true`, `permission: "write"`, `?send_email=false` (no surprise claim emails — they appear on the registration; the researcher manages access on OSF).
- **Where.** Added in `pushRegistration` immediately after a **new** project node is created. Amendments reuse the existing node (Amendment 3), so contributors are **not** re-added there (they already exist) — this is the idempotency story across pushes. The member list is gathered in the `registry.push` job (`runRegistryPush`) and passed as `RegistrationPayload.contributors`.
- **Best-effort.** Each contributor POST is wrapped in try/catch: a single failure (duplicate, bad email, OSF hiccup) is skipped and never aborts the registration — the registration itself is the critical artifact. Tested in `registry.osf.test.ts` (a failing contributor still yields a registration; amendment path adds none).
- **Deferred still:** the registered-contributor path (mapping our users to OSF user ids) — only relevant once we know a co-author's OSF identity; unregistered-by-email covers the realistic case today.
