# ADR 0047 — RecruitmentAdapter pattern (Prolific)

- **Status:** accepted
- **Date:** 2026-06-16
- **Deciders:** Project owner, Code tab
- **Tags:** recruitment, adapters, vendor-isolation, pii, integration

> **Numbering note:** the V1.15 handoff drafted this as "ADR-0037"; that number was taken by ADR-0039 (replication) era work before this landed, so the recruitment ADRs are renumbered **0047** (this), **0048** (compensation), **0049** (quality). Content unchanged from the handoff intent.

## Context

V1.5 shipped the participant runtime (`/take/*`), the `recruitment_session` table, and a **manual** recruitment workflow: the researcher copies the `/take` URL and pastes it into Prolific by hand, then manages submissions/approvals/payments entirely in the Prolific dashboard. V1.15 closes that loop with real provider integrations and a Participants destination.

We already have the precedent for vendor-isolated integrations: **ADR-0005** (OSF `RegistryAdapter`) — a single typed interface, one file per vendor, AES-256-GCM token encryption via `TOKEN_ENCRYPTION_KEY`, and a PAT-paste fallback when OAuth is unavailable. **ADR-0007** mandates vendor SDK imports live only in `server/adapters/<concern>.<vendor>.ts`. **ADR-0014** sets the participant-PII boundary: `external_pid` is the only identifier we store; never names/emails/IPs.

Recruitment providers (Prolific first, CloudResearch/others later) need: connect/disconnect, create/publish/pause/close a study on the provider side, list submissions, approve/reject, send bonuses, and verify webhook signatures. We need one interface so a second provider drops in without touching call sites — and so the PII boundary is enforced at the adapter contract, not hoped for at each call site.

## Options considered

### Option A — Generalize a `RecruitmentAdapter` interface mirroring `RegistryAdapter`

- One typed interface; per-vendor file (`recruitment.prolific.ts`) is the only importer of that vendor's API; the adapter's return types structurally exclude PII.
- **Pros:** consistent with the OSF precedent the team already knows; vendor lock-in contained to one file (ADR-0007); PII boundary encoded in the type (`ProviderSubmission` has no name/email/IP field); a second provider is a new file, not a refactor.
- **Cons:** the interface must be general enough to fit providers we haven't built yet — some risk of a leaky abstraction (e.g. Prolific "submissions" vs another provider's "assignments").

### Option B — Prolific-specific service module, no interface

- Write Prolific calls directly where needed; generalize later if a second provider appears.
- **Pros:** less upfront abstraction; fastest to Prolific-only.
- **Cons:** breaks the established adapter pattern; vendor types leak into call sites; the PII boundary becomes a per-call-site discipline instead of a contract; a second provider means a real refactor. Rejected.

## Decision

**We will introduce a `RecruitmentAdapter` interface in `server/adapters/recruitment.ts`, with the Prolific implementation isolated to `server/adapters/recruitment.prolific.ts`** — mirroring the OSF `RegistryAdapter` (ADR-0005) and obeying the vendor-isolation rule (ADR-0007).

The interface covers connection management (PAT-first, optional OAuth), provider-side study lifecycle (create/publish/pause/close), submissions (list/approve/reject/bonus), and webhook signature verification. Its return types **structurally exclude participant PII**: `ProviderSubmission` carries `submissionId`, `externalPid`, `status`, and timestamps — and no field for names, emails, IPs, or user agents. The adapter contract therefore *is* the PII boundary (ADR-0014): even if a provider API returns a participant's name, the adapter never surfaces it, so no call site can persist it. Tokens are stored encrypted in a new `recruitment_provider_connection` table (per-researcher-per-workspace; the semantics differ from OSF's per-researcher-global `registry_connection`, so we mirror rather than overload it). Token rotation/refresh mirrors OSF's policy.

## Consequences

- **Easier:** adding CloudResearch/others (a new file implementing the same interface); reasoning about where PII could leak (only the adapter file touches provider responses, and its types forbid PII); testing (mock the interface, or MSW-mock the Prolific HTTP layer).
- **Harder:** the interface must accommodate provider concepts that don't map 1:1; some providers may need optional methods or per-vendor metadata in `jsonb` columns.
- **Committed to:** PAT-first auth; `external_pid` as the sole participant identifier end-to-end; webhook signature verification before trusting any provider push; one adapter file per vendor.
- **Precluded from:** storing provider-side PII in Postgres; calling a vendor SDK outside its adapter file; surfacing per-person identity in the Participants destination even when the provider API would return it.

## Revisit triggers

- A provider we want to support can't fit the interface without surfacing PII (forces an ADR-0014 reconsideration, not a quiet workaround).
- Prolific ships a first-class OAuth flow that should become the default over PAT.
- We need participant-side surfaces (Prolific currently owns the participant experience; out of scope here).
- A second concern wants the same per-workspace-per-researcher token table → consider generalizing the connection storage.

## References

- [ADR-0005 — OSF integration (RegistryAdapter precedent)](0005-osf-integration.md)
- [ADR-0007 — Path A vs B (vendor lock-in lens)](0007-path-a-vs-b.md)
- [ADR-0014 — Response data model + conditioning (PII boundary)](0014-response-data-model-and-conditioning.md)
- `05_app/server/adapters/registry.osf.ts` — implementation precedent
- `04_architecture/lock-in-inventory.md` — gets a Prolific row at Stream P1 build time
- V1.15 Participants handoff (Code tab, 2026-06-15 round 2)
