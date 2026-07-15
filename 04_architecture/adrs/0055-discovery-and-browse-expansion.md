# ADR 0055 — Discovery: search, filters, and Record landing

- **Status:** proposed
- **Date:** 2026-06-18
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** runtime, search, product-surface

## Context

Browse today (ADR-0018 surface) is **faceted-only**: filter by tags (intersection) + author-name substring, sort by recent/most-replicated, cursor paginate. It lists *any* public study with a frozen version and renders raw protocol blocks on the Details page. The gaps (from [finished-studies-and-comparable-discovery](../../01_research/insights/finished-studies-and-comparable-discovery.md) and the team review): no full-text search; no filtering on the dimensions researchers actually screen by; and the landing page is the wrong artifact.

The owner asked specifically for additional filters: **replication-allowed vs not, participant country, language, and preregistered-or-not** — and for discovery to land on something structured (which ADR-0054's Study Record provides). These data points already exist: replication-allowed = `experiment.forkable_by`, preregistered = a version of kind `preregistered`, and country/language live in the recruitment eligibility metadata (the Prolific `eligibility` we store per session). So the filters are mostly a query + index problem, not new data capture.

This ADR decides the discovery model: which filters, what "search" means, and what Browse lands on.

## Options considered

### Option A — Keep faceted-only; just relabel
- **Pros:** trivial. **Cons:** leaves every gap; no text search; can't screen by the dimensions that matter; still lands on raw blocks.

### Option B — Add the requested facets + land on the Record; defer text search
- Add filters (replication-allowed, preregistered, country, language) to the existing keyset query; Browse Details → the Study Record (ADR-0054). Keep "search" as author/tag only for now.
- **Pros:** ships the high-value screening filters + the better landing fast; no new infra. **Cons:** still no title/abstract search — the single biggest discovery gap stays open.

### Option C — Facets + Record landing + full-text search behind a swappable seam (chosen, phased)
- Everything in B, **plus** full-text search over title + abstract + method summary using **Postgres FTS** (a generated `tsvector` + GIN index on the discoverable studies), exposed through a thin `SearchAdapter` seam so it can later move to a dedicated search service without touching call sites (consistent with the project's adapter/lock-in discipline).
- **Pros:** closes the headline gap; no new vendor now (Postgres we already run); the seam keeps us from lock-in if we outgrow FTS. **Cons:** an index + a generated column (migration); ranking quality is "good enough," not Elastic-grade.

## Decision

**We will expand discovery in phases: (1) the requested facets + land Browse on the Study Record; (2) Postgres full-text search over title/abstract/method behind a `SearchAdapter` seam. Frameworks filtering follows once provenance is captured.**

Filters (all AND-combined, each optional):
- **Tags** (existing, intersection), **author** (existing substring; add autocomplete later).
- **Replication-allowed** — `forkable_by = 'public'` (today every Browse item already qualifies; the filter becomes meaningful once we also surface `link-only`/preview states, and on the workspace-internal Studies list).
- **Preregistered** — has a version of kind `preregistered` (vs published-only).
- **Finished** — has `finished_at` (ADR-0054); lets readers screen for completed work with results.
- **Participant country / language** — derived from the study's recruitment `eligibility` (country/language ChoiceIDs we already store). Stored denormalized on a discoverable-study projection for filterability (avoid scanning session metadata per query).
- **Sort** — recent | most-replicated (existing); add "recently finished."

Search: a `SearchAdapter.searchStudies({ query, filters, cursor })` whose default impl runs Postgres FTS over a `search_document` (title + abstract + method summary, weighted) on discoverable studies, returning ranked ids the existing projection hydrates. The seam means the query shape — not the engine — is the contract.

Landing: Browse cards link to the **Study Record** (ADR-0054), not the Builder; non-finished public studies (if still listed) show the protocol-preview as today with a "preliminary — not yet finished" note.

PII: country/language are *study eligibility settings*, not participant data — safe to index. No participant records enter the search document (ADR-0014).

## Consequences

- **Easier:** researchers screen by the dimensions they actually care about and *find by words*; discovery lands on a comparable artifact.
- **Harder:** a denormalized discoverable-study projection to keep fresh (on finish / publish / setForkable / eligibility change); an FTS generated column + GIN index (migration); ranking tuning over time.
- **Committed to:** AND-combined optional facets; search behind a `SearchAdapter` seam (swappable); country/language as indexable study settings; Record as the landing target.
- **Precluded:** blending FX/PII into discovery; coupling call sites to a specific search engine; framework filtering until provenance exists (separate, additive — a `framework_key` on `experiment` captured at create-from-framework time).

## Revisit triggers

- Catalogue grows past comfortable Postgres-FTS ranking quality / latency → implement the `SearchAdapter` against a dedicated search service (the seam already exists).
- Demand for saved searches / "follow a search" → add a saved-query entity + reuse the follows feed.
- Framework provenance lands → add the framework facet + chip (the deferred Browse gap).
- `link-only` discovery is wanted for workspace members → extend the visibility gate.

## References

- Insight: [finished-studies-and-comparable-discovery](../../01_research/insights/finished-studies-and-comparable-discovery.md).
- Wireframe: [browse-public-studies](../../03_design/wireframes/browse-public-studies.md) (updated for the new filters + Record landing).
- Pairs with [ADR-0054](0054-finished-state-and-study-record.md) (the Record this lands on).
- ADRs: 0018 (Browse + forking visibility), 0017 (tags), 0014 (PII), 0047 (adapter discipline the SearchAdapter mirrors).

## Amendment 1 (2026-07-09) — Public + crawlable records/profiles (GitHub-model)

Prompted by the OSF "Lifecycle Open Science" alignment review (insight [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md), Now #1). The audit found the LOS "findable" promise is defeated today: `/browse` is auth-gated in `middleware.ts`, so a `visibility:'public'` Study Record is reachable only by **logged-in users of other workspaces** — not anonymous readers and not search-engine crawlers — and the app emits **zero** machine-readable metadata. The Cite/Share URL therefore doesn't resolve for the outside world.

**Decision (owner, GitHub-model):** the Study Record (and the already-public `/u` profile) is **fully publicly browsable** — an anonymous visitor sees the whole record *including* the action buttons (Follow / Save / Replicate / Use-as-template); **clicking an action redirects to `/signin?redirect_url=<current>`** rather than firing a protected mutation. Logged-in users behave as today. Only studies the owner already opted into public sharing (`forkable_by = 'public'`, ADR-0018) are exposed, and public data stays aggregate-only (ADR-0014).

**Mechanics:**
- The record page leaves the authed `(app)` shell (whose layout redirects anon to `/signup`) and renders as a **standalone public page**, mirroring the shipped `/u/[handle]` precedent (top-level, `force-dynamic`, nullable `getCurrentDbUser`; client tRPC islands mount a local `TRPCReactProvider`, as `ProfileFollow` already does).
- The four action controls become **auth-aware**: for an anonymous viewer they render the same button as a `/signin` link (a small shared sign-in gate) so nothing protected runs on mount.
- `middleware.ts` stops protecting the record detail route; the in-app **listing** remains the authed discovery surface (records are crawlable via the sitemap regardless).
- **Machine-readable metadata:** JSON-LD (`schema.org` `Dataset`/`CreativeWork` for records — name, description, author `Person` + ORCID, `datePublished`, `keywords`, `identifier` = registration DOI, `license`; `Person` for profiles), `generateMetadata` OpenGraph, plus `app/sitemap.ts` (public records + opted-in profiles) and `app/robots.ts` (allow `/browse` + `/u`, disallow app-internal).

**Consequences:** records become genuinely findable + citable on the open web (the LOS payoff) and the previously-hidden registration DOI / ORCID / license now reach crawlers; the cost is a public render path that must never call a protected procedure anonymously (guarded by the sign-in gate + the page only rendering authed islands for authed viewers). **Revisit trigger:** if the in-app listing should also be public/crawlable (fuller GitHub parity), extend the same standalone-public treatment to the listing. Final route location + the exact middleware matcher are set by the grounding scout for this change.
