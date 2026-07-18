# Insight — Zenodo dataset deposit

- **Status:** in review
- **Evidence basis:** Zenodo REST API + policy docs (developers.zenodo.org, help.zenodo.org, about.zenodo.org/policies), read live 2026-07-18, cross-referenced against our shipped OSF dataset deposit (ADR-0104/0105) + lock-in inventory
- **Confidence:** high
- **Source materials:** see Sources; [los-alignment-and-templates](los-alignment-and-templates.md); ADR-0103 / 0104 / 0105 / 0007
- **Last updated:** 2026-07-18

## Headline

> Zenodo is a legitimate **second** home for a published dataset, and the one thing it does that OSF does not is **native versioning**: a re-deposit becomes a new *version* under a shared **concept DOI**, instead of an unlinked new component with a new DOI (which is the workaround ADR-0105 am.1 D7 had to invent for OSF). Everything else about the two is the same in the ways that matter here — both are structurally-funded archives that can promise permanence, both mint the DOI (so our "adopt, don't mint" stance holds), and both are irreversible once published. That last fact means Zenodo inherits **all** of ADR-0105's privacy discipline unchanged. **Recommendation: worth building, but as a parallel target behind the existing offer, not a replacement for OSF — and it is a genuinely new vendor seam (a new OAuth app + adapter + lock-in row), so it is a "Next", not a quick win.** It is not required for LOS completeness (item ⑧ already ships a citable dataset DOI via OSF); it is a quality upgrade for the specific "I collected more data and want to re-deposit" case.

## Evidence

### The API is real, documented, and small (verified 2026-07-18)

The deposit flow is four calls, all under a stable, versioned REST API (Zenodo runs on InvenioRDM v12; the `/api/deposit/depositions` API is the documented, backward-compatible path):

1. `POST /api/deposit/depositions` → returns the deposition id + a `links.bucket` URL.
2. `PUT {bucket_url}/{filename}` — stream the file (new bucket API: up to 50 GB/file, 100 files/record).
3. `PUT /api/deposit/depositions/:id` — the `metadata` object.
4. `POST /api/deposit/depositions/:id/actions/publish` → `202`, DOI assigned.

**Auth** is OAuth 2.0 with a personal access token (`Authorization: Bearer …`); the scopes are `deposit:write` (create/edit drafts) and `deposit:actions` (publish). **Sandbox** is a full separate environment at `https://sandbox.zenodo.org/api/` issuing throwaway `10.5072`-prefix DOIs — so, exactly like the OSF work, this can be proven end-to-end without minting a real DOI.

**Required metadata** (all under `metadata`): `upload_type: "dataset"`, `title`, `creators: [{name: "Family, Given", affiliation, orcid}]`, `description`, `access_right: "open"`, `license` (required when open), `publication_date`. We already hold every one of these — title + author (name/ORCID/affiliation, incl. the new ROR from item ⑩) + the study license (ADR-0100) + a description we compose. **No invented field.**

### Versioning is the actual reason to care

`POST /api/deposit/depositions/:id/actions/newversion` snapshots the current record into a fresh **draft** (inherits metadata + files, files become editable again), reachable via `links.latest_draft`; publishing it assigns a **new per-version DOI**, and all versions share a **concept DOI** (`conceptrecid` / `conceptdoi`) that always resolves to the latest. Only one unpublished new-version draft can exist at a time.

Contrast with what we shipped for OSF (ADR-0105 am.1, D7–D9): OSF has no native dataset-versioning primitive, so *"I collected more responses to reach the effect size"* forced us to model a re-deposit as a **brand-new child component with a brand-new, unrelated DOI**, dropping the single `osf_dataset_component_guid` for a `dataset_deposit` table because one column *"cannot hold a sequence."* Zenodo's concept/version DOI **is** that sequence, natively — the reader cites the concept DOI and always lands on the newest data, or cites a version DOI and gets exactly the snapshot the paper used. This is a real, not cosmetic, improvement for the re-deposit case the owner already flagged as important.

### Permanence is the same as OSF — so the privacy asymmetry is identical

The load-bearing question for ADR-0105 was reversibility, and Zenodo answers it the same way OSF does, verbatim from the policy:

- Retention: *"Items will be retained for the lifetime of the repository. This is currently the lifetime of the host laboratory CERN, which currently has an experimental programme defined for the next 20 years at least."*
- Withdrawal: a withdrawn object gets a tombstone page and *"the DOI and the URL of the original object are retained"* — withdrawal is exceptional, uploader-requested, and never un-mints the DOI.
- Files: *"original content is never modified"*, MD5-checksummed and periodically re-verified.

