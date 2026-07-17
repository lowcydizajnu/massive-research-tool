# ADR 0104 — DOI ownership — OSF mints, we do not

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Paweł Rosner
- **Tags:** integration, osf, strategy, lock-in

## Context

`01_research/insights/los-alignment-and-templates.md` parked this as explicitly unanswered and owner-owned: *"DOI ownership — should the record mint its own DataCite DOI, or always adopt the OSF registration DOI as canonical? (Affects Cite + lock-in; touches the DataCite adapter seam.)"*

ADR-0103 forced it. An OSF **resource** is a typed DOI, and each of the five badges needs a DOI **for that output**. OSF mints exactly one DOI — the registration's — which resources may not reuse. We mint none. So without answering this, item ⑦ delivers one badge (`papers`, from a DOI the researcher pasted) and item ⑧ has nowhere to put a dataset DOI.

The owner's framing, which reframed the question productively:

> *"we already store data, materials, entire research procedure so I think we need to build upon it but of course not forced researcher"*

That is the right instinct and it is what makes this decidable. We **hold** the artifacts. The question was never "should we collect links" — it is **how does what we already hold become citable**, and *who promises it stays that way*.

**A DOI is not a link. It is a promise of permanence** — that the identifier resolves forever, to a page describing the thing, even after the thing is gone. That promise is the whole product of a DOI. Everything below follows from asking who can honestly make it.

## Options considered

### Option A — OSF mints; we never become a registrant *(chosen)*

- We push what we hold (materials now; a dataset component under item ⑧) to the researcher's OSF project, then ask OSF to mint the DOI for it (`POST /v2/nodes/{id}/identifiers/`, `category: "doi"`). OSF registers through DataCite as **COS**, prefix `10.17605`.
- **Pros:** costs us nothing — COS carries the DataCite membership; the permanence promise is made by a non-profit built to keep it; the pipe already exists (ADR-0094); a child component can be minted independently, so item ⑧ works; **additive — minting our own later stays open**.
- **Cons:** the DOI is OSF's. Its DataCite record names OSF as publisher and it resolves to `osf.io/<guid>`, **not** to our record. Our name is not on the citation.

### Option B — We mint our own DataCite DOIs

- We become a DataCite member and mint DOIs resolving to `/browse/{id}`.
- **Pros:** the citation is ours and points at our record; full control of the landing page; the strongest identity story.
- **Cons:** **the permanence obligation outlives the company.** A DOI must resolve after we delete a study, after we change a route, after we shut down. Archives can promise that because they are structurally built and funded to (COS is a non-profit; Zenodo is CERN). A young commercial SaaS promising the same is claiming more than it can back. Also a real recurring cost (see below), a new vendor seam, and a new lock-in row.

### Option C — Both (mint ours *and* adopt OSF's)

- **Pros:** identity plus permanence.
- **Cons:** two identifiers for one thing is the problem DOIs exist to solve. It also incurs Option B's obligation without escaping it.

## Decision

**We will not mint DOIs. OSF is the registrant; we ask it to mint identifiers for the artifacts we push, and the permanence promise stays with an institution built to keep it.**

The cost is not what decided this. Verified from DataCite's own pages (2026-07-16): a commercial entity **is** eligible to be a member; a Direct Member pays **€2,000/yr**, plus a for-profit open-infrastructure fee scaled by revenue — **€1,000** at the €0–500,000 tier — so roughly **€3,000/yr** at current scale, with no per-DOI fee below 100,000 DOIs/year. That is affordable. *(The addition of the two components is our arithmetic on two separately verified figures; DataCite requires a consultation to fix the pathway, so treat it as the shape of the cost, not a quote.)*

**What decided it is the promise, not the price.** We would be undertaking that every DOI we mint resolves forever — through study deletion, route changes, and our own insolvency. We cannot honestly make that undertaking today, and this project's standard is that we do not claim what we cannot evidence (ADR-0102: no binding, no "Preregistered"; ADR-0103: no DOI, no resource). A DOI we cannot guarantee is the same category of false claim, aimed at the scholarly record.

**The argument that settles it: you can add Option B later; you can never un-mint a DOI.** Option A forecloses nothing — a minted OSF DOI does not prevent us minting our own for the same artifact later, or migrating if we ever become an archive. Minting our own now and failing the promise is not recoverable, and the failure lands on researchers who cited us.

### D1 — OSF is the registrant; we are the workbench

We hold and build; OSF keeps. That division is honest about what each party can promise and is the reason Option A is not a retreat: it makes the artifact permanently citable *today*, for free, through a pipe we already own.

**Rejected:** becoming a DOI registrant to put our name on the citation. Identity is not worth a promise we cannot keep.

### D2 — The accepted cost: our name is not on the citation

An OSF-minted DOI names OSF as publisher and resolves to `osf.io/<guid>`. A reader who follows it lands on OSF, not on us. **We accept this**, and it is the honest price of not carrying the obligation. It is also not permanent: a future ADR may add our own DOIs alongside.

### D3 — What we mint, and when — never silently

Minting requires the OSF node to be **public** and the caller to be **admin**. Making a researcher's own OSF project public is a consequential, outward-facing act on *their* account, and a minted DOI **cannot be removed** (there is no DELETE route). So it is always an explicit, consented action stating both consequences before the click — never a side-effect of uploading, never a default.

**Rejected:** minting as part of the existing Materials upload. That would make a project public and mint a permanent identifier as a side-effect of a file copy.

### D4 — External DOIs remain an optional field, per the owner's steer

> *"for sure for public record we can have custom fields for external doi if someone want to add them"*

A researcher who already deposited on Zenodo/Dryad/DANDI pastes that DOI and we register it. This is the escape hatch, not the main path, and it is never required. **Nothing here is forced on the researcher** — every path is an offer.

