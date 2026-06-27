# Wireframe spec — Explore use-case card

- **Serves user flow:** [Explore — discovery and activation](../../02_product/user-flows/explore-discovery.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — a card component within the Explore destination scenarios band.
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Turn an abstract capability ("you can run a misinformation study here") into a concrete, one-click starting point.

## Layout

> Layout zones.

A floating card (`surface.canvas`, `radius.lg`, `shadow.md`) on the parchment band:

- **Cover image** — top, fixed aspect ratio (~16:9), rounded top corners; vibrant treatment per design language v0.6.
- **Title** — Plex Serif, 1 line, clamps with ellipsis.
- **Body** — 2-sentence framing paragraph (`text-body`, muted), clamps to ~3 lines.
- **CTA row** — primary button (filled, vibrant) left; optional secondary "Read more →" text link right.

## Content inventory

> Every piece of content.

- **Cover image** — from scenario front-matter `cover_image_r2_key`; decorative.
- **Title** — scenario `title` (≤ ~60 chars).
- **Body** — scenario body markdown, first ~2 sentences (≤ ~160 chars rendered).
- **Primary CTA label** — derived from scenario type: "Use this starter template" (has `starter_template_id`), "Browse public studies", or "Build from scratch".
- **Secondary link** — "Read more →" present only when `secondary_cta_url` is set (a docs page).

## States

> Describe each.

- **Default** — image + title + body + primary CTA (+ optional secondary).
- **Loading** — n/a individually (scenarios are static/SSR; the card never streams).
- **Empty** — n/a (a scenario with no content is simply not authored).
- **Missing template** — when `starter_template_id` resolves to nothing, the primary CTA degrades to "Browse public studies" (or "Build from scratch") rather than a dead "Use template" button; the broken reference is logged for the owner.
- **Pending** — after CTA click, the button shows a spinner (PendingButton) until fork/navigation resolves.
- **Error** — fork failure → toast on the destination; the card itself does not show an inline error.

## Interactions

> For each interactive element.

- **Primary CTA** — authed: fork the template into the active workspace → Builder; anonymous: route to sign-up carrying the fork intent (template id); degraded variants navigate to `/browse` or `/studies/new`.
- **"Read more →"** — navigates to the scenario's docs page (new tab on the public route).
- **Whole-card affordance** — the card is NOT a single click target (avoids ambiguous double-CTA); only the explicit buttons/links act.

## Edge cases

> Long content, zero/many, slow network, offline, permissions.

- Long title → 1-line ellipsis; long body → 3-line clamp; cover image missing → a neutral parchment placeholder with the scenario's accent, never a broken-image icon.
- Anonymous viewer → CTA routes through sign-up; no workspace affordances.
- Slow fork → PendingButton prevents double-submit.

## Accessibility notes

> Beyond default rules.

- Card is a `listitem`; the title is the accessible heading.
- Cover `alt=""` (decorative); the CTA carries the full accessible name including the scenario title ("Use this starter template: Run a misinformation study").
- Primary CTA and secondary link are distinct focus stops in reading order; secondary link is a real `<a>`.
- Respect `prefers-reduced-motion` for hover lift.

## Open questions

> Resolve before high-fi.

- Whether to show the target template's use-count on the scenario card (adds social proof but couples a curated card to dynamic data) — default: no, keep scenario cards purely curated.
