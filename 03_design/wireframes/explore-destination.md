# Wireframe spec — Explore destination

- **Serves user flow:** [Explore — discovery and activation](../../02_product/user-flows/explore-discovery.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — new top-level destination in the workspace LeftRail; also a public route.
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

> **Amendment 2026-07-04 (owner):** The **Use-case scenarios band** ("Start with a use case") was **removed** — it duplicated the Featured starter templates once those carried real covers. Featured starter templates is now the lead band. Its two unique hooks were preserved: (a) the **guided tutorial** now launches from the Featured card's "Use template" for tour-enabled starters (misinfo / A/B / pilot) via `?tour=`, and (b) a persistent **"Browse published studies →"** link now lives in the header band (previously only the curated "replicate-published" scenario + the community band's conditional "Browse all" pointed at `/browse`). The `content/explore/scenarios.ts` module + `ExploreScenarioCard` were deleted (dead code). Featured tiles widened to a 2-up grid on desktop.

## Purpose

> One sentence: what this screen exists to do.

Show a researcher (or a prospect) what Massive Research Tool can do and give them a one-click path from a concrete use-case to a study open in their workspace.

## Layout

> Layout zones and what occupies each.

Single scrolling column on `surface.page` parchment, max-width ~1100px centred, vertical rhythm of stacked **bands** (modular floating cards on parchment, per design language v0.6):

1. **Header band** — Plex Serif headline ("Explore") + one-line subhead on the left; a persistent **"Browse published studies →"** link on the right (→ `/browse`, or `/signup` in the public variant). In the authed variant this sits under the standard workspace TopBar; in the public variant it sits under the marketing header (see [explore-public-route-header](./explore-public-route-header.md)).
2. **Featured starter templates band** (lead band) — section heading + card grid, **2-up on desktop** / 1-up on mobile (up to 6), each a template card (cover image, name, description, use-count, "Use template"). Tour-enabled starters (misinfo / A/B / pilot) launch the guided Builder tour on use.
3. **Community studies band** — section heading + card grid (6–9) of public studies (title, author, tags, use-count, "Replicate"). Header "Browse all →" → `/browse`.
4. **Researcher showcase band** ("Researchers to follow") — a card grid of opt-in researchers, each card: avatar, name, affiliation, up to 3 research-area chips, and a "N studies · M followers" line; whole card links to `/u/<handle>`. Ordered by popularity (followers, then studies). Entire band omitted when none exist. The same `ResearcherCard` also powers the full personal **`/researchers`** directory — the "Meet Researchers" tab in the personal-mode tabs (owner 2026-07-04, discoverability).

All three bands are dynamic and collapse when empty. The app-shipped starter templates (seeded) keep the Featured band populated on a cold catalogue, so it reliably carries the page.

## Content inventory

> Every piece of content visible on the screen.

- **Page headline + subhead** — static copy ("Explore" / "See what you can run, then make it yours").
- **Browse link** — static "Browse published studies →" in the header (→ `/browse`, or `/signup` when public).
- **Featured template cards** — server: `explore.featuredTemplates` (starter + public, by use-count). Cover image (committed starter art keyed by starter id, ADR-0091, else `coverImageR2Key`, else gradient), name, description (~140 chars), use-count, "Use template" CTA (`UseTemplateButton`, with an optional `tourSlug` for tour-enabled starters).
- **Community study cards** — server: `explore.communityStudies` (recent + most-replicated public studies). Title, author display name, up to 3 tags, use-count, "Replicate".
- **Researcher showcase** — server: `explore.publicProfiles` (opt-in `publicProfileEnabled`, ≥1 publicly-discoverable study; PII-free). Avatar, display name, affiliation, research-area chips, public-study count + follower count; ordered by followers then studies. ("Articles"/publications intentionally not shown — no ORCID/Scholar/OSF data source exists, only a manual list.)
- **Section "see more" links** — static routes (`/browse`, library).

## States

> Describe each.

- **Default** — header (with Browse link) + any populated dynamic bands (Featured leads).
- **Loading** — header renders immediately (static/SSR); dynamic bands show skeleton card rows.
- **Empty** — cold catalogue: community/researcher bands collapse (no empty shells). Featured stays populated by the seeded starter templates, so it carries the page; the header Browse link is always present. No global empty state.
- **Partial** — some dynamic bands populated, others collapsed; render what exists.
- **Error** — a dynamic query failing collapses only its own band (logged); the page still renders. No full-page error.
- **Success/optimistic** — clicking a CTA shows a pending state on that card's button (PendingButton) until the fork resolves / navigation occurs.

## Interactions

> For each interactive element.

- **Header "Browse published studies →"** — navigate to `/browse` (authed) or `/signup` (public). Always present.
- **Template card "Use template"** — authed: fork the starter into the active workspace → redirect to Builder; for tour-enabled starters (misinfo / A/B / pilot) the Builder opens with `?tour=<slug>` so the guided coachmark tour auto-launches once. Anonymous: sign-up-then-fork. Pending state on the button until the fork resolves. Error → inline "Couldn't use this template" message, stay on Explore.
- **Community study "Replicate"** — `studies.fork` (authed) or sign-up-then-fork (anonymous).
- **Researcher avatar** — navigate to `/u/<handle>`.
- **"See more / See all" links** — navigate to `/browse` / library.

## Edge cases

> Long content, zero/many data, slow network, offline, permissions.

- Long scenario titles/descriptions clamp to 2 lines (ellipsis); long template/study names clamp to 1–2 lines.
- 0 dynamic items → band collapses; 1 item → single card (no awkward stretch); many → cap at the documented limit with a "see more" link (never infinite).
- Slow network → skeletons for dynamic bands; scenarios already visible.
- Anonymous user → all "use/replicate" CTAs route through sign-up; no workspace-scoped affordances shown.
- A logged-in user with no active workspace shouldn't reach the authed variant (guarded by the `(app)` layout); the public variant has no such dependency.

## Accessibility notes

> Beyond default rules.

- Each band is a `<section>` with an `aria-labelledby` pointing at its heading; headings form a logical h1→h2 outline.
- Card grids are lists (`role="list"`/`listitem`) so screen readers announce counts.
- Cover images are decorative (`alt=""`) — the card's title is the accessible name; the CTA has an explicit label including the item name ("Use template: Misinformation starter").
- Focus order follows visual order top-to-bottom, left-to-right; CTAs are real `<button>`/`<a>`.
- Respect `prefers-reduced-motion` for any card hover/entrance motion.

## Open questions

> Resolve before high-fi.

- Band order on first paint: featured templates → community → researchers (resolved; scenarios band removed 2026-07-04).
- Whether the public variant pre-renders dynamic bands for SEO or hydrates them (resolved in the Explore ADR).
