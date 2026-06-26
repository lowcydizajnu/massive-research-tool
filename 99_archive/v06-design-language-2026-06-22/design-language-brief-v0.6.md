# Design-language brief

> **Status:** v0.6 (2026-05-28). All visual and chrome decisions locked. IBM Plex (Serif / Sans / Mono); polarized vibrant palette on warm parchment `surface.page #F7F2E8` (final); modular floating panels with stage-tabs pill above center work surface (Miro / FigJam pattern); Plex Serif in display + section heads; Light + Dark + System with full token tables; tokens materialized at `03_design/design-system/tokens.md`. Brief is now the source of design intent; tokens are the source of implementation truth. Synthesized from inspiration batch `03_design/inspiration/2026-05-28-first-batch.md`.

## Changelog

- **v0.6 (2026-05-28):** Lock — no more revisions. Parchment stays at `surface.page #F7F2E8` (project owner reviewed across 5+ visualizers including the Option A vs B comparison; this is the calibrated value). Chrome stays at v0.5.3 Option B (floating pill above center work surface). Tokens materialized in `03_design/design-system/tokens.md` as the canonical source for code. Brief promoted from iteration mode to reference mode — future changes go through ADR, not changelog.
- **v0.5.3 (2026-05-28):** Stage tabs placement re-locked from Option A (top-bar center slot) to **Option B (floating pill above the center work surface only)** after the project owner saw both visualized in context. The v0.5.2 Typeform pattern was familiar but reintroduced a dense full-width band that pulled against the brief's modular-floating-panels spirit. Option B is structurally closer to Miro / FigJam: the page is a board of floating modules, each module owns its own controls; the stage-tabs pill literally sits *over* the work surface it controls. Side rails extend full height of the center column. Top bar reverts to slim form (workspace chip + breadcrumb on the left; ⌘K + Save when applicable + user avatar on the right). The scope hierarchy stays spatially literal — workspace-global chrome is in the top bar + left rail; study-scoped chrome is the stage-tabs pill *and* the work surface beneath it, visually grouped as one column. **The container reading is now: "three modules on a parchment board — workspace nav on the left, the study being built in the middle, context on the right — with a top hat carrying global chrome above all three."**
- **v0.5.2 (2026-05-28) — superseded by v0.5.3:** Layout-hierarchy correction surfaced by the first wireframe pass. The v0.5.1 mockup put stage tabs (`Build · Preview · Share · Preregister · Run · Results`) in a separate full-width strip *below* the top bar and *above* the sidebar. Project-owner caught the scope-hierarchy disconnect: stage tabs are **study-scoped** (they only exist when you're inside a specific study), but the sidebar (Studies / Library / Frameworks / etc.) is **workspace-global**. Adjacent full-width rows implied same hierarchy level, which is wrong. v0.5.2 fix (subsequently revised to v0.5.3): stage tabs moved into the top bar's center slot (Typeform pattern). Side-by-side comparison with Option B made the modular-floating direction clearer — see v0.5.3.
- **v0.5.1 (2026-05-28):** Three refinements after v0.5 read as "too creamy." (a) `surface.page` paled from `#F4EFE6` to `#F7F2E8` and `surface.panel` paled from `#FBF7EE` to `#FCFAF3` — warmth preserved, creaminess dialed down. Open to further calibration once wireframes show the tone in context (project-owner explicitly wants to "decide on final" alongside wireframes). (b) **Dark mode promoted from post-V1 to V1 ship.** Both Light and Dark themes available, user-toggleable, persisted per user. System-auto is the third option. (c) **Theming made structural** — see new Themeability section. Tokens are CSS variables; themes are bundles of variable values. Light + Dark are the user-facing themes; internal-only exploration themes exist for design discipline (try a "modern cool" theme, a "minimal monochrome" theme, etc., without disturbing production).
- **v0.5 (2026-05-28):** Three corrections to v0.4 after the project-owner referenced Typeform's modular-panels pattern and called the v0.4 surface "stitched together, cold, Mural not Miro." (a) **Page background becomes warm parchment beige** — new token `color.surface.page #F4EFE6`. The cool gray `surface.sunken` from v0.4 retired in favor of this. The whole product surface reads warm, editorial, slightly handmade. (b) **Layout shifts from abutting zones to modular floating panels.** Left rail, center work surface, and right context panel each become their own rounded card (`radius.lg`) with a subtle border, sitting *on* `surface.page` with a 12-16px gutter between them so the warm page shows through. The Typeform / Linear / Miro pattern. The structure comes from the gap between cards, not from tint differences within a single canvas. (c) **Plex Serif pulled into more places.** Study titles, stage indicators where appropriate, occasional editorial section heads. The typeface choice was meant to deliver editorial sophistication; v0.5 starts spending that more aggressively. Functional palette vibrancy preserved from v0.4.
- **v0.4 (2026-05-28):** Three color refinements after v0.3 visualizer feedback. (a) **Functional palette pushed up to true vibrancy** — success now `#22C55E` (true emerald, was `#1F8A52`), danger now `#EF4444` (was `#DC2626`). They should *read* as success and danger, not "newspaper success." (b) **Shade ramps polarized to two stops only** — `*.subtle` (very pale wash, near-white) and the full saturated token. Mid-saturation `.hover` mid-tones removed. Hover/active states use opacity overlay, a 2-3% darker overlay, or a border lift — never a third hue. The muddy "kinda blue, kinda gray" middle is gone. (c) **Zone separation moves from vertical borders to background tint shift.** v0.3's `border.heavy #1A1F2C` between zones produced an AI-mockup look. Real interfaces separate zones with `color.surface.canvas` (center) vs `color.surface.sunken` (rails), plus optional soft seam shadow on hover. `border.heavy` survives but only for horizontal structural breaks (top-bar bottom edge, section delineators in long forms) — never as a vertical right-rail edge.
- **v0.3 (2026-05-28):** Palette revised after v0.2 read as too restrained. Primary moved from deep navy `#0F2A47` to electric royal `#1747C9` for vibrancy; deep navy preserved as `color.ink.deep` for hero / display headings. Secondary accent introduced: `#0EA5E9` Picton-style cyan, echoing the project owner's original Palette 2 inspiration. Three-tier border weights: heavy `#1A1F2C` for major zone dividers, medium `#94A0B5` for sub-sections, subtle `#E5E7EC` for within-component. Functional palette saturation raised.
- **v0.2 (2026-05-28):** Typeface picked (IBM Plex Serif / Sans / Mono). Color palette picked (synthesis of Palette 1 structure + Palette 2's Maastricht Blue feel, rendered as deep navy `#0F2A47`). Functional and neutral palettes specified.
- **v0.1 (2026-05-28):** Initial draft with open accent + typeface decisions.

## Tone and voice

**Serious but fresh.** The product is for academic researchers whose work is rigorous and whose tooling is currently dated. The design should signal *trustworthy and modern* without performing either. Subtlety beats expressiveness everywhere; restraint is the dominant aesthetic move.

- **Trust-coded:** clean, well-aligned, predictable. Researchers should feel that the people who made this care about precision.
- **Modern-coded:** quiet whitespace, intentional type hierarchy, no decorative chrome. Polish through restraint.
- **Anti-corporate:** no stock illustrations, no patronizing copy, no marketing-trick "let's make this fun!" interventions.
- **Anti-startup-cliché:** no purple-to-pink gradients, no neon accents, no marketing-mode whimsy in the product surface.

Per `00_meta/rules/design-rules.md` "Vocabulary" rule: internal terms (fork, snapshot, module, theme overlay) translate to researcher-native UI copy (Replicate, Saved version, Question/Artifact, Workspace).

## Color philosophy

**Color is functional, not decorative.** Status, action, focus, and categorization use color. Decoration uses whitespace and type. Categories are *muted but distinct* — never neon, never highly saturated.

### Locked palette (v0.5)

The v0.5 move is in the neutrals and in the *layout* the neutrals support. The accents and functional palette are unchanged from v0.4 — they were the right intensity.

1. **Page background is warm parchment.** New token `color.surface.page #F4EFE6`. The whole product surface sits on this. It's editorial, not clinical. It signals "made for reading and writing" rather than "enterprise dashboard."
2. **Three zones become floating panels on the page.** Left rail, center work surface, right context panel each render as their own card on `surface.page`, with their own background (`canvas` white for the work surface, `panel` near-white cream for the side panels), a subtle border, and `radius.lg` rounded corners. A 12-16px gutter of `surface.page` shows between them. The structure of the app is the *arrangement of cards on the page*, not edges drawn between abutting zones.
3. **Plex Serif takes more weight.** Study titles, stage indicators where they need editorial gravity, occasional section heads. The typeface choice deserves more visible payoff than v0.4 was giving it.

The v0.4 token `color.surface.sunken #F4F6FA` is retired — it was a cool gray standing in for what should have been a warm page background. v0.5 replaces it with `surface.page`.

**Primary (vibrant, used for action — two stops only):**

| Token | Hex | Use |
| --- | --- | --- |
| `color.primary` | **#1747C9** | Primary buttons, focus rings, active state on stage tabs, selected state, links |
| `color.primary.subtle` | **#EAF0FD** | Selected row background, primary-toned chip background, very pale wash |
| `color.primary.text-on-subtle` | #0B2A7A | Text on `primary.subtle` |

Hover state: 90% opacity over the base, or `box-shadow: inset 0 0 0 100vh rgba(0,0,0,0.06)` (a subtle darken overlay). Active: same overlay at 10%. No third hue.

**Secondary accent (energy, used for highlights and positive accents — two stops only):**

| Token | Hex | Use |
| --- | --- | --- |
| `color.accent` | **#0EA5E9** | Highlights, illuminated states, "what's new" markers, secondary CTAs where energy matters |
| `color.accent.subtle` | **#E0F4FE** | Subtle accent background (badges, illuminated rows), very pale wash |
| `color.accent.text-on-subtle` | #0E5879 | Text on `accent.subtle` |

The accent appears *less often* than the primary. Most surfaces have zero accent. It's reserved for genuinely energizing moments (a successful preregistration confirmation, an OSF push completing, a "new" marker on a fork notification).

**Ink (deep editorial; display typography + horizontal structural breaks):**

| Token | Hex | Use |
| --- | --- | --- |
| `color.ink.deep` | **#0F2A47** | Display headings (h1 in IBM Plex Serif), the brand mark color, horizontal heavy borders only |
| `color.ink` | #1A1F2C | Body text, default UI text |

`color.ink.deep` does *not* draw vertical edges between zones anymore. It draws horizontal breaks where structure genuinely lives (top-bar bottom edge), and it is the ink color for display type.

**Neutrals — warm editorial ladder (v0.5.1, paled):**

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.surface.page` | **#F7F2E8** | **#161514** | The page background. Light: paler warm parchment. Dark: warm near-black, not slate. Gutters between floating panels reveal it. |
| `color.surface.canvas` | **#FFFFFF** | **#1F1D1B** | Center work surface card background. The brightest surface in light mode; one tier above page in dark mode. |
| `color.surface.panel` | **#FCFAF3** | **#1B1A18** | Left rail card, right context panel card. Sits *between* page and canvas in tonality. |
| `color.surface.raised` | **#FFFFFF** | **#272421** | Popovers, dropdowns, modals — surfaces that float *over* everything. Slight shadow distinguishes from `canvas`. |
| `color.surface.subtle` | **#F2EEE3** | **#2A2724** | Secondary fills *inside* a panel (selected-row backgrounds without a color tint, code blocks, inline neutral chips). |
| `color.text.muted` | #6E7480 | #8E8B86 | Helper text, captions, metadata |
| `color.text.secondary` | #3F4654 | #C9C5BE | Body text on panel/canvas surfaces |
| `color.text.primary` | #1A1F2C | #F5F1E8 | Default text — note dark-mode text is warm off-white, not pure white |

Note the dark-mode surfaces are **warm dark**, not cool slate. Same editorial-warm tone, just inverted. Pure black + cool gray would make the dark mode feel like a different product. The relationship between `page → panel → canvas → raised` is preserved in both modes: each tier is one step brighter than the one below.

The structural move: the three workspace zones are no longer adjacent areas of a single canvas. Each is a card. The page background shows between them. That's the modular-floating-surfaces pattern the project owner pointed at with Typeform — same pattern Linear uses in its Issues view, same pattern Miro uses in its board chrome.

`canvas` (work surface) and `panel` (rails) are deliberately close but distinct — enough warmth difference that the eye reads them as separate surfaces; not so much difference that the side panels feel like they're another color entirely.

**Borders — three tiers, modular-surface use (v0.5.1):**

| Token | Light | Dark | Weight | Use |
| --- | --- | --- | --- | --- |
| `color.border.heavy` | **#1A1F2C** | **#F5F1E8** | 1.5px or 2px | Reserved. Rare. Editorial gravity moments (preregistration banner top edge, published-version header). Not for outlining floating panels. |
| `color.border.medium` | **#94A0B5** | **#5F5B55** | 1px | Sub-section dividers within a panel, table row separators, rail-nav group separators. Horizontal preferred. |
| `color.border.subtle` | **#E6DFD2** | **#322E2A** | 0.5px or 1px | Floating panel outlines, input borders, card outlines within a panel. |

Why heavy is now reserved: the modular-floating-panels pattern carries the structural work via the *gap between panels*. Each panel's own subtle border + radius + warm background is enough to read as a discrete surface. Heavy rules become a special move you reach for only when something genuinely deserves editorial weight.

**Functional palette (TRUE vibrancy preserved from v0.4; `.subtle` washes nudged warm to sit on the parchment page):**

| Token | Hex | Use |
| --- | --- | --- |
| `color.success` | **#22C55E** | Validation passes, status indicators — true emerald |
| `color.success.subtle` | **#E6F6DC** | Success badge background, warm-leaning pale wash |
| `color.success.text-on-subtle` | #14532D | Text on success badge |
| `color.warning` | **#F59E0B** | Warning text and icons — amber, vivid |
| `color.warning.subtle` | **#FBEFCF** | Warning badge background |
| `color.warning.text-on-subtle` | #78350F | Text on warning badge |
| `color.danger` | **#EF4444** | Destructive actions, error text — true red |
| `color.danger.subtle` | **#FBE0DA** | Error badge background, warm-leaning pale wash |
| `color.danger.text-on-subtle` | #7F1D1D | Text on error badge |
| `color.info` | **#0EA5E9** | Informational notes (uses the accent directly) |
| `color.info.subtle` | **#DDEFFB** | Info badge background |
| `color.info.text-on-subtle` | #0E5879 | Text on info badge |

The full saturated tokens are unchanged from v0.4 — the project owner explicitly said the intensity was fine. The `.subtle` washes got a small warm nudge so they don't sit on the parchment page as cool islands. Pairing rule preserved: vivid full tokens only on icons, dots, text, focus rings; bigger surfaces use the `.subtle` pale wash with the dark text on top.

**Category palette (TheyDo pattern, unified saturation — still two-stop):** chips draw from the same `.subtle` + `text-on-subtle` pairs as everything else. No new color values — categories ride on the polarized ramp.

- Misinformation theme: primary-leaning (`color.primary.subtle` + `text-on-subtle`).
- Source-cue: success-leaning.
- Engagement: warning-leaning.
- Replication: accent-leaning.

### Color rules (v0.5.1)

- No more than **one accent color** in the active surface at a time.
- No gradients on product surfaces (gradient is allowed in marketing only).
- Category color is **always paired with a label** — never color alone as the categorical signal (accessibility floor).
- Text contrast meets WCAG AA at minimum; AAA on primary content.
- **Light + Dark both ship in V1** with user toggle and System-auto default. See Themeability section below.

## Themeability

The visual surface is **theme-driven**. Tokens (color, type, spacing, radius, shadow) are the source of truth; a theme is a *bundle of token values*. Switching themes swaps the bundle; nothing else changes.

This has two payoffs:

1. **User-facing:** Light + Dark + System (auto-follow OS preference) ship in V1. User toggle in account settings; persisted per user.
2. **Internal-only:** We can keep additional themes around as design-exploration tools — try a "modern cool" theme, a "minimal monochrome" theme, etc., without disturbing the production app. Lets us audit decisions in isolation rather than gut-checking changes against a single locked surface.

### V1 user-facing themes

| Theme | Status | Use |
| --- | --- | --- |
| **Editorial Light** | Default | The warm-parchment theme this brief specifies. Light mode. |
| **Editorial Dark** | Ships V1 | The warm-dark variant (warm near-black surfaces, off-white text). |
| **System** | Ships V1 | Follows OS preference via `prefers-color-scheme`. Default for new users. |

No third user-facing theme in V1. Adding more user themes is a follow-up decision after we see whether users actually want them. Most professional tools (Linear, Figma, Notion) ship light + dark + system and nothing else.

### Internal exploration themes

Define alongside Editorial Light/Dark in `03_design/design-system/themes/`. Never reach production — switched on via a dev-mode panel or a query string (`?theme=cool-modern`). Each exploration theme:

- Reuses the same token *names*; only values change.
- Forces us to reckon with whether a UI decision depends on the *current* visual language or on something more universal.
- Lives until it's either promoted (rare, formal decision) or archived (most of the time).

### Architecture

Implementation sketch (final structure lives in the design-system tokens file and an ADR):

- Tokens stored as CSS variables on `:root` (or a `data-theme="dark"` selector for dark).
- A `ThemeProvider` reads the user's preference (DB-persisted, localStorage-cached) and sets `data-theme`.
- `prefers-color-scheme: dark` is honored when the user's preference is `system`.
- All component styles reference variables, never raw hex.
- The dark-mode column in every token table above is canonical — those are the values the `data-theme="dark"` bundle uses.

This may earn its own ADR once Build starts (ADR-0010 candidate: theming + token system). Right now it's a brief commitment; the implementation details are simple enough to defer.

### Hard rules

- No raw hex anywhere in component code. Every color reaches a component through a token.
- Every new color decision adds both Light and Dark values in the same change. No "Dark TBD" tickets.
- Every screen gets a contrast check in both modes before handoff (`design:accessibility-review` skill on each).
- Exploration themes never block a production change. If a screen breaks under an exploration theme, the exploration theme is wrong, not the screen.

## Typography

**IBM Plex family — Serif, Sans, and Mono — used together intentionally.**

This is the locked decision (v0.2). Most SaaS tools use sans-only; using Plex Serif for headings gives us *editorial / academic* character that almost no competing tool has. Researchers read serif documents all day; using serif headings signals "we understand your world." It's the strongest single typographic differentiator we can make versus Qualtrics or PsychoPy.

- **IBM Plex Serif** — display + headings (h1, h2, document-style titles, blockquotes, editorial moments).
- **IBM Plex Sans** — body, UI labels, button text, captions, all functional UI text.
- **IBM Plex Mono** — code, JSON, formulas, identifiers (module keys, version strings, OSF DOIs, etc.), schema field names, anything that wants to read as "machine-known."
- **Weights used:** 400 (body), 500 (UI labels, button text, subheadings). No bolder than 500 for general UI — 700 reserved for hero / display where serif weight genuinely helps. No light weights. Italic only for inline citations or paraphrased quotes.
- **Loading:** via `@fontsource/ibm-plex-{sans,serif,mono}` — Plex is open-licensed (SIL Open Font License). No third-party CDN dependency at runtime.

### Type scale (v0.5 — Serif pushed into more roles)

| Token | Size | Family | Weight | Use |
| --- | --- | --- | --- | --- |
| `text.display` | 32-40px | **Plex Serif** | 500 | Page titles, study titles, editorial moments. Generous leading. The hero typography of the product. |
| `text.heading.1` | 22-24px | **Plex Serif** | 500 | Major section heads inside a panel — "Block 1 · Stimulus presentation," "Replications," "Quality flags." Serif here is the v0.5 move; v0.4 had Sans. |
| `text.heading.2` | 17-18px | Plex Sans | 500 | Subsection heads, card titles inside the right context panel. |
| `text.label` | 11-12px | Plex Sans | 500 | UI labels above values (`Status`, `Owner`, `Tags`), uppercase with `letter-spacing: 0.04em`. |
| `text.body` | 14-15px | Plex Sans | 400 | Default UI text |
| `text.body.emphasis` | 14-15px | Plex Sans | 500 | Labels, button text, selected-row text |
| `text.small` | 12-13px | Plex Sans | 400 | Captions, secondary metadata |
| `text.mono` | 13-14px | Plex Mono | 400 | Code, JSON, formulas, identifiers (`core/social-post@1.2.0`) |

The v0.5 commitment: **Plex Serif appears in every panel that contains substantive content** (study title in the work surface, section heads inside the right context panel, occasional editorial copy in empty states). It is no longer confined to h1. The result should feel like reading a well-typeset document rather than a tool dashboard.

Pairing rule: Serif never sits next to Mono in the same row (visual rhythm collides). Serif pairs with Sans for body, Sans pairs with Mono for code-adjacent UI.

Exact pixel values land in `03_design/design-system/type.md` after wireframes show the type in context.

## Spacing

**4px grid. Predictable, named, never arbitrary.** Per `00_meta/rules/design-rules.md`'s spacing notes (and what makes the system Claude-Code-friendly):

```
space.0  = 0
space.1  = 4px
space.2  = 8px
space.3  = 12px
space.4  = 16px   default body padding
space.5  = 20px
space.6  = 24px
space.8  = 32px
space.10 = 40px
space.12 = 48px
space.16 = 64px
space.20 = 80px
```

Semantic layers:

```
spacing.compact     = space.2   (tight: chip padding, inline gap)
spacing.cozy        = space.4   (default: form rows, card padding)
spacing.comfortable = space.6   (relaxed: section gap, dialog padding)
spacing.section     = space.12  (between major sections)
spacing.page        = space.20  (page-level gutters)
```

Components never hard-code pixel values for padding/margin/gap. Linter forbids arbitrary spacing classes.

## Radii, borders, shadows, motion

### Radii (v0.1)

- `radius.sm` = 4px (chips, small tags)
- `radius.md` = 6-8px (buttons, inputs, cards)
- `radius.lg` = 10-12px (modals, large panels)
- `radius.full` = 9999px (pills, avatars)

Default to `radius.md` everywhere; reach for the others deliberately.

### Borders (revised v0.4 — three tiers, verticals restricted)

- **Heavy** (1.5-2px, `color.border.heavy` `#1A1F2C`) — **horizontal structural breaks only**. Bottom edge of top bar, divider between major stacked form sections, top edge of a preregistration banner. Never as a vertical right-rail edge — that's an AI-mockup trope. Vertical zone separation is the job of `color.surface.sunken` vs `color.surface.canvas`, not a heavy line.
- **Medium** (1px, `color.border.medium` `#94A0B5`) — sub-section dividers within content, table row separators, sidebar group separators. Horizontal use preferred.
- **Subtle** (1px or 0.5px, `color.border.subtle` `#DDE1E8`) — within-element borders (input borders, card outlines). Softest seam fallback if a faint vertical hairline is needed at all (mobile-tablet collapse only).
- Focus rings: 2px in `color.primary` `#1747C9` with a 1px white inner gap on dark surfaces.

The graphic structure of the app comes from background tint + heavy *horizontal* breaks + breathing room. Heavy vertical rules between zones are explicitly out.

### Shadows

Subtle elevation only. Three steps:

- `shadow.sm`: drawer shadow, dropdown
- `shadow.md`: modal
- `shadow.lg`: rare; only on free-floating overlays

No drop-shadows on cards by default. Card boundaries come from a 1px border, not a shadow.

### Motion

Purposeful and quiet. Three durations:

- `motion.fast` = 120ms (hovers, color changes)
- `motion.base` = 200ms (drawer slides, panel toggles)
- `motion.slow` = 320ms (modal in/out, page transitions)

Easing: `cubic-bezier(0.2, 0, 0, 1)` for entrances, `cubic-bezier(0.4, 0, 1, 1)` for exits. Reduced-motion users get zero animation; everything is instant.

## Layout system

**Three-zone modular layout — floating panels on a warm page, with study-scoped chrome floating directly over the work surface (v0.5.3).** The Miro / FigJam board pattern, adapted for an authoring tool.

```
+----------------------------------------------------------------+
|  page background — warm parchment #F7F2E8                      |
|                                                                |
|  +----------------------------------------------------------+  |
|  |  TOP BAR (slim floating cap — global chrome)             |  |
|  |  [workspace · breadcrumb]              [⌘K · Save · ●]   |  |
|  +----------------------------------------------------------+  |
|                                                                |
|  +-----+  +-----[ STAGE TABS pill ]------+  +-----------------+|
|  | RAIL|  +------------------------------+  |  RIGHT CONTEXT  ||
|  |     |  |   CENTER WORK SURFACE        |  |  PANEL          ||
|  |     |  |   (canvas / content)         |  |                 ||
|  |     |  |                              |  |                 ||
|  +-----+  +------------------------------+  +-----------------+|
|                                                                |
+----------------------------------------------------------------+
```

The structural rules:

- **Each zone is its own card.** Has a background (`canvas` white for the work surface, `panel` warm cream for the side rails and top bar), a `border.subtle` outline, `radius.lg` rounded corners, no default shadow.
- **Page background shows between cards.** 12-16px gutter on every side. The warm `surface.page` framing is the canvas the cards float on. This *is* the modular feel — no abutting edges anywhere.
- **The top bar is a slim floating card carrying global chrome only.** Workspace switcher + breadcrumb on the left; ⌘K + Save (when on a study) + user menu on the right. No stage tabs, no object-level sub-modes — those belong inside their object's column.
- **The center column is a stacked pair when an object has sub-modes:** stage-tabs pill on top + work surface card below, with a small gutter between them. The pill spans only the center column's width — not the full page width. Left rail and right context panel cards flank the stack and extend to the same top edge as the pill, so the three columns visually align.
- **When the user is on a destination (no study object) or on an object without sub-modes:** the stage-tabs pill is omitted; the work surface card occupies the full center column height. The top bar's right slot collapses to ⌘K + destination action + user menu.
- **Left rail** card is workspace navigation: top-level destinations, sub-nav, user shortcut. Sits on `panel` cream. Persists across all destinations (only the active state changes).
- **Center work surface** card is where the active object's content lives — a study being built, a Framework being browsed, a Library list. Renders differently per the active object's mode (Builder vs. Whiteboard for studies). White `canvas`.
- **Right context panel** card is the *selected-item drawer* and/or the *live preview*. Contextual; collapsible. Sits on `panel` cream.

### Why stage tabs float above the center column (the v0.5.3 fix)

The first wireframe pass put stage tabs in a separate full-width strip *between* the top bar and the side rails. The project owner caught the scope-hierarchy disconnect — stage tabs are study-scoped but the sidebar is workspace-global; adjacent full-width rows implied the same hierarchy level, which is wrong.

v0.5.2 moved stage tabs into the top bar's center slot (Typeform pattern). That worked but reintroduced a dense full-width band that pulled against the brief's modular-floating-panels spirit.

v0.5.3 instead floats the stage-tabs pill directly above the center work surface card — spanning only the center column's width, not the full page. The reading is: *each column is a module, and the center module owns its own mode-picker on top*. Three benefits:

1. **Modular spirit reinforced.** The page reads as three floating modules (rail · study column · context) on a parchment board. No full-width band cuts across them.
2. **Spatial logic for sub-modes.** The pill sits *over* the work surface it controls. Clicking `Preview` makes the content below change; the pill doesn't move. Visual cause-and-effect is immediate.
3. **Editorial slimness for the top bar.** The top bar stays quiet, carrying only global chrome. The warm parchment page reads more editorial when the top is light.

The model for future surfaces with sub-modes (Framework detail with `Overview · Used in · Versions`, Library module with `Schema · Used in · Versions`, etc.): same pattern — a floating pill above the work surface card, spanning only the center column.

### Customization

V1 user-customizable surfaces:

- Collapse / expand each zone (rail, right panel) — saved per user per project.
- Resize zone widths (drag handles between zones) — saved per user.
- Pin which right-panel tabs are visible (selectable subset of a defined list).

NOT in V1: full Notion-style "drag any panel anywhere." Too expensive; not needed.

### Responsive behavior

- **Desktop (≥1280px):** full three-zone layout.
- **Tablet (768–1279px):** right panel becomes an overlay drawer (slides over center on demand). Left rail collapses to icons by default.
- **Mobile (<768px):** linear single-column. Bottom nav for the rail's primary destinations. Right-panel content surfaces via dedicated screens or sheet modals. Center surface adapts (builder works fine; whiteboard becomes view-only with pan/zoom).

We design at desktop first because the daily-operator personas (Hanna especially) work at desktop. But mobile *must* work for participants taking studies; that's a different surface (participant-facing) with its own rules.

## Top-bar navigation

The top bar is slim and carries **global chrome only** — no object-level sub-modes. Two slots in a single horizontal band:

| Slot | When user is on a destination | When user is on a study object |
| --- | --- | --- |
| **Left** | Workspace chip (with switcher chevron) + breadcrumb (`Misinformation Lab · Studies`) | Workspace chip + breadcrumb (`Misinformation Lab · Studies · Source-cues study`, last segment in Plex Serif) |
| **Right** | ⌘K search + destination action (e.g. `+ New study`) + user menu | ⌘K search + Save button + user menu |

Object-level sub-modes (the six stage tabs for a study: `Build · Preview · Share · Preregister · Run · Results`) **do not live in the top bar**. They live as a floating pill card above the center work surface, inside the study's column. See the Layout system section for the rationale.

The model is: top bar = global identity + navigation + actions on whatever object is open; center-column-top pill = sub-modes of the current object. Two clean tiers.

Breadcrumb reads left-to-right; click any segment to navigate up. The workspace chip is the Linear-style switcher dropdown locked in IA v0.2.

## Right context panel — patterns

The right panel adapts to the current selection and mode. It has at most three states:

1. **Selected-item drawer** — when the user has selected something in the center (a module, a block, a question, a fork, an asset). Shows properties + tabs for related artifacts. TheyDo-inspired.
2. **Live preview** — when the user is in an authoring view that has a participant-facing surface (building an experiment, editing a question). Shows what the participant sees. Maze-inspired.
3. **Both, stacked** — when there's room (desktop wide). Properties top, preview bottom.

Tabs at the top of the drawer (Details · Preview · Comments · History) let the user pick. Pin-mode (user setting) controls default.

## Two creation modes (Builder + Whiteboard)

Per project-owner direction and Typeform's Build/Logic example. **The underlying data is the same** — modules + connections + theme overlay — only the rendering differs. ADR-0001's modular composition makes this work without duplicate stores.

- **Builder mode** is sequential, form-y, and predictable. Block list on the left (or as the center column), focused editing in the center. Best for: writing question copy, configuring module parameters, picking from a library.
- **Whiteboard mode** is spatial, free-form, and zoom-able. Nodes are modules, edges are flow/logic. Best for: designing the overall flow, branching logic, complex randomization. Pan + zoom + minimap (when graph is large). React Flow from STACK.md is the right substrate.

A mode toggle lives in the top bar. Switching is instant. State (selected node, scroll position, current step) is preserved per mode.

## Components — high-level commitments

These are direction, not specs. Specs come in `03_design/design-system/` after a wireframe pass.

- **Buttons** — three weights: primary (accent fill), secondary (border, transparent fill), ghost (text-only with hover). One size at default; a "small" variant for in-context actions.
- **Inputs** — single-line, multi-line, select, combobox. Consistent height; consistent focus ring; consistent error treatment (red text below the input, never red border alone).
- **Cards** — 1px border, no default shadow. Padding `spacing.cozy`. Title row + content rows; consistent vertical rhythm.
- **Tags / chips** — small radius, muted color, never standalone (always with label or icon).
- **Modals** — large radius, modest shadow, dim backdrop. Footer with destructive-on-left, primary-on-right (Cancel + Save). Header with title + close icon.
- **Drawers (right)** — slides from right, full height, contextual content, dismissible by clicking outside or pressing Escape.
- **Toasts** — bottom-right, auto-dismiss, three intents (success / info / error). No sound. No celebratory toasts for routine actions.
- **Tabs** — underline indicator (not pill) for top-level tabs. Pill tabs are reserved for filters and segmented controls.

## Empty states, errors, loading

Per Sofia's "show your workings" insight: states are where credibility lives.

- **Empty states** orient the user and offer a next step. Copy explains *why* the area is empty plus *what to do*. TheyDo's evidence empty state is a good template.
- **Loading states** indicate progress, not just spinning. For long operations (asset freeze, OSF push) show stage-by-stage progress.
- **Error states** never blame the user. They say what happened, why if known, and what to do next. They preserve the user's input.

## Accessibility floor

Per `00_meta/rules/design-rules.md`:

- WCAG 2.1 AA minimum on every screen.
- Keyboard reachable in a sensible order.
- Focus visible everywhere; never removed without a replacement.
- Touch targets ≥ 44×44px.
- `prefers-reduced-motion` respected — animation duration = 0.
- ARIA used to clarify, not to retrofit semantics.

Run `design:accessibility-review` skill on every screen before handoff.

## What's NOT decided yet

Open questions after v0.5.1:

- **Final surface tone.** v0.5.1 paled the parchment; project owner explicitly wants to decide on final tone alongside wireframes, not in isolation. Wireframes inherit `surface.page #F7F2E8`; if it still reads creamy in context, dial paler again (candidate: `#F9F5EE`).
- **Customization beyond zone-collapse and tab-pin.** Notion-style full rearrangement is out of V1; revisit when we see real user behavior.
- **Participant-facing visual language.** The brief above is for the *researcher-facing* surfaces. The participant experience (study taking) has its own design language considerations: trust, neutrality, no cognitive load, mobile-first. Separate brief.
- **Whiteboard expressiveness ceiling.** How much editing happens in whiteboard mode vs. requires drop to builder. Affects React Flow customization scope. Wireframe pass will surface this.
- **Theming ADR (ADR-0010 candidate).** The Themeability section is committed at brief-level; whether it earns an ADR depends on what the wireframes and the tokens file reveal about edge cases (e.g., images in dark mode, embedded participant-facing previews).
- **Exact hex calibration.** Values above are v0.5.1-locked direction. Minor adjustments expected as real surfaces get built and contrast-tested against IBM Plex's letterforms and the actual content density. Anything >5% HSL shift gets logged in the changelog.

## What comes next

1. **Project owner reviews this brief**, picks accent + typeface direction, flags anything that doesn't match the vision.
2. **First IA pass** — what's at the top of the left rail, what the breadcrumb actually says for each major surface.
3. **First wireframes** anchored on Hanna's "build a study" flow and Maya's "review and preregister" flow. Builder mode first; whiteboard mode comes next pass.
4. **Tokens get concrete** — exact hex values, type sizes, ramps fully specified in `03_design/design-system/tokens.md`.
5. **Component library specs** — buttons, inputs, cards, etc., with all states.
6. **Storybook + Token Studio sync** — when we reach Build (Phase 5).

## Sources and traceability

- `03_design/inspiration/2026-05-28-first-batch.md` — visual evidence behind this brief.
- `00_meta/rules/design-rules.md` — design discipline and process rules.
- `02_product/product-brief.md` §1 (positioning), §8 (lead-with-provenance narrative).
- `02_product/personas/*` — the people the design is for.
- `04_architecture/adrs/0001-modular-composition-theme-overlays.md` — modules + theme overlays = builder/whiteboard duality is structurally possible.
- `STACK.md` — Tailwind + shadcn/ui (Radix) + React Flow are the implementation substrate.
