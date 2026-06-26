# Design tokens — v0.7 (locked 2026-06-22)

> **Status:** v0.7 (2026-06-22). Materialized from design-language brief v0.7. **This file is the canonical source for implementation** — when Code tab implements the v0.7 visual migration, these values become CSS variables on `:root` (Light is default) and `[data-theme="dark"]` selectors. Components reference token names, never raw hex.
>
> **v0.6 tokens archived** at `99_archive/v06-design-language-2026-06-22/tokens-v0.6.md`. Revert path documented there.

## How themes work

Every color token has a Light value and a Dark value. **Light is the default**; `[data-theme="dark"]` swaps every variable to its Dark value. The `ThemeProvider` reads the user's preference from Clerk user metadata (cached in localStorage), or honors `prefers-color-scheme` when preference is `system`. Theme transitions are instant; reduced-motion users get zero animation.

A few tokens are **mode-invariant** (single value across both modes) — most notably the brand emerald primary `#0AB667`, the primary CTA background `#047144`, and the primary CTA text `#FFFFFF`. The brief calls out which.

## Surface neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `color.surface.page` | `#F8F9F7` | `#0A0E0C` | Page background. Near-white with faint green-warm undertone in Light; near-black with same undertone in Dark. Whole product surface sits on this. |
| `color.surface.card` | `#FFFFFF` | `#161B19` | Card surface. Pure white in Light (cards float on near-white page); subtle tonal lift above page in Dark (no border needed). |
| `color.surface.popover` | `#FFFFFF` | `#1D2421` | Floating popover (dropdown menus, tooltips, comment threads). One elevation tier above card; in Dark, slightly brighter than card. |
| `color.surface.input` | `#FFFFFF` | `#161B19` | Input field background. Matches card in both modes. |
| `color.surface.input-soft` | `rgba(14, 20, 16, 0.04)` | `rgba(255, 255, 255, 0.04)` | Soft-filled input (search / filter contexts). Subtle tint instead of border. |

## Text

| Token | Light | Dark | Use |
|---|---|---|---|
| `color.text.primary` | `#0E1410` | `#F4F8F4` | Body text, primary headings, primary UI labels. |
| `color.text.secondary` | `#5C625C` | `#8E948E` | Supporting text, metadata, inactive tab labels. |
| `color.text.tertiary` | `#8A908A` | `#5C625C` | Placeholders, very-low-emphasis hints. |
| `color.text.muted-divider` | `#C5CAC5` | `#3A3F3B` | The thin `·` separators between metadata items. |

## Borders

| Token | Light | Dark | Use |
|---|---|---|---|
| `color.border.default` | `rgba(14, 20, 16, 0.08)` | `rgba(255, 255, 255, 0.06)` | Hairline divider, default card border. |
| `color.border.strong` | `rgba(14, 20, 16, 0.18)` | `rgba(255, 255, 255, 0.12)` | Input rest border, secondary button border. |
| `color.border.stronger` | `rgba(14, 20, 16, 0.25)` | `rgba(255, 255, 255, 0.18)` | Heavy divider (rare; reserved for high-emphasis dialogs). |

## Accent — emerald (brand)

| Token | Light | Dark | Use |
|---|---|---|---|
| `color.accent.primary` | `#0AB667` | `#0AB667` | **Mode-invariant.** Brand accent: chips, dots, focus halos, active states, accent text on white surfaces. |
| `color.accent.cta-bg` | `#047144` | `#047144` | **Mode-invariant.** Primary CTA background (darker emerald for AAA contrast with white text). |
| `color.accent.cta-text` | `#FFFFFF` | `#FFFFFF` | **Mode-invariant.** Primary CTA label color. |
| `color.accent.text-on-chip` | `#047144` | `#4AD693` | Accent text rendered on the pale emerald chip background. |
| `color.accent.chip-bg` | `rgba(10, 182, 103, 0.14)` | `rgba(10, 182, 103, 0.16)` | Pale emerald chip background; for "Running" status and brand-tagged surfaces. |
| `color.accent.focus-halo` | `0 0 0 3px rgba(10, 182, 103, 0.15)` | `0 0 0 3px rgba(10, 182, 103, 0.2)` | Focus ring on inputs / interactive surfaces. |

## Semantic — status

Polarized two-stop pattern: pale background + saturated foreground. Used in status chips only; never as page / card surfaces.

### Success / Running

| Token | Light | Dark |
|---|---|---|
| `color.status.success.bg` | `rgba(10, 182, 103, 0.14)` | `rgba(10, 182, 103, 0.16)` |
| `color.status.success.text` | `#047144` | `#4AD693` |
| `color.status.success.dot` | `#0AB667` | `#0AB667` (+ `box-shadow: 0 0 5px rgba(10, 182, 103, 0.7)` glow) |

### Warning / Draft

| Token | Light | Dark |
|---|---|---|
| `color.status.warning.bg` | `rgba(217, 119, 6, 0.12)` | `rgba(252, 211, 77, 0.14)` |
| `color.status.warning.text` | `#7D5C0D` | `#FCD34D` |

### Closed / Inert

| Token | Light | Dark |
|---|---|---|
| `color.status.closed.bg` | `rgba(14, 20, 16, 0.06)` | `rgba(255, 255, 255, 0.06)` |
| `color.status.closed.text` | `#5C625C` | `#8E948E` |

