# ADR 0051 — Participant panels (cohorts by opaque PID)

- **Status:** accepted
- **Date:** 2026-06-17
- **Deciders:** project owner, Claude
- **Tags:** data-model, recruitment, privacy

## Context

V1.15 Stream P3 ("Panels", part of the Participants destination) lets a researcher curate **panels** — named cohorts of past participants — to **re-recruit** them (longitudinal follow-ups, high-quality returners) or **exclude** them from a new study (avoid cross-contamination across related studies). This is a standard recruitment need Prolific researchers currently meet by hand-copying participant ids between studies.

The hard constraint is the PII boundary (ADR-0014, amended for the Participants destination): participant data is provider-blind. The only participant identifier we store is the opaque `external_pid` (e.g. a Prolific PID) on `provider_submission` — never names, emails, or IPs. A panels feature must build entirely on `external_pid` and must not become a CRM or a re-identification surface.

We already have the substrate: `provider_submission` rows (per ADR-0047 / Stream P2) carry `(experiment_id, external_pid, status)`, reconciled from the provider. Panels are essentially saved selections over those PIDs.

## Options considered

### Option A — Smart filters (dynamic membership)

- A panel is a saved query ("everyone who passed attention checks in study X"); membership is recomputed on read.
- **Pros:** always current; no membership table.
- **Cons:** needs attention-check/quality data we don't model yet (Stream P5); query semantics balloon; "who's in this panel" becomes non-deterministic over time, which is wrong for an *exclusion* list used for scientific integrity.

### Option B — Static snapshot membership (chosen)

- A panel is a named, workspace-scoped row (`panel`); membership is an explicit set of `external_pid`s (`panel_member`), added in bulk from a completed study's submissions (filtered by status) or removed individually. Idempotent on `(panel_id, external_pid)`.
- **Pros:** deterministic ("this is exactly who's excluded/included"); builds only on data we already have (`provider_submission.external_pid`); PII boundary trivially preserved; simple, testable CRUD.
- **Cons:** snapshots can go stale (a study still recruiting adds PIDs after the snapshot) — mitigated by re-running "add from study"; provenance is first-source only (see below).

### Option C — Lean entirely on the provider's own groups

- Don't store membership; create/maintain the cohort directly as a Prolific "participant group" / allowlist.
- **Pros:** no local membership table; provider enforces it at recruitment.
- **Cons:** provider lock-in (panels wouldn't survive a provider swap, against ADR-0047's plurality goal); cross-provider panels impossible; we couldn't show membership without a provider round-trip; ties a core feature to one vendor's API shape.

## Decision

**We will model panels as static, workspace-scoped membership over opaque PIDs (Option B).** Two tables:

- `panel` — `(id, workspace_id, name, description?, created_by_user_id, timestamps)`, workspace-scoped (the tenant boundary every other resource uses).
- `panel_member` — `(id, panel_id, external_pid, source_experiment_id?, added_at)`, **unique `(panel_id, external_pid)`** so adds are idempotent. Stores ONLY `external_pid` + provenance — never PII (ADR-0014 holds).

Membership is built by selecting a study's `provider_submission` PIDs by status (e.g. approved-only) and bulk-upserting them; individual removal is supported. tRPC CRUD is workspace-scoped; mutations are `writeProcedure` (viewers read-only). The adapter is unchanged for now.

**Provider-side application — resolved 2026-06-17.** The V1.15 handoff assumed Prolific's deprecated `eligibility_requirements`; verifying against Prolific's docs, include/exclude is expressed in the same `filters` array we already use, via **`custom_allowlist`** (only these participant ids are eligible) and **`custom_blocklist`** (these are excluded), each taking the raw participant ids directly in `selected_values` — no participant-group object, no extra table. So `createStudy`'s `eligibility` gained `includePids` / `excludePids`; `recruitment.createProviderStudy` resolves an optional include/exclude **panel id** → that panel's `external_pid`s (workspace-scoped) → those filters; the Run-stage card offers "Recruit only from panel" / "Exclude panel" pickers. (`custom_allowlist` is verified verbatim from the longitudinal cookbook; `custom_blocklist` is its documented counterpart — a wrong id would surface as a Prolific 400, which `call()` already throws with the body. Full end-to-end needs publishing a real study = credits, so it's exercised on first real use.)

## Consequences

- **Easier:** deterministic exclusion/inclusion sets; reuses `provider_submission`; PII boundary preserved by construction; provider-agnostic (a panel is ours, not Prolific's).
- **Harder:** snapshots need a manual refresh to capture late submissions; we keep first-source provenance only (not a full per-PID study history) for V1.
- **Committed to:** `external_pid` as the sole participant key; panels scoped to a workspace (cross-workspace sharing would need explicit per-participant consent infrastructure — out of scope).
- **Precluded:** storing any participant PII in panels; treating panels as a dynamic query in V1.

## Revisit triggers

- Stream P5 (Quality) lands attention-check / completion-time data → consider smart-filter panels (Option A) layered on top of static ones.
- A second recruitment provider is adapted → confirm panels remain provider-agnostic and decide how a PID from provider A maps (it doesn't — panels become provider-scoped or PID-namespaced).
- Researchers ask to share panels across workspaces → design the consent + tenancy model first.

## References

- ADR-0047 (RecruitmentAdapter), ADR-0014 (participant PII boundary), ADR-0050 (recruitment reconciliation — source of `provider_submission`).
- Wireframe: `03_design/wireframes/participants-panels.md`.
- Handoff: `04_architecture/handoffs/code-tab-v1150-participants.md` §P4.
- Code (on build): `05_app/server/db/schema.ts` (`panel`, `panel_member`), `05_app/server/trpc/routers/panels.ts`, `05_app/app/(app)/(workspace)/participants/panels/`.
