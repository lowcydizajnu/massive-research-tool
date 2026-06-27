# Wireframe spec — Explore destination

- **Serves user flow:** [Explore — discovery and activation](../../02_product/user-flows/explore-discovery.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — new top-level destination in the workspace LeftRail; also a public route.
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Show a researcher (or a prospect) what Massive Research Tool can do and give them a one-click path from a concrete use-case to a study open in their workspace.

## Layout

> Layout zones and what occupies each.

Single scrolling column on `surface.page` parchment, max-width ~1100px centred, vertical rhythm of stacked **bands** (modular floating cards on parchment, per design language v0.6):

1. **Header band** — Plex Serif headline ("Explore") + one-line subhead. In the authed variant this sits under the standard workspace TopBar; in the public variant it sits under the marketing header (see [explore-public-route-header](./explore-public-route-header.md)).
2. **Use-case scenarios band** — 2-up (desktop) / 1-up (mobile) grid of scenario cards (see [explore-use-case-card](./explore-use-case-card.md)). Always present (curated; never empty).
3. **Featured starter templates band** — section heading + horizontal card grid (up to 6), each a template card (cover, name, description, use-count, "Use this template"). "See all templates →" link to Library/Browse.
4. **Community studies band** — section heading + card grid (6–9) of public studies (title, author, tags, use-count, "Replicate"). "See more →" → `/browse`.
5. **Researcher showcase band** — avatars + names of opt-in researchers; entire band omitted when none exist.

Bands 3–5 are dynamic; band 2 is curated and carries the page if the catalogue is cold.

## Content inventory

> Every piece of content visible on the screen.

- **Page headline + subhead** — static copy ("Explore" / "See what you can run, then make it yours").
- **Scenario cards** — from Markdown files in `content/explore/scenarios/*.md` (title, 2-sentence body, cover image, primary CTA, optional "Read more →"). 5–8 to start.
- **Featured template cards** — server: `explore.featuredTemplates` (starter + public, by use-count). Cover image, name, description (~140 chars), use-count, CTA.
- **Community study cards** — server: `explore.communityStudies` (recent + most-replicated public studies). Title, author display name, up to 3 tags, use-count, "Replicate".
- **Researcher showcase** — server: `explore.publicProfiles` (opt-in, ≥1 published study). Avatar, name, handle.
- **Section "see more" links** — static routes (`/browse`, library).

## States

> Describe each.

- **Default** — header + scenarios + any populated dynamic bands.
- **Loading** — scenarios render immediately (static/SSR); dynamic bands show skeleton card rows.
- **Empty** — cold catalogue: dynamic bands (templates/community/researchers) collapse entirely (no empty shells); scenarios band always carries the page. No global empty state.
- **Partial** — some dynamic bands populated, others collapsed; render what exists.
- **Error** — a dynamic query failing collapses only its own band (logged); the page still renders. No full-page error.
- **Success/optimistic** — clicking a CTA shows a pending state on that card's button (PendingButton) until the fork resolves / navigation occurs.

## Interactions

> For each interactive element.

- **Scenario primary CTA ("Use this starter template")** — authed: fork the scenario's template → redirect to Builder; anonymous: route to sign-up carrying the fork intent. Degrades to "Browse public studies" / "Build from scratch" when no template is configured. Error → toast, stay on Explore.
- **Scenario "Read more →"** — opens the scenario's docs page (new tab when public).
- **Template card "Use this template"** — fork (authed) or sign-up-then-fork (anonymous).
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

- Final band order on first paint (assume scenarios → templates → community → researchers).
- Whether the public variant pre-renders dynamic bands for SEO or hydrates them (resolved in the Explore ADR).
