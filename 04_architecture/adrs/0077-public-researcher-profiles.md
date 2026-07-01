# ADR 0077 — Public researcher profiles (opt-in)

- **Status:** accepted
- **Date:** 2026-06-27
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, privacy, growth, discovery

## Context

The Explore + Engagement + Docs handoff stream EE2 adds **public researcher profiles**: an opt-in `/u/<handle>` page that collects a researcher's published studies + templates so peers can find and follow them, and which feeds the Explore "researcher showcase" band (EE1, ADR-0076 — currently a stubbed empty band). This is the discovery/credibility layer over the existing public Browse + V1.7 follow infra.

Constraints: the project's PII discipline (ADR-0014) and legal posture (ADR-0073) mean a researcher's identity/activity must NOT become public by accident — this has to be explicit opt-in, default off. The `user` table already holds V1.12 profile fields (`affiliation`, `orcid`, `research_areas`, `website_url`, `scholar_url`) used in-app; profiles surface those plus a public bio/avatar/handle. Follows already exist (V1.7), so the profile reuses them rather than inventing a new social primitive.

## Options considered

### Option A — Opt-in columns on `user` + a public `/u/<handle>` route, reusing Browse + follows (chosen)

- Add `handle` (unique), `public_profile_enabled` (default false), `public_bio`, `public_avatar_r2_key` to `user`. A public `publicProcedure` resolves the profile only when enabled; studies/templates reuse the existing public-discoverability rules; +Follow reuses V1.7.
- **Pros:** minimal schema (4 columns, one table); opt-in by construction; no new social system; the showcase band just turns on; handle is a clean public identifier decoupled from email.
- **Cons:** handle uniqueness + a reserved-word denylist to manage; profile data lives on `user` (fine — it's per-researcher).

### Option B — A separate `researcher_profile` table

- One-to-one table keyed by user.
- **Pros:** keeps `user` lean; clear separation of public vs internal identity.
- **Cons:** an extra join + table for four nullable columns; no real benefit at this scale; the V1.12 profile fields already live on `user`, so splitting public ones off fragments identity.

### Option C — Derive profiles purely from existing public studies (no opt-in, no handle)

- Auto-generate a page for anyone with public studies.
- **Pros:** zero new schema; everyone discoverable.
- **Cons:** violates opt-in/PII discipline (researchers didn't choose to be profiled); no stable handle/URL; no bio/avatar control. Rejected.

## Decision

**We will add opt-in public profiles as four columns on `user` (`handle` unique, `public_profile_enabled` default false, `public_bio`, `public_avatar_r2_key`) plus a public `/u/<handle>` route, reusing the existing public-study/template discoverability rules and the V1.7 follow infra.** A profile resolves publicly only when `public_profile_enabled = true`; a disabled or non-existent handle returns 404 (never "private", to avoid leaking existence). The handle is researcher-chosen, normalized to lowercase alphanumeric + hyphens, unique, and validated against a reserved-word denylist (`u`, `admin`, `settings`, `signup`, `signin`, `browse`, `explore`, `api`, …). The public avatar lives in the public R2 namespace (falls back to the Clerk avatar). New `users.publicProfile` (public), `users.updatePublicProfile` (protected), and `users.checkHandleAvailable` (public) procedures back the page + the Settings · Account section.

## Consequences

- **Easier:** the Explore showcase band turns on; researchers get a citable public identity; peers can follow from a profile; reuses Browse + follows (no new social primitive).
- **Harder:** handle lifecycle (uniqueness, denylist, reserved-after-disable); a public route that must 404 cleanly when disabled; a second public-avatar image path.
- **Committed to:** opt-in default-off (ADR-0014/0073 discipline); handle as the public identifier; profile fields on `user`; one master opt-in (not per-field) for V1.
- **Precluded (deferred):** per-field visibility toggles; workspace (org) public pages; profile analytics/insights; custom profile theming; vanity domains.

## Revisit triggers

- Researchers ask to hide specific fields → add per-field visibility toggles.
- Handle squatting/abuse appears → add moderation / handle-change cooldowns.
- Public org/lab pages are requested → a separate workspace-profile ADR.

## References

- `04_architecture/handoffs/code-tab-explore-engagement-docs.md` (EE2 source).
- [Public researcher profile — enable and view](../../02_product/user-flows/public-researcher-profile.md) (flow).
- [Public researcher profile page](../../03_design/wireframes/public-profile-page.md), [Settings · Public profile](../../03_design/wireframes/settings-public-profile.md) (wireframes).
- ADR-0076 (Explore — showcase band consumes these), ADR-0014 (PII boundary — opt-in), ADR-0073 (legal/consent posture), V1.7 follows infra, ADR-0018/0055 (public study discoverability rules reused).
