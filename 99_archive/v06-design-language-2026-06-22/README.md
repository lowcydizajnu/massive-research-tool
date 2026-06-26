# Archived — v0.6 design language (warm parchment + Plex Serif)

**Archived 2026-06-22.** Superseded by v0.7 (dark + light dual-mode with emerald accent). See `03_design/design-language-brief.md` for the current language.

## What's here

- `design-language-brief-v0.6.md` — the locked v0.6 brief (warm parchment + Plex Serif + polarized colors + modular floating cards)
- `tokens-v0.6.md` — the v0.6 token specification

## Why archived

Owner direction 2026-06-22: identity shift from warm-parchment-light-only to dark+light dual mode with intensive emerald green (`#0AB667`) as primary accent. The shift was bigger than v0.6 could absorb without a brief rewrite — captured as v0.7.

## What was kept from v0.6

- Plex Serif for headlines + key display roles (works on dark + light equally well; carries MRT's editorial DNA)
- Polarized two-stop color discipline (chip semantics: pale background + saturated foreground)
- Modular floating cards (tonal layering, not heavy borders)
- "No AI-mockup tells" rule (no heavy vertical borders between zones)
- Sentence case everywhere
- One primary action per surface

## What changed in v0.7

- **Page background:** warm parchment `#F5EFE3` → near-black `#0A0E0C` (dark) + near-white `#F8F9F7` (light)
- **Primary accent:** muted clay → saturated emerald `#0AB667`
- **Dual mode:** light was the only mode; v0.7 is dark + light with light as the default
- **Button label color:** dark text on accent → white text on darker emerald `#047144` (Stripe-coded; AAA contrast)
- **Input size default:** 32px → 42px (B-variant from the input exploration)

## Reverting

To revert to v0.6: copy these two files back to `03_design/design-language-brief.md` and `03_design/design-system/tokens.md`, regenerate any visual artifacts that depend on them, and add an amendment ADR documenting the revert.
