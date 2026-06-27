# Wireframe spec — HelpLink component (contextual docs)

- **Serves user flow:** [Get help from docs (contextual)](../../02_product/user-flows/get-help-from-docs.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — a reusable inline affordance placed next to feature headings + Configure controls + integration cards across the app.
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Give every non-obvious feature a one-click, consistent path to the doc page that explains it.

## Layout

> Layout zones.

A small inline control: a `?`/help-circle icon (`size-4`, `text.tertiary`) optionally followed by a short text label, sitting immediately after a heading or control label. Never a block element — it flows inline with the thing it annotates.

## Content inventory

> Every piece of content.

- **Icon** — a help-circle glyph (lucide `HelpCircle` / `CircleHelp`).
- **Optional label** — short text ("Learn more", "About conditions"); usually omitted (icon-only) next to headings.
- **Target** — derived from a typed `docKey` → `https://docs.myresearchlab.app{DOC_URLS[docKey]}`.

## States

> Describe each.

- **Default** — muted icon; hover raises it to `text.primary`.
- **Focus** — visible focus ring (keyboard).
- **No states for loading/empty/error** — it's a plain external link; the destination handles its own states (incl. Mintlify "coming soon" for unwritten pages).

## Interactions

> For each interactive element.

- **Click / Enter** — opens the mapped doc page in a new tab (`target="_blank"`, `rel="noopener noreferrer"`).
- **Hover** — tooltip = the label (or "Learn more").

## Edge cases

> Long content, zero/many, slow network, offline, permissions.

- Unknown `docKey` — impossible: `docKey` is a typed union, enforced at compile time.
- Unwritten page — Mintlify placeholder, not a 404; surfaced to the owner via the build-time missing-docs check, never as a dead link to the researcher.
- Offline — browser handles the failed navigation; the app tab is unaffected.

## Accessibility notes

> Beyond default rules.

- Real `<a>` with an accessible name even when icon-only (`aria-label` = the label or "Learn more: <topic>").
- Indicates it opens a new tab (SR text or title).
- Meets AA contrast in both hover and rest states; focus-visible ring.

## Open questions

> Resolve before high-fi.

- Icon-only vs icon+label default per placement — default icon-only beside headings, icon+label inside dense Configure panels.
