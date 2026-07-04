# ADR 0091 — Starter-template cover images as committed content assets

- **Status:** accepted
- **Date:** 2026-07-04
- **Deciders:** Paweł Rosner
- **Tags:** runtime, content, explore

## Context

The Explore "Featured starter templates" band (`explore-content.tsx`, Band 2) renders one card per app-shipped starter template (Misinformation study, A/B test, Pilot a new measure, Quick opinion survey). Each card's cover slot has always been a placeholder — a CSS gradient plus a single lucide icon — because no cover art existed.

We now have real cover art: light-ground "screenshot in a branded frame" images, one per starter, showing the actual participant screen (e.g. the Facebook-style misinformation post with its accuracy question). We need to render them.

The data layer already carries a `coverImageR2Key` (a `workspace_template` text column, selected by `explore.featuredTemplates` and threaded to the card as `t.coverImageR2Key`) that has never been populated or rendered — it is the mechanism for *user-uploaded* template covers, served through the `/api/media/<key>` R2 gateway. The question this ADR settles is where the *app-shipped starter* cover art should live, given that the rest of each starter (source study, frozen version, template row, stable ids) already lives in code and is seeded from it (ADR-0076 content-as-code for Vercel file-tracing reliability; ADR-0079 starter ids are a fixed code contract).

## Options considered

### Option A — Upload the PNGs to R2 and set `coverImageR2Key` on the starter rows (seed-time upload)

- A seed/CLI step PUTs each PNG to a `ws/`-prefixed R2 key and writes that key into `workspace_template.coverImageR2Key`; the card renders the existing field via `/api/media/<key>`.
- **Pros:** Uses the field already plumbed to the card; one general mechanism for every template cover; no per-id wiring.
- **Cons:** Introduces a new *seed-time binary upload to prod R2* side-effect (all prior uploads are runtime, user-driven); product art becomes a runtime blob decoupled from the code that ships it; covers are invisible in local dev and CI (no R2 configured), so the render can't be verified before deploy; a broken image renders if the key is set but R2 is unreachable.

### Option B — Commit the PNGs as static content assets, resolve by stable starter id

- The three PNGs are committed under `05_app/public/explore-covers/`; the card maps the stable starter `t.id` (`starter-misinfo-v1`, …) to `/explore-covers/<slug>.png`. `coverImageR2Key` is kept as the *next* fallback (for user-uploaded covers), gradient as the final fallback.
- **Pros:** Consistent with how the rest of the starter already ships (code + committed content, ADR-0076/0079); versioned and reviewable in git; works identically in local dev, CI, and prod; no prod R2 seed step; the same assets are reusable for the Mintlify docs; verifiable end-to-end before deploy.
- **Cons:** Per-id resolver map in the card (small, and the ids are already a fixed contract); two cover sources to reason about (committed starter art vs uploaded `coverImageR2Key`) — mitigated by an explicit precedence order.

## Decision

We will ship starter-template cover art as **committed static assets under `public/explore-covers/`, resolved by the starter's stable `workspace_template.id`**, with cover precedence: committed starter asset → `coverImageR2Key` (user-uploaded) → gradient placeholder.

App-shipped starter covers are product content, not user data. Everything else about a starter — its source study, its frozen version, its template row, its ids — already lives in code and is seeded from code precisely so it is reproducible and file-traced (ADR-0076/0079). The cover belongs in the same place. Reserving `coverImageR2Key` for genuinely user-uploaded covers keeps the R2 path for dynamic user data and keeps product art in the repo where it is versioned, reviewable, and renders everywhere without a prod-only seed step.

## Consequences

- **Easier:** Adding or restyling a starter cover is a committed-file change reviewed in a PR; it renders in local dev and CI, so the card is verifiable before deploy; the assets double as Mintlify illustration sources.
- **Harder:** The card now holds a small starter-id→asset map; adding a new starter means adding its cover to that map (co-located with the other starter-id contracts).
- **Committed to:** Starter cover art as committed content keyed by the ADR-0079 stable ids; `coverImageR2Key` remains the user-upload path only.
- **Precluded from:** Treating starter covers as mutable-at-runtime data (they change only via a deploy) — acceptable, since the starters themselves already change only via deploy.

## Revisit triggers

- Non-engineers need to change starter covers without a deploy (would motivate an admin upload surface writing `coverImageR2Key`).
- The number of app-shipped starters grows large enough that a hardcoded resolver map is unwieldy (move the mapping into the seed/registry).
- We add a user-facing "set template cover" surface — at which point the `coverImageR2Key` render branch (already present as the second fallback) carries real data.

## References

- `05_app/components/feature/explore/explore-content.tsx` — the featured card + cover resolver.
- `05_app/lib/system/starter.ts` — stable starter ids (ADR-0079) the resolver keys on.
- `05_app/public/explore-covers/{misinfo,ab,pilot}.png` — the committed cover assets.
- ADR-0076 (Explore content as a code module), ADR-0079 (app-owned system account + starter ids).
- `05_app/app/u/[handle]/page.tsx` — the `/api/media/<key>` `<img>` precedent for the `coverImageR2Key` fallback branch.
