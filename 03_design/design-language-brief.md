# Design language brief — v0.7 (locked 2026-06-22)

> **v0.7 = dark + light dual mode with intensive emerald (`#0AB667`) as the primary accent.** Replaces v0.6's warm-parchment-light-only identity. Plex Serif retained as the editorial voice. Linear / Vercel / Stripe-grade restraint disciplines carry over from the planned v0.6.2 sharpening (rolled into this larger shift).
>
> **What this brief is:** the single source of truth for visual decisions. Token spec lives at `03_design/design-system/tokens.md`. Wireframes reference token names. Code reads tokens through CSS variables (`05_app/styles/tokens.css`).
>
> **What v0.6 was:** warm parchment + Plex Serif + polarized clay accents. Archived at `99_archive/v06-design-language-2026-06-22/`. Revert path documented there.

## Changelog

- **v0.7 (2026-06-22):** Identity shift. Page bg moves from warm parchment `#F7F2E8` to dark-default + light-opt-in (page `#0A0E0C` / `#F8F9F7`). Primary accent moves from muted clay family to saturated emerald `#0AB667`. Primary CTA gains white text on darker emerald `#047144` (Stripe-coded; AAA contrast). Input default size 32px → 42px / 14px text / 8px radius (B-variant from input exploration). Plex Serif retained for headlines + study titles + metric numbers. v0.6 brief + tokens archived to `99_archive/v06-design-language-2026-06-22/`.

For pre-v0.7 changelog, see the archived `design-language-brief-v0.6.md` (entries from v0.1 through v0.6).

---

## Identity in one paragraph

A serious research tool that reads as **modern, confident, and current** — but holds onto a serif voice that signals scholarship over startup-noise. The page is the canvas: near-black in dark mode, near-white in light mode, with a faint green-warm undertone in both modes to hint at the warmth of the v0.6 heritage without committing to parchment as a surface. Cards float on the canvas via subtle tonal lift, never borders. One saturated emerald accent (`#0AB667`) does all the brand work — primary CTAs, active states, focus halos, live-state indicators, brand moments. Status colors are independently polarized (vibrant true greens/reds for semantics). Plex Serif carries headlines and study titles; Plex Sans carries everything else.

## The picks (locked 2026-06-22)

1. **Dark + light dual mode**, light is default. Researcher toggles in Settings · Account. Persists per-user.
2. **Primary accent:** emerald `#0AB667` everywhere — chips, dots, focus halos, active states, text accents.
3. **Primary CTA button:** white text on darker emerald `#047144` (Stripe-coded; AAA contrast). The slight darkening grounds the button while the brand emerald lives elsewhere at full vibrancy.
4. **Input default size:** 42px height / 14px text / hairline border (0.5px) / 8px radius. Compact 32px variant survives only in data-dense surfaces (tables, Settings rows).
5. **Search affordance:** soft-filled 44px input with leading icon + ⌘K shortcut chip; reserved for the global search bar specifically.
6. **Plex Serif retained** — headlines, study titles, metric numbers, Library/Templates display roles.
7. **Page bg has a faint green-warm undertone** — `#F8F9F7` (light) / `#0A0E0C` (dark), not pure `#FAFAFA` / `#000000`. Bridges slightly to the v0.6 parchment heritage without being parchment.

## What carried over from v0.6 + v0.6.2

- **Plex Serif** for editorial voice on headlines + study titles + metric numbers
- **Polarized two-stop color discipline** for status chips: pale background + saturated foreground (vibrant true green for "Running", amber for "Draft", muted gray for "Closed", semantic red for "Error")
- **Modular floating cards** with subtle tonal lift (no heavy borders between zones; depth via tone shift)
- **"No AI-mockup tells"**: no heavy vertical borders, no gimmicky gradients
- **One primary action per surface** — every other action recedes to secondary/ghost
- **Sentence case everywhere** — buttons, headings, tabs, chips, menu items. Title Case for proper nouns only (Claude, OSF, Prolific, Hume, Mintlify, etc.)
- **More breathing room on read-heavy surfaces** (Builder Details, Library, Explore); denser layouts on power-user surfaces (Results, Activity, Admin)
- **Confident type hierarchy** — bigger jumps between sizes (38px Plex Serif headline → 20px Plex Serif card title → 14px Plex Sans body → 12px Plex Sans metadata)

