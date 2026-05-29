# 03_design — make it visible

Where the product becomes something a user can see and interact with, in increasing fidelity.

```
inspiration/     Annotated references — what works, what doesn't, what's relevant
ia/              Information architecture — sitemap, navigation, taxonomy
wireframes/      Low-fidelity, structural — one file per screen-family
design-system/   Tokens, primitives, composites, patterns
prototypes/      High-fidelity, interactive where useful
handoff/         Specs for engineering — generated via design:design-handoff
```

## Read first

- `../00_meta/rules/design-rules.md`
- `../00_meta/templates/wireframe-spec-template.md`

## Order of work

1. Inspiration (parallel ok) → 2. IA → 3. Wireframes → 4. Design system entries for any new components → 5. High-fi prototypes → 6. Handoff.

## Skills to use here

- `design:design-system` — audit and extend the system as components emerge.
- `design:design-critique` — feedback pass before high-fi is locked.
- `design:accessibility-review` — before any screen leaves the folder.
- `design:design-handoff` — generate engineering specs from the final design.
- `design:ux-copy` — for every interactive copy decision.

## What this folder does *not* contain

- Code. All design output lands here; production code lives in `05_app/`.
- Decisions about *what* to build. Those came from `02_product/`. If a design choice forces a product change, write it up in the product folder first.
