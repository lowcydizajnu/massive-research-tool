# Wireframe spec — Docs site style guide (Mintlify)

- **Serves user flow:** [Get help from docs (contextual)](../../02_product/user-flows/get-help-from-docs.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — the external docs site at `docs.myresearchlab.app` (Mintlify), separate from the app but visually consistent with it.
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Keep the Mintlify docs site recognisably "Massive Research Lab" — warm parchment + Plex Serif headings — so jumping from app to docs feels continuous, not like leaving for a generic help portal.

## Layout

> Layout zones.

Standard Mintlify three-column shell (left nav tree, center content, right on-page TOC). The brand customisation:

- **Logo / name** — the MRL wordmark, top-left.
- **Primary accent** — the app's primary green (`--color-primary`).
- **Headings** — a serif (IBM Plex Serif, matching the app's Plex Serif headlines); body in the app's sans stack.
- **Background** — light parchment tone to echo `surface.page` (within Mintlify's theming limits).
- **Nav groups** (mint.json/docs.json): Getting started · Builder · Integrations · Methodology · Reference.

## Content inventory

> Every piece of content.

- **Theme config** — colors (primary), fonts (Plex Serif headings), logo, favicon — in `docs.json`/`mint.json`.
- **Nav tree** — the group/page structure above.
- **Footer** — link back to the app + legal links.

## States

> Describe each.

- **Default** — rendered docs page.
- **Coming soon** — a referenced-but-unwritten page shows Mintlify's placeholder (and is flagged to the owner by the CI missing-docs check), never a 404.
- **Search** — Mintlify's built-in search across pages.
- **Dark mode** — Mintlify auto dark theme tuned to stay legible (parchment → dark surface).

## Interactions

> For each interactive element.

- **Nav / TOC / search** — Mintlify built-ins; no custom JS.
- **"Open the app" / CTA** — links to `myresearchlab.app`.

## Edge cases

> Long content, zero/many, slow network, offline, permissions.

- Mintlify's theming can't reproduce every app token exactly — match accent + heading font + tone; don't chase pixel parity (locked design language v0.6 governs the app, not the docs host).
- Custom CSS kept minimal (Mintlify upgrades shouldn't break it).

## Accessibility notes

> Beyond default rules.

- Rely on Mintlify's accessible defaults; verify the chosen accent meets AA on both light + dark.

## Open questions

> Resolve before high-fi.

- Mintlify free tier shows Mintlify branding in the footer — acceptable for V1 (ADR-0078); upgrade removes it when content scales.