So a Zenodo deposit is exactly as irreversible as an OSF one: the researcher consents, the *participant* bears the permanence, and there is no un-publish. **ADR-0105's decision therefore transfers with no change of principle** — deposit only the dataset already published on the record (D1), and **hard-refuse** a deposit whose `dataTable` carries the `external_pid` label (D2). Both are archive-agnostic. This also satisfies ADR-0104 directly: Zenodo *is* a CERN-backed archive that can make the permanence promise "a young commercial SaaS" cannot, so **adopting its DOI (minting none ourselves) is the same stance we already took for OSF**, not a new position.

### What is genuinely new work

D3/D4 of ADR-0105 (deposit into an OSF *child component*; the shared OSF *mint path*) are OSF-specific and do **not** transfer — Zenodo replaces both with its own deposition + publish + newversion flow. Concretely, a Zenodo target needs: a new **OAuth app registration** on zenodo.org (owner action, like the OSF app); a `registry.zenodo.ts` **vendor adapter** behind the ADR-0007 boundary (SDK/HTTP isolated to `server/adapters/<concern>.<vendor>.ts`); encrypted per-workspace token storage (mirroring the OSF connection); a new **lock-in inventory** row; and either a new `dataset_deposit.target` discriminator or a parallel table to record which archive a deposit went to. That is a new vendor seam with its own auth, failure modes, and rate limits — the same weight as adding OSF was, which is why this is a "Next", not a same-day add-on.

## What this implies for the product

- **It is an upgrade, not a gap-fill.** LOS "findable/accessible" for datasets is *already met* by item ⑧ (a citable OSF component DOI). Zenodo's payoff is narrower and real: a clean **versioned** citation for studies that re-collect data, and a second archive for researchers whose field defaults to Zenodo rather than OSF. Frame it to the owner as "better re-deposit + choice of archive," not "the dataset story is broken without it."
- **Reuse the whole ADR-0105 spine.** The published-`dataTable`-only rule, the `external_pid` hard refusal (test against the real export path, never a fixture — the camelCase/snake_case trap that bit ADR-0105 D2 would bite here too), the "name permanence before the click" consent, and adopt-don't-mint all carry over unchanged. A Zenodo ADR would mostly be D3/D4 (the deposition + versioning mechanics) plus the vendor-seam decisions.
- **Model deposits as archive-tagged from the start.** Whatever we build, `dataset_deposit` should record the target (`osf` | `zenodo`) and the concept-vs-version DOI, so the record's "Data" resource can link the concept DOI and the changelog can show the version chain. This also keeps the door open to Dryad/DANDI later without another schema change.
- **Prove it on sandbox before any real DOI**, exactly as the OSF work did: run create → bucket upload → metadata → publish → newversion → publish against `sandbox.zenodo.org` (10.5072 DOIs), confirm the concept/version DOI shapes with our real composed metadata, delete the drafts, and only then decide. The never-invent rule applies to Zenodo's response shapes as much as it did to OSF's.

## What this insight does NOT tell us

- **Whether the owner wants a second archive at all.** This is a product call, not a technical blocker. If OSF is the only archive researchers here use, Zenodo is polish. Needs an explicit owner decision before an ADR.
- **The OAuth-app specifics** (redirect URIs, whether Zenodo supports the same encrypted-refresh-token dance as OSF, per-user vs per-workspace tokens) — not read yet; would be pinned during the gate, and the owner must register the app (as with OSF-5, still deferred).
- **Whether InvenioRDM's newer `/api/records` (RDM) API should be used instead of the legacy `/api/deposit/depositions`.** The deposit API is what developers.zenodo.org documents today and is backward-compatible, but if Zenodo deprecates it the adapter would need the RDM API. To confirm at build time against the live docs, not assumed now.
- **Cost/rate limits at our scale** — Zenodo is free and has generous limits, but the exact request quotas for automated deposits weren't read.

## Sources

Core (read live 2026-07-18):
- [Zenodo Developers — REST API](https://developers.zenodo.org/) — deposit flow, auth scopes, metadata fields, versioning endpoints, bucket API.
- [Zenodo Policies](https://about.zenodo.org/policies/) — retention (CERN lifetime), withdrawal/tombstone, file immutability + MD5.
- [Zenodo Help — Manage versions](https://help.zenodo.org/docs/deposit/manage-versions/) — versioning vs editing; new-version = new record + PID linked to the family.

Supporting:
- [Zenodo Help — Deposit](https://help.zenodo.org/docs/deposit/) — deposit concepts.
- Internal: ADR-0104 (DOI ownership — adopt, don't mint), ADR-0105 (dataset → OSF, the deposit spine + `external_pid` refusal), ADR-0103 (typed OSF resources), ADR-0007 (vendor-adapter boundary), [los-alignment-and-templates](los-alignment-and-templates.md).