### Error / Danger

| Token | Light | Dark |
|---|---|---|
| `color.status.danger.bg` | `rgba(220, 38, 38, 0.10)` | `rgba(248, 113, 113, 0.14)` |
| `color.status.danger.text` | `#B91C1C` | `#F87171` |
| `color.status.danger.solid-bg` | `#DC2626` | `#F87171` | (For destructive buttons.) |
| `color.status.danger.solid-text` | `#FFFFFF` | `#FFFFFF` |

## Avatar tints (illustrative, not semantic)

Avatars rotate through these four families by hash-of-display-name. **Brand emerald is excluded** to avoid polluting meaning.

| Family | Light bg | Light text | Dark bg | Dark text |
|---|---|---|---|---|
| Teal-emerald | `rgba(15, 200, 130, 0.16)` | `#0F8557` | `rgba(15, 200, 130, 0.18)` | `#5AE2A5` |
| Amber-warm | `rgba(217, 119, 6, 0.16)` | `#7D5C0D` | `rgba(252, 211, 77, 0.18)` | `#FCD34D` |
| Violet-cool | `rgba(168, 119, 255, 0.16)` | `#5C2EE0` | `rgba(168, 119, 255, 0.18)` | `#C4B0FF` |
| Rose-warm | `rgba(244, 99, 127, 0.16)` | `#A1233A` | `rgba(244, 99, 127, 0.18)` | `#FBBFC9` |

## Typography

| Token | Value |
|---|---|
| `font.family.serif` | `"IBM Plex Serif", Georgia, serif` |
| `font.family.sans` | `"IBM Plex Sans", system-ui, -apple-system, sans-serif` |
| `font.family.mono` | `"IBM Plex Mono", "SF Mono", Menlo, monospace` |
| `font.weight.regular` | `400` |
| `font.weight.medium` | `500` |
| `font.weight.semibold` | `600` (CTA labels only) |

### Type scale

| Token | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| `type.display` | serif | 52px | 500 | 1.05 | -0.025em |
| `type.h1` | serif | 38px | 500 | 1.1 | -0.02em |
| `type.h2` | serif | 20px | 500 | 1.3 | -0.01em |
| `type.h3` | serif | 16-24px | 500 | 1.2 | normal |
| `type.body` | sans | 14px | 400 | 1.5 | normal |
| `type.body-sm` | sans | 13px | 400 | 1.5 | normal |
| `type.caption` | sans | 12px | 400 | 1.4 | normal |
| `type.eyebrow` | sans | 11px | 500 | 1 | 0.06em UPPERCASE |
| `type.mono` | mono | 12px | 400 | 1.4 | normal |

## Spacing

8px base; 4px increments allowed at the small end.

| Token | Value |
|---|---|
| `gap.xs` | 4px |
| `gap.sm` | 8px |
| `gap.md` | 12px |
| `gap.lg` | 20px |
| `gap.xl` | 32px |
| `pad.sm` | 8px |
| `pad.md` | 12px |
| `pad.lg` | 18px |
| `pad.xl` | 28px |

## Radii

| Token | Value | Use |
|---|---|---|
| `radius.xs` | 4px | Status chips, tag chips, kbd hints |
| `radius.sm` | 6px | Small / compact buttons |
| `radius.md` | 8px | Inputs (default), buttons (default), dropdowns |
| `radius.lg` | 10px | Soft-filled inputs, popovers |
| `radius.xl` | 12px | Cards, modals |
| `radius.2xl` | 16px | Section containers, large hero cards |

## Sizing

| Token | Value | Use |
|---|---|---|
| `size.control` | 42px | Default input / button / dropdown height |
| `size.control-soft` | 44px | Soft-filled input + global search |
| `size.control-compact` | 32px | Data-dense tables, settings rows |
| `size.icon-sm` | 14px | Inline icons |
| `size.icon-md` | 16px | Form-field icons, button icons |
| `size.icon-lg` | 20px | Card affordance icons |
| `size.icon-xl` | 24px | Decorative |

## Motion

| Token | Value | Use |
|---|---|---|
| `motion.duration.fast` | 100ms | Color/background changes |
| `motion.duration.snap` | 150ms | Hover state lifts |
| `motion.duration.base` | 200ms | Size/position changes; default |
| `motion.duration.slow` | 300ms | Modal / popover enter/exit |
| `motion.easing.out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default — settles confidently |
| `motion.easing.snap` | `cubic-bezier(0.4, 0, 0.2, 1)` | Linear-ish; for state changes |

## Implementation notes

- Code tab consumes these via `05_app/styles/tokens.css` — that file isn't updated yet (would break the live v0.6-coded app). Code tab will do the visual migration as a coordinated PR; see the next handoff to be drafted (V2.x visual migration).
- Until the visual migration ships, **wireframes can reference these v0.7 token names** but the live app still reads v0.6 values. This is fine — wireframes are forward-looking specs, not live styles.
- Existing wireframes in `03_design/wireframes/` mostly remain valid (they reference layout + content + interaction patterns, not pixel-locked colors). A migration pass may surface specific frames that need re-rendering — flag them as discovered.