---

## Color identity

### Light mode

- **Page background:** `#F8F9F7` — near-white with a faint green-warm undertone (bridges to the v0.6 parchment heritage without being parchment)
- **Card surface:** `#FFFFFF` — pure white cards float on near-white page; 0.5px hairline border `rgba(14, 20, 16, 0.08)` defines their edges
- **Popover surface:** `#FFFFFF` with a stronger drop shadow (`0 4px 12px rgba(14, 20, 16, 0.08)`) — one elevation tier above card
- **Text primary:** `#0E1410` — near-black with green undertone
- **Text secondary:** `#5C625C` — muted neutral
- **Text tertiary:** `#8A908A` — placeholder / hint
- **Hairline border:** `rgba(14, 20, 16, 0.08)` (default) / `rgba(14, 20, 16, 0.18)` (strong; e.g., input rest border)

### Dark mode

- **Page background:** `#0A0E0C` — near-black with a faint green-warm undertone (matches the light page's undertone direction)
- **Card surface:** `#161B19` — subtle tonal lift above page; no border needed (depth via tone)
- **Popover surface:** `#1D2421` — one tier brighter than card; minimal hairline `rgba(255, 255, 255, 0.1)` + strong drop shadow `0 4px 16px rgba(0, 0, 0, 0.4)`
- **Text primary:** `#F4F8F4` — off-white with green undertone
- **Text secondary:** `#8E948E`
- **Text tertiary:** `#5C625C`
- **Hairline border:** `rgba(255, 255, 255, 0.06)` (default) / `rgba(255, 255, 255, 0.14)` (strong)

### Accent — emerald

- **Primary accent:** `#0AB667` — saturated modern emerald. Used identically in both modes (single hex; no light/dark variant).
- **Primary CTA background:** `#047144` — darker emerald (so white text passes AAA contrast). Both modes.
- **Primary CTA text:** `#FFFFFF` — both modes.
- **Accent text on chip (light mode):** `#047144` (the darker emerald, used as foreground on the pale emerald chip background)
- **Accent text on chip (dark mode):** `#4AD693` (lighter emerald variant for AA contrast against the dark chip background)
- **Chip background (light):** `rgba(10, 182, 103, 0.14)`
- **Chip background (dark):** `rgba(10, 182, 103, 0.16)`
- **Focus halo:** `0 0 0 3px rgba(10, 182, 103, 0.15)` (light) / `0 0 0 3px rgba(10, 182, 103, 0.2)` (dark)

### Semantic status colors

**Polarized two-stop pattern:** pale background + saturated foreground. Used in status chips, never as page or card surfaces.

| Status | Light bg | Light text | Dark bg | Dark text |
|---|---|---|---|---|
| Success / Running | `rgba(10, 182, 103, 0.14)` | `#047144` | `rgba(10, 182, 103, 0.16)` | `#4AD693` (+ green glow on the indicator dot) |
| Warning / Draft | `rgba(217, 119, 6, 0.12)` | `#7D5C0D` | `rgba(252, 211, 77, 0.14)` | `#FCD34D` |
| Closed / Inert | `rgba(14, 20, 16, 0.06)` | `#5C625C` | `rgba(255, 255, 255, 0.06)` | `#8E948E` |
| Error / Danger | `rgba(220, 38, 38, 0.10)` | `#B91C1C` | `rgba(248, 113, 113, 0.14)` | `#F87171` |

### Avatar tints (illustrative, not semantic)

Avatars rotate through neutral hue tints — **never** the brand emerald (would pollute meaning). Four-stop family rotation by hash-of-display-name:

- Teal-emerald: `rgba(15, 200, 130, 0.16)` bg + `#0F8557` / `#5AE2A5` text
- Amber-warm: `rgba(217, 119, 6, 0.16)` bg + `#7D5C0D` / `#FCD34D` text
- Violet-cool: `rgba(168, 119, 255, 0.16)` bg + `#5C2EE0` / `#C4B0FF` text
- Rose-warm: `rgba(244, 99, 127, 0.16)` bg + `#A1233A` / `#FBBFC9` text

## Typography

- **Display + headlines + study titles + metric numbers:** **IBM Plex Serif** (weights 400 / 500). Tight letter-spacing on big sizes (`letter-spacing: -0.02em` on H1; `-0.01em` on H2).
- **Body + UI text:** **IBM Plex Sans** (weights 400 / 500 / 600). Use 600 on Primary CTA labels only.
- **Monospace (rare):** **IBM Plex Mono** (weight 400). For code blocks, ⌘K hint chips, token values in design docs.

### Type scale

| Role | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| Display (rare; landing hero) | Plex Serif | 52px | 500 | 1.05 | -0.025em |
| H1 (destination titles like "Studies") | Plex Serif | 38px | 500 | 1.1 | -0.02em |
| H2 (card titles, section heads) | Plex Serif | 20px | 500 | 1.3 | -0.01em |
| H3 (subsection / metric number) | Plex Serif | 16-24px | 500 | 1.2 | normal |
| Body | Plex Sans | 14px | 400 | 1.5 | normal |
| Body small | Plex Sans | 13px | 400 | 1.5 | normal |
| Caption / metadata | Plex Sans | 12px | 400 | 1.4 | normal |
| Eyebrow / category label | Plex Sans | 11px | 500 | 1 | 0.06em UPPERCASE |
| Code / mono | Plex Mono | 12px | 400 | 1.4 | normal |

## Spacing scale

8px base. Multiples of 4 allowed at the small end (4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80).

| Token | Value | Use |
|---|---|---|
| `--gap-xs` | 4px | Inline chip-to-icon |
| `--gap-sm` | 8px | Form-field internal |
| `--gap-md` | 12px | Card content rows |
| `--gap-lg` | 20px | Card stacks; section internal |
| `--gap-xl` | 32px | Between major page sections |

## Radii

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | Status chips, tag chips, kbd hints |
| `--radius-sm` | 6px | Tags, small buttons |
| `--radius-md` | 8px | Inputs, buttons, dropdowns |
| `--radius-lg` | 10px | Soft-filled inputs, popovers |
| `--radius-xl` | 12px | Cards, modals |
| `--radius-2xl` | 16px | Section containers, large hero cards |

## Component baselines

### Buttons

- **Primary:** 42px height, white text (`#FFFFFF`) on darker emerald (`#047144`), 8px radius, 11px-16px horizontal padding (depending on label length), weight 600. AAA contrast.
- **Secondary:** 42px height, primary text color on transparent, 0.5px hairline-strong border, 8px radius, weight 500.
- **Ghost:** 42px height, primary text color on transparent, no border, 8px radius, weight 500. Hover reveals a subtle bg tint.
- **Danger:** 42px height, white text on `#DC2626` (light) / `#F87171` (dark), weight 500. Used for destructive actions only.
- **Compact variants (icon-only, table-row actions):** 32px height, 6px radius. Apply same color rules.

### Inputs

- **Default:** 42px height, 14px text, 8px radius, 0.5px hairline-strong border `rgba(14, 20, 16, 0.18)` (light) / `rgba(255, 255, 255, 0.12)` (dark), 11-14px internal padding. White (light) / `#161B19` (dark) background.
- **Focused:** 1.5px solid emerald border + 3px emerald halo (`box-shadow: 0 0 0 3px rgba(10, 182, 103, 0.15-0.2)`).
- **Error:** 1.5px solid danger color border; error message below in danger color at 10-12px.
- **Soft-filled (search / filter contexts):** 44px height, 14px text, 10px radius, no border, subtle bg tint (`rgba(14, 20, 16, 0.04)` light / `rgba(255, 255, 255, 0.04)` dark).
- **Search (global, Cmd+K):** Soft-filled 44px with leading `ti-search` icon + trailing `⌘K` chip on the right. Reserved for the TopBar global search only.
- **Compact:** 32px / 12px text / 6px radius. For data-dense surfaces only.

### Dropdowns

- **Closed (default):** Same shape as input B (42px / hairline / 8px radius); trailing `ti-chevron-down` icon at 16px in secondary text color.
- **Open popover:** Card surface (`#FFFFFF` light / `#1D2421` dark), 0.5px hairline, 10px radius, drop shadow. Items: 6-8px padding, 12px text, hover bg tint, selected item shows emerald bg tint + check icon.
- **Rich variant (workspace switcher, study picker):** 56px height; leading 32px icon-tile (rounded-md, colored bg tint) + two-line content (title 14px + caption 11px secondary).

### Chips (status + tag)

- **Height:** 22-24px (depending on content).
- **Padding:** 3-4px vertical / 8-10px horizontal.
- **Radius:** 4px (`--radius-xs`).
- **Type:** 11px Plex Sans weight 500.
- **Status chips** use polarized two-stop pattern (above).
- **Tag chips** use neutral gray family (`rgba(14, 20, 16, 0.06)` bg / primary text).
- **Indicator dot** on "Running" chip: 5px circle in saturated accent, with subtle 4-5px green glow in dark mode (`box-shadow: 0 0 5px rgba(10, 182, 103, 0.7)`).

### Cards

- **Surface:** White (light) / `#161B19` (dark).
- **Radius:** 10-12px depending on size.
- **Border:** 0.5px hairline (light only); dark mode uses tonal lift instead.
- **Padding:** 18-28px depending on density.
- **Shadow:** None for in-flow cards; `0 0 0 0.5px hairline` for outlined cards in light mode.

### Avatars

- Single avatar: 28-44px circle with initials at weight 600 in matching tint family (see Avatar tints above).
- Avatar cluster: 24px circles, -6px overlap, 2px ring in page bg color for separation.

### Tabs

- Underline pattern: active tab has 2px emerald underline + primary text color; inactive sits in secondary text color, no chrome.
- 7-9px vertical padding, 12-14px horizontal. 13-14px Plex Sans body text.

## Voice + UX copy

- Sentence case everywhere — never Title Case (except proper nouns).
- Active voice, verb-first: "Save changes" not "Save your changes" not "Changes saved".
- Contractions are fine: "can't", "won't", "you're".
- Never "please", never "successfully", never "click here", never "simply" / "just" / "easy".
- Errors say what happened, then what to do. One sentence. No first-person.
- Empty states are invitations, not apologies: headline names the space, body explains, CTA is a verb.

Full voice rules survive verbatim from v0.6 — see the archived brief for the full discussion. Nothing about MRT's voice changed in v0.7.

## Vocabulary translation (research-native ↔ developer-internal)

| Internal (GitHub-derived) | User-facing (researcher-native) |
|---|---|
| Fork | Replicate / Adapt |
| Version (snapshot) | Saved version |
| Branch | Working copy |
| Commit | Save |
| Preregistration push | Preregister on OSF |
| Upstream | Source study |
| Merge | (not exposed; internal only) |

Use the user-facing terms in every UI string a researcher sees. Use the internal terms only in code, ADRs, and developer-facing docs. Translation rule lives in `00_meta/rules/design-rules.md`.

## What's NOT in this brief (intentionally)

- **Per-study theme editor** (V1.12 Section F + Library-completion Themes-library tab) — researchers can override the brand for their participant-facing study chrome. v0.7 is the researcher-app brand; participant-facing studies stay flexible.
- **Motion + animation system** — defer until a specific UX request justifies the design effort. Default to instant transitions on color/state changes; 200ms ease on size/position changes; never animate things participants experience during a take.
- **Iconography** — using Tabler Icons (outline only). Sized 16-24px. No custom illustration commissioned for V1.
- **Marketing site** — same brand language but separate considerations (lots more imagery, hero pieces, conversion CTAs). Brief for marketing surfaces TBD.
- **Email templates** — weekly digest + return-nudge templates use a lightly-simplified subset of these tokens (no toggles; no dark mode; brand emerald used sparingly). React Email pipeline.

## Open follow-ups

- **Brighter emerald variant** for chips/accents? Currently `#0AB667` everywhere; question whether a slightly brighter `#0FBE6F` would make accents pop more against white card surfaces in light mode. Deferred — observe in production first.
- **Custom Plex Serif weights?** IBM offers Light + ExtraLight that aren't in our current Google Fonts subset. Worth loading if we want a hairline display weight at 64px+ for the marketing site eventually. Deferred.
- **A "scholarly mode" theme preset** for participant-facing study chrome that's an academic-publication aesthetic (cream paper + Plex Serif + minimal accent)? Researchers conducting IRB-sensitive studies might want this for participant comfort. Deferred to Themes-library work.
