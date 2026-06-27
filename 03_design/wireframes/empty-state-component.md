# Wireframe spec — Empty-state component

- **Serves user flow:** [First-run orientation](../../02_product/user-flows/first-run-orientation.md)
- **IA placement:** [App shell — shared components](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

> Shared design (platform-foundation PF3.2). One reusable `<EmptyState>` applied to every destination that can have a "no content yet" state, so empties read as guidance, not dead ends.

## Purpose

> One sentence: what this screen exists to do.

Turn every "nothing here" surface into a consistent, friendly prompt that names the next step.

## Layout

> Layout zones.

- A soft card (`surface.subtle`, `radius.lg`, generous padding), centered column by default (or left-aligned `align="start"` inside panels): optional icon → serif heading → one-line body → optional single CTA.

## Content inventory

> Every piece of content visible.

- **Icon** (optional) — a lucide glyph hinting at the surface. Muted. Static.
- **Heading** — short, encouraging ("No studies yet."). Plex Serif. Static per call site.
- **Body** (optional) — one sentence explaining what lives here / how to fill it. Static per call site.
- **CTA** (optional) — exactly one primary next-step action (button or link). Passed in as `action`.

## States

This *is* the empty state. The component itself has no internal states; each call site renders it only when its data set is empty (vs Loading / populated, which the surface owns).

## Interactions

- **CTA** — navigates to / opens the obvious next step (e.g. New study, Connect Prolific, Open recruitment). At most one, to keep the choice clear.

## Edge cases

- No CTA available (e.g. a viewer with read-only access) — render heading + body only; never show a disabled CTA.
- Inside a narrow panel (Builder Conditions/Variants/Versions) — use `align="start"` and shorter copy.
- Very long body — capped to one or two lines by copy discipline (max-width on the body).

## Accessibility notes

- Heading is a real heading in document order; icon is `aria-hidden` (decorative).
- The CTA is a normal focusable button/link — the empty state adds no focus traps.
- Contrast holds in both themes (token-based colors only).

## Per-surface copy

The applied copy + CTA per destination is tracked in the PF3.2 section of `04_architecture/handoffs/code-tab-platform-foundation.md`. Library-completion surfaces (Templates / Materials / Themes / Imports) are deferred until that handoff ships those routes.

## Open questions

- Whether to add a small illustration set later (icons suffice for v1).
