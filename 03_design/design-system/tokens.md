# Design tokens

> **Status:** v0.6 (2026-05-28). Materialized from design-language brief v0.6. **This file is the canonical source for implementation** — when Build starts, these values become CSS variables on `:root` (Light) and `[data-theme="dark"]` selectors (Dark). Components reference token names, never raw hex.

## How themes work

Every color token has a Light value and a Dark value. The default is Light; `[data-theme="dark"]` swaps every variable to its Dark value. The `ThemeProvider` reads the user's preference from Clerk user metadata (cached in localStorage), or honors `prefers-color-scheme` when preference is `system`. Theme transitions are instant; reduced-motion users get zero animation.

Internal-only exploration themes live alongside Light/Dark and follow the same token-name contract — only the values differ. They never reach production and are switched on via a dev-mode panel or `?theme=cool-modern` query string.

## Surface neutrals — the warm parchment ladder

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.surface.page` | `#F7F2E8` | `#161514` | Page background. Warm parchment in Light, warm near-black in Dark. The whole product surface sits on this; gutters between floating panels reveal it. |
| `color.surface.canvas` | `#FFFFFF` | `#1F1D1B` | Center work surface card background. Brightest in Light; one tier above page in Dark. |
| `color.surface.panel` | `#FCFAF3` | `#1B1A18` | Left rail card, right context panel card, top bar card, stage-tabs pill. Sits *between* page and canvas tonally. |
| `color.surface.raised` | `#FFFFFF` | `#272421` | Popovers, dropdowns, modals — surfaces that float *over* everything. Pair with `shadow.md`. |
| `color.surface.subtle` | `#F2EEE3` | `#2A2724` | Secondary fills inside a panel (selected-row backgrounds without a color tint, code blocks, neutral chips). |

## Text

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.text.primary` | `#1A1F2C` | `#F5F1E8` | Default text. Note dark-mode text is warm off-white, not pure white. |
| `color.text.secondary` | `#3F4654` | `#C9C5BE` | Body text on `panel` / `canvas` surfaces. |
| `color.text.muted` | `#6E7480` | `#8E8B86` | Helper text, captions, metadata. |
| `color.ink.deep` | `#0F2A47` | `#F5F1E8` | Display headings (h1 in Plex Serif), brand mark color. |

## Primary — action color (two stops only)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.primary` | `#1747C9` | `#3D78E8` | Primary buttons, focus rings, active tab text, links, selected state. Dark-mode brightens it for contrast on dark surfaces. |
| `color.primary.subtle` | `#EAF0FD` | `rgba(23,71,201,0.25)` | Selected-row backgrounds, primary-toned chip backgrounds. Very pale wash in Light; muted overlay in Dark. |
| `color.primary.text-on-subtle` | `#0B2A7A` | `#A8C0F0` | Text on `primary.subtle`. |

Hover state: 90% opacity over the base OR a 6% black overlay. No third hue.

## Accent — energy (two stops only)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.accent` | `#0EA5E9` | `#38BDF8` | Highlights, "what's new" markers, illuminated states, secondary CTAs where energy matters. |
| `color.accent.subtle` | `#E0F4FE` | `rgba(14,165,233,0.22)` | Subtle accent background (badges, illuminated rows). |
| `color.accent.text-on-subtle` | `#0E5879` | `#92D5F0` | Text on `accent.subtle`. |

