# ADR 0076 — Explore destination — authed + public discovery surface

- **Status:** accepted
- **Date:** 2026-06-27
- **Deciders:** project owner, Claude
- **Tags:** runtime, routing, growth, discovery

## Context

The Explore + Engagement + Docs handoff (`04_architecture/handoffs/code-tab-explore-engagement-docs.md`, owner brainstorm-locked) opens with **EE1 — an Explore destination**: one place that shows researchers (and prospects) what the tool does, via curated use-case scenarios + dynamic featured starter templates + a wall of community studies + an opt-in researcher showcase, with a one-click path from a scenario to a forked study. It serves the [Explore — discovery and activation](../../02_product/user-flows/explore-discovery.md) flow and the three Explore wireframes.

Two prior decisions constrain the build: V1.8 Browse already provides `studies.browsePublic` + `studies.fork` (ADR-0018), so Explore is a **curated layer on top of Browse, not a new data model**; and the IA route-group split (ADR-0032) gives us `(workspace)` (app chrome) vs other shells. The new wrinkle is that Explore must be reachable **both** signed-in (LeftRail entry, app chrome) **and** anonymously (`myresearchlab.app/explore`, marketing chrome) for SEO + prospect conversion — the same content island in two shells. The decision is how to structure those routes, where curated scenario content lives, and how the anonymous "Use this template" path survives sign-up.

## Options considered

### Option A — Dual route + shared content island; scenarios as in-repo Markdown; fork-intent carried through sign-up (chosen)

- An authed route under `(app)/(workspace)/explore` and a public route under a `(public)` group, both rendering one shared `<ExploreContent isPublic?>` island. Scenarios are Markdown files in `05_app/content/explore/scenarios/*.md` (front-matter + body), curated by the owner via commits — no in-app CMS. Anonymous CTAs stash the target template id and replay the fork after sign-up.
- **Pros:** one content implementation, two shells; SEO-able public surface; curated content is versioned, reviewable, and free; reuses Browse/fork (no migration); matches the handoff's owner-locked defaults.
- **Cons:** two route entries to keep in sync; a `(public)` shell needs its own header; "carry intent through sign-up" is extra plumbing.

### Option B — Single authed route only; public discovery deferred

- Ship Explore only inside the app; prospects see nothing until they sign up.
- **Pros:** simplest; no public shell, no SEO concerns, no cross-auth fork plumbing.
- **Cons:** abandons the prospect-conversion goal that is half the point of Explore (the handoff explicitly wants the public route); a marketing surface would have to be rebuilt later anyway.

### Option C — Database-backed scenario CMS (admin CRUD UI)

- Store scenarios in a table with an admin editor.
- **Pros:** non-technical editing; live updates without deploys.
- **Cons:** over-built for an indie-solo owner who is the only curator; new table + admin UI + image handling for a handful of cards; the handoff explicitly scopes this OUT ("curation surface owned by you, not a researcher CMS").

## Decision

**We will build Explore as a dual-route surface (authed `(app)/(workspace)/explore` + public `(public)/explore`) over a single shared content island, with use-case scenarios authored as in-repo Markdown and a fork-intent that is carried through sign-up.** Explore is a curated/featured layer on top of the existing Browse + fork infrastructure (ADR-0018) — no new data model. The dynamic bands come from three public `explore.*` tRPC queries (featured templates, community studies, opt-in profiles); the curated scenarios band is read from Markdown at build/request time. The anonymous "Use this template" / "Replicate" path stores the target id and, after the new researcher finishes onboarding, forks it into their fresh workspace. This gives one implementation serving both a logged-in discovery hub and a public, SEO-able, conversion-oriented landing, while keeping curation as cheap, versioned, owner-controlled files.

## Consequences

- **Easier:** a single place that answers "what can I do here?"; prospects get a real landing page that converts into the activation funnel; curation is a git commit; analytics already captures `study_forked`/`template_used` so Explore's impact is measurable (ADR-0074).
- **Harder:** two route shells to maintain; the content island must be careful never to render workspace-scoped data on the public route (an `isPublic` flag gates affordances); the fork-intent-through-sign-up handoff needs its own small mechanism + test.
- **Committed to:** Markdown-as-scenario-source (no CMS) for V1; reusing `studies.fork` for every "use this" affordance; public `explore.*` procedures returning only public/opt-in data (no PII, ADR-0014).
- **Precluded (deferred):** an admin scenario editor; per-visitor personalization of Explore; paid promotion/ranking of templates; Explore-specific analytics dashboards beyond the existing taxonomy.

## Amendment 1 (2026-06-27) — public route deferred; Explore ships authed-only

**Context.** The original decision locked a **dual route** — an authed
`(app)/(workspace)/explore` and a public `(public)/explore`, both at `/explore`.
On build this is a Next.js conflict: two pages cannot resolve to the same path,
and the authed route lives inside the `(app)` shell whose layout redirects
anonymous visitors to `/signup` (no active workspace). Serving `/explore` to both
audiences would require either one auth-branching route moved out of `(app)` (a
moderate refactor + conditional chrome) or a second public URL.

**Decision (owner, 2026-06-27).** **Defer the public route.** `/explore` ships as
the authed researcher destination only (EE1.1–EE1.3a, live). The public / SEO
landing is deferred to a future marketing-site effort. The `fork-intent-through-
sign-up` flow (only meaningful from the public route) is deferred with it; the
`<ExploreContent isPublic>` flag and the public-aware CTAs remain in place so the
public variant can be added later with no rework of the content island.

**Consequences.** EE1 is complete as an in-app destination. No prospect-facing
`/explore` for now (the handoff's open-question #1 had already hedged on this).
Revisit when a marketing site is built (see the new revisit trigger).

## Revisit triggers

- The owner can no longer keep scenarios current via commits (would justify a CMS, Option C).
- A marketing site (`/`, pricing) ships and absorbs the public `/explore` role.
- Public-route SEO needs full server-render of dynamic bands (revisit the hydrate-vs-prerender choice for the community/template bands).
- Explore conversion underperforms and needs personalization/ranking beyond curation.
- A marketing site is built → revisit Amendment 1 and add the public `/explore` landing (auth-branching route or a dedicated public URL).

## References

- `04_architecture/handoffs/code-tab-explore-engagement-docs.md` (EE1 source).
- [Explore — discovery and activation](../../02_product/user-flows/explore-discovery.md) (flow).
- [Explore destination](../../03_design/wireframes/explore-destination.md), [Explore use-case card](../../03_design/wireframes/explore-use-case-card.md), [Explore public-route header](../../03_design/wireframes/explore-public-route-header.md) (wireframes).
- ADR-0018 (cross-workspace forking — reused), ADR-0032 (IA route-group split), ADR-0074 (analytics taxonomy — `template_used`/`study_forked`), ADR-0014 (PII boundary — public queries stay PII-free).
