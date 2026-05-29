# Wireframe spec — {Screen or screen-family name}

- **Serves user flow:** {link to flow}
- **IA placement:** {link to IA entry}
- **Persona:** {link to persona}
- **Status:** draft | reviewed | ready for design-system pass | ready for handoff

## Purpose

One sentence: what this screen exists to do. If you cannot state it, the screen should not exist.

## Layout

A description of the layout zones (header, sidebar, main, etc.) and what occupies each. A sketch (or link to one) belongs here.

## Content inventory

Every piece of content visible on the screen:

- **{Element name}** — purpose, source (static, from server, computed), max length or rough shape.

This list is what the design-system pass will turn into components.

## States

- **Default**
- **Loading**
- **Empty** — copy and CTA
- **Partial** (some data, some pending)
- **Error** — copy and recovery
- **Success / optimistic** (if applicable)

Describe each. Missing a state here means missing a state in the build.

## Interactions

For each interactive element:

- **{Element}** — affordance, action, system response, error path.

## Edge cases

- Very long content (titles, names, descriptions).
- Zero data, many data (lists of 0, 1, 10, 1000).
- Slow network.
- Offline.
- Permissions denied.

## Accessibility notes

Specific concerns that go beyond the default rules: focus order, keyboard shortcuts, ARIA labels for non-text elements, motion-reduction considerations.

## Open questions

Things to resolve before this becomes a high-fi mockup.