### D5 — The one-click deposit is the actual product

The value is not the link. It is that we already hold the artifact, so the researcher's alternative — export, go to a repository, make an account, upload, fill metadata, mint, copy the DOI, return, paste — collapses into one consented click. **The test every LOS item must pass: does this do something the researcher could not do on osf.io in three clicks?** Pasting a DOI fails that test. Depositing what we already hold and getting it minted passes it.

## Consequences

- **What becomes easier:** materials become permanently citable today; item ⑧ gets a home (a child component can be minted independently — verified); item ⑦ gets a second automatic badge.
- **What becomes harder:** nothing technically. Strategically, we accept that OSF's name is on the identifier.
- **What we are now committed to:** OSF as the permanence authority; consent before any mint; never claiming an identifier we cannot evidence.
- **What we are now precluded from:** minting DOIs, and therefore from being cited as the publisher of record — until this ADR is revisited.
- **Accepted cost:** ~€3,000/yr *not* spent, and a citation that says OSF.

## Revisit triggers

- We acquire an archive story we can honestly stand behind — a preservation commitment, an escrow or successor arrangement, or a partnership — such that the permanence promise stops being a bluff.
- A funder, journal or institution requires a DOI resolving to **our** record rather than to OSF.
- OSF changes its terms, its agency, or its willingness to mint for third-party-pushed content.
- Researchers tell us the OSF-branded citation is a problem in practice. (Evidence, not speculation.)
- Revenue makes ~€3,000/yr trivial **and** the trigger above has fired. Cost alone is never sufficient — the promise is the gate.

## Amendment 1 — 2026-07-16 — the mint path, executed for real

The References below flagged the mint path as *"not independently re-verified — the checking pass was cut short."* It has now been run end to end against `api.osf.io`, through the adapter itself rather than a hand-rolled fetch, with the project owner's explicit consent to create one permanent DOI.

**Result:** component `7rj2c` under parent `m4hpw`, `category: "data"`, `public: true`, DOI **`10.17605/OSF.IO/7RJ2C`**. `https://doi.org/10.17605/OSF.IO/7RJ2C` → `302` → `https://osf.io/7rj2c/`. The component is left in place deliberately: deleting it would leave the DOI resolving to nothing, which is worse than a stray component.

Confirmed:

- **A child component is minted independently of its parent** — the claim D3 and ADR-0105 rest on. The parent `m4hpw` remains private and un-minted.
- **`POST /v2/nodes/{id}/children/`** → `201`, `category: "data"` accepted, parent relationship set. `DELETE /v2/nodes/{child}/` → `204` (used on the throwaways).
- **The mint is idempotent.** A second `mintNodeDoi` returned the same DOI and did not re-POST — "it already exists" is the state we wanted, not an error.
- **`osf.full_write` carries `IDENTIFIERS_WRITE`** (FULL_WRITE → NODE_ALL_WRITE → NODE_METADATA_WRITE). The token was never the obstacle.

**Corrected — the mint requires the node to be PUBLIC, and nothing in our code made it so.** `IdentifierList` carries `EditIfPublic`, whose `has_object_permission` returns `obj.is_public` outright for any non-safe method. We create every project private, so `makeOutputCitable` was refused `403 "You do not have permission to perform this action."` — an error naming neither public-ness nor the fix, and one that no test could see because `mintNodeDoi` is mocked. **Make citable could never have succeeded for anyone**, while its consent dialog promised *"This makes your OSF project public"* — a promise with no code behind it. `mintNodeDoi` now publishes first, which is what D3's consent always said it would do.

**Still unverified:** whether a public node can be made private again. The one attempt returned `400 "This project's node storage usage could not be calculated"` on a brand-new empty component — a transient quirk, not a refusal, so nothing is claimed either way. It does not matter for D3: the DOI's permanence is the load-bearing promise, and that is verified (no DELETE route).

## References

- Verified 2026-07-16 by independent re-fetch: [DataCite fees](https://datacite.org/fees/) — Direct Member €2,000/yr; for-profit open-infrastructure fee scaled by revenue (€0–500k → €1,000); no per-DOI fee below 100,000/yr. [DataCite membership](https://datacite.org/become-a-member/) and [Statutes §4(1) (26 April 2022)](https://datacite.org/wp-content/uploads/2023/06/Statutes_26April2022.pdf) — *"Membership is open to all legal entities that support the mission and objectives of the Association"*; a commercial entity is eligible.
- OSF mint path — **executed live 2026-07-16, see Amendment 1**: `POST /v2/nodes/{node_id}/identifiers/` with `category: "doi"`; `IdentifierList` is a `ListCreateAPIView` with `IsPublic` / `EditIfPublic` / `AdminOrPublic` permissions and `CoreScopes.IDENTIFIERS_WRITE`; no DELETE route; a child component is minted independently of its parent (confirmed: `7rj2c` under a still-private `m4hpw`); OSF's registrant is COS, prefix `10.17605`. The earlier note that a private-again node "downgrades findable→registered and still resolves" remains **unverified** — see Amendment 1.
- [ADR-0103 — typed OSF resources](0103-typed-osf-resources.md) — forced this decision; **amended by this ADR** (its D1 rejection of a minted `materials` DOI no longer holds).
- [ADR-0094 — OSF materials upload](0094-osf-materials-upload.md) — the pipe this builds on.
- [ADR-0007 — Path A vs B (the vendor adapter seam)](0007-path-a-vs-b.md); [ADR-0102](0102-plan-report-link-back.md) — the "claim only what you can evidence" precedent.
- [LOS alignment insight](../../01_research/insights/los-alignment-and-templates.md) — parked this question; now answered.