## Functional palette — true vibrancy preserved (two stops only)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.success` | `#22C55E` | `#4ADE80` | Validation passes, status indicators — true emerald. |
| `color.success.subtle` | `#E6F6DC` | `rgba(34,197,94,0.18)` | Success badge background. |
| `color.success.text-on-subtle` | `#14532D` | `#88E0A8` | Text on success badge. |
| `color.warning` | `#F59E0B` | `#FBBF24` | Warning text and icons — amber, vivid. |
| `color.warning.subtle` | `#FBEFCF` | `rgba(245,158,11,0.22)` | Warning badge background. |
| `color.warning.text-on-subtle` | `#78350F` | `#FCD68A` | Text on warning badge. |
| `color.danger` | `#EF4444` | `#F87171` | Destructive actions, error text — true red. |
| `color.danger.subtle` | `#FBE0DA` | `rgba(239,68,68,0.2)` | Error badge background. |
| `color.danger.text-on-subtle` | `#7F1D1D` | `#F5A0A0` | Text on error badge. |
| `color.info` | `#0EA5E9` | `#38BDF8` | Informational notes (uses accent directly). |
| `color.info.subtle` | `#DDEFFB` | `rgba(14,165,233,0.22)` | Info badge background. |
| `color.info.text-on-subtle` | `#0E5879` | `#92D5F0` | Text on info badge. |

**Pairing rule:** vivid full tokens only on icons, dots, text, focus rings. Bigger surfaces use the `.subtle` pale wash with the dark text on top. The `.subtle` washes were nudged warm in Light to sit on parchment without reading as cool islands.

## Borders — three tiers, vertical use restricted

| Token | Light | Dark | Weight | Use |
| --- | --- | --- | --- | --- |
| `color.border.heavy` | `#1A1F2C` | `#F5F1E8` | 1.5–2px | Reserved. Rare — editorial gravity only. Preregistration banner top edge, published-version header. Not for outlining floating panels. |
| `color.border.medium` | `#94A0B5` | `#5F5B55` | 1px | Sub-section dividers within a panel, table row separators, rail-nav group separators. Horizontal preferred. |
| `color.border.subtle` | `#E6DFD2` | `#322E2A` | 0.5–1px | Floating panel outlines, input borders, card outlines within a panel. The everyday border. |

## Typography

Family stacks:

```
font.serif = "IBM Plex Serif", Georgia, "Times New Roman", serif
font.sans  = "IBM Plex Sans", system-ui, -apple-system, sans-serif
font.mono  = "IBM Plex Mono", "SF Mono", Menlo, monospace
```

Loaded via `@fontsource/ibm-plex-{sans,serif,mono}` packages (open license, no CDN dependency).

Scale:

| Token | Size | Family | Weight | Use |
| --- | --- | --- | --- | --- |
| `text.display` | 32–40px | Serif | 500 | Page titles, study titles, hero copy. Generous leading. |
| `text.heading.1` | 22–24px | Serif | 500 | Major section heads inside a panel ("Blocks", "At a glance"). |
| `text.heading.2` | 17–18px | Sans | 500 | Subsection heads, card titles in the right context panel. |
| `text.label` | 11–12px | Sans | 500 | UI labels above values. Uppercase with `letter-spacing: 0.04em`. |
| `text.body` | 14–15px | Sans | 400 | Default UI text. `line-height: 1.6`. |
| `text.body.emphasis` | 14–15px | Sans | 500 | Labels, button text, selected-row text. |
| `text.small` | 12–13px | Sans | 400 | Captions, secondary metadata. |
| `text.mono` | 13–14px | Mono | 400 | Code, JSON, formulas, identifiers (`core/social-post@1.2.0`). |

**Pairing rule:** Serif never sits next to Mono in the same row (visual rhythm collides). Serif pairs with Sans for body; Sans pairs with Mono for code-adjacent UI.

## Spacing — 4px grid

| Token | Value |
| --- | --- |
| `space.0` | 0 |
| `space.1` | 4px |
| `space.2` | 8px |
| `space.3` | 12px |
| `space.4` | 16px |
| `space.5` | 20px |
| `space.6` | 24px |
| `space.8` | 32px |
| `space.10` | 40px |
| `space.12` | 48px |
| `space.16` | 64px |
| `space.20` | 80px |

Semantic layers (the actually-used names):

| Token | Maps to | Use |
| --- | --- | --- |
| `spacing.compact` | `space.2` | Chip padding, inline gap. |
| `spacing.cozy` | `space.4` | Default — form rows, card padding. |
| `spacing.comfortable` | `space.6` | Section gap, dialog padding. |
| `spacing.section` | `space.12` | Between major sections. |
| `spacing.page` | `space.20` | Page-level gutters. |
| `spacing.zone-gutter` | `space.3`–`space.4` | Between floating panel cards in the canonical three-zone layout. |

Components never hard-code padding/margin/gap values. Lint forbids arbitrary spacing classes.

## Radii

| Token | Value | Use |
| --- | --- | --- |
| `radius.sm` | 4px | Chips, small tags, inline keyboard-shortcut pills. |
| `radius.md` | 6–8px | Buttons, inputs, small cards. |
| `radius.lg` | 10–12px | Floating panel cards (rail, work surface, right context, top bar, stage-tabs pill), modals. |
| `radius.full` | 9999px | Pills, avatars, status-dot containers. |

Default to `radius.md`; reach for others deliberately. All floating panels use `radius.lg`.

## Elevation / shadow

| Token | Value (Light) | Value (Dark) | Use |
| --- | --- | --- | --- |
| `shadow.none` | none | none | Default for everything on the canvas / panels. No shadow on resting cards. |
| `shadow.sm` | `0 1px 2px rgba(15,42,71,0.04)` | `0 1px 2px rgba(0,0,0,0.4)` | Dropdown, drawer slide-in. |
| `shadow.md` | `0 4px 16px rgba(15,42,71,0.08)` | `0 4px 16px rgba(0,0,0,0.5)` | Modal, popover, raised surface (`surface.raised`). |
| `shadow.lg` | `0 12px 32px rgba(15,42,71,0.12)` | `0 12px 32px rgba(0,0,0,0.6)` | Rare — only for free-floating overlays during interaction. |

Card boundaries come from `border.subtle`, not shadow. Shadow is for surfaces that genuinely float *over* other surfaces (modals, popovers, dropdowns).

## Motion

| Token | Duration | Use |
| --- | --- | --- |
| `motion.fast` | 120ms | Hovers, color changes, focus-ring fade. |
| `motion.base` | 200ms | Drawer slides, panel toggles, theme swap. |
| `motion.slow` | 320ms | Modal in/out, page transitions. |

Easing:

```
ease.enter = cubic-bezier(0.2, 0, 0, 1)
ease.exit  = cubic-bezier(0.4, 0, 1, 1)
```

`prefers-reduced-motion: reduce` → all durations become 0; transitions become instant. This is non-negotiable per accessibility floor.

## Focus ring

```
focus.ring.width = 2px
focus.ring.color = color.primary
focus.ring.offset = 2px (white outer gap on colored backgrounds)
```

Visible on every interactive element. Never removed without a replacement.

## Usage notes

**For component authors:**
- Reference tokens by name, never raw hex.
- New color decisions add both Light and Dark in the same change. No "Dark TBD" tickets.
- Hover/active states use opacity overlay or a 6% darken overlay — never a third hue. The shade ramps are deliberately two-stop only.
- Every screen contrast-checked in both modes before handoff. Run `design:accessibility-review` per surface.

**For the implementation:**
- CSS variables on `:root` for Light; `[data-theme="dark"]` selector overrides for Dark.
- `prefers-color-scheme` honored when `user.theme_preference === 'system'`.
- Token names map 1:1 between this file and the CSS variable names (kebab-case at the CSS level: `color.surface.page` → `--color-surface-page`).
- Tailwind config consumes the same tokens via `theme.extend` — no parallel source of truth.

## What this file is not

- Not a Figma library. Figma libraries are a separate sync.
- Not a runtime theme switcher. The switcher reads from this token contract; it doesn't define new themes.
- Not the place to add new functional colors without ADR coverage. Functional palette is locked at five tokens (primary, accent, success, warning, danger, info — six counting info).

## Sources

- Design-language brief v0.6 — the design intent these tokens implement.
- IA v0.3 — the surfaces the tokens get applied to.
- ADR-0007 — Path A infrastructure (Tailwind + shadcn/ui = the token consumer).
- ADR-0010 candidate (theming system) — formal architecture decision deferred until Build starts; this file is the pre-ADR commitment.
