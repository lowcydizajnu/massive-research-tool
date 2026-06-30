# Wireframe spec — Social-post builder — Facebook anatomy

- **Serves user flow:** [build-social-post-stimuli](../../02_product/user-flows/build-social-post-stimuli.md)
- **IA placement:** [Studies › study › Design › Social](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Define the full Facebook-post anatomy a researcher can recreate and the participant sees — header, body, reactions (all seven), action bar, comment thread, composer, custom slots — so the builder controls and the take renderer agree on one model.

## Layout

Top-to-bottom zones of the rendered post (the right-hand preview in Design → Social, and the participant render via the `facebook` `getBlockOverride`). Each zone maps to fields in `theme.socialPost` / block `config` (see [data model 07](../../04_architecture/data-model/07-social-post-design.md)).

```
┌───────────────────────────────────────────────┐
│ [HEADER]  avatar · name ✔(verified) · [slot: header-badge]   ⋯ │
│           timeLabel · audience-icon                              │
│ [slot: sponsored-label]                                          │
├───────────────────────────────────────────────┤
│ [BODY]    text (headline/body) · image/link-card                │
│ [slot: below-body]                                              │
├───────────────────────────────────────────────┤
│ [REACTION SUMMARY]  👍😆 + "Copy By Perpetua and 2.2K others"   │
│                     202 comments · 117 shares                   │
├───────────────────────────────────────────────┤
│ [ACTION BAR]   👍 Like   💬 Comment   ↪ Share                   │
│                (hover Like → 7-reaction picker)                  │
├───────────────────────────────────────────────┤
│ [slot: pinned-comment]                                          │
│ [COMMENTS]  composer (avatar + "Write a comment…" + icons)      │
│   ◦ Top fan · Joan H-S ✔ · body · 👍 N · Like · Reply · 1d      │
│       ↳ reply (one level)                                       │
│   "View more comments"            "1 of 98"                     │
└───────────────────────────────────────────────┘
```

The post renders inside the participant theme tokens (ADR-0024) and, for `layout`/`branded` tiers, the decorative page frame (`getPageFrame`). The `branded` tier swaps the initials avatar / adds the researcher-uploaded logo where the chrome calls for it.

## Content inventory

- **Header** — avatar (researcher source initials, or uploaded image), author name, **verified badge** (toggle), `timeLabel`, audience icon (globe), overflow "⋯" (decorative). Sources: block `config` (author/handle/time), `theme.socialPost`.
- **Custom slot: header-badge** — e.g. "Top fan"/"Follows you" chip. → `slots[region=header-badge]`.
- **Custom slot: sponsored-label** — e.g. "Sponsored · Suggested for you". → `slots[region=sponsored-label]`.
- **Body** — `headline`/`body` text; `imageUrl` (single image) or link-card (title/desc/source); v1 content types: **text, image, link-card** (video/carousel deferred).
- **Custom slot: below-body** — e.g. a custom CTA button (display-only). → `slots[region=below-body]`.
- **Reaction summary** — emoji cluster + "{seeded names} and N others" + comment/share counts. Counts from `config.likesCount/commentsCount/sharesCount`; toggle via `showReactionSummary`.
- **Action bar** — React / Comment / Share buttons (each toggleable via `actionBar`). The **React** control reveals the **seven-reaction picker** (Like/Love/Care/Haha/Wow/Sad/Angry) on hover/long-press; the chosen reaction replaces the Like glyph.
- **Custom slot: action-bar** — an extra action (e.g. "Save"), display-only. → `slots[region=action-bar]`.
- **Comments thread** — seeded comments: avatar, author, **top-fan** chip, verified, body, `reactionCount`, per-comment reactions, Like/Reply/time; one level of nested replies; "View more comments"; "N of M" position label. → `theme.socialPost.comments`.
- **Composer** — participant avatar + "Write a comment…" input + icon row (emoji/photo/GIF/sticker, decorative unless the study collects a comment). → `theme.socialPost.composer`.
- **Custom slot: pinned-comment** — a fixed comment above the thread. → `slots[region=pinned-comment]`.

## States

- **Display-only** (`reactionsLive=false`) — reactions/comment render but collect nothing; the picker still demos on hover but no selection persists.
- **Live/measured** (`reactionsLive=true`) — the reaction picker is a real input (single-select, deselectable); Like/Share are toggles; the composer collects a comment. Posts via hidden inputs with the screen form (scoped `reaction-toggles` client, ADR-0013 exception).
- **Branded tier** — uploaded logo shown in chrome; missing logo → no-logo fallback + preflight flag.
- **Empty thread** — comments disabled → only composer (or nothing if composer disabled).
- **Overflowing counts** — large numbers abbreviated (2.2K, 1.1M).

## Interactions

- **Reaction pick** (live): hover/focus React → picker reveals 7 reactions → select one → glyph + summary update; re-selecting the same → deselect. Keyboard: React is focusable; picker is an arrow-navigable `radiogroup`; Esc closes.
- **Like/Share** (live): toggle; optimistic count +1/−1 (the existing reaction-toggles behavior).
- **Comment** (live): typing into the composer captures `response.comment`; emotion analysis (existing `emotionAnalysis` config) may run on submit.
- **Seeded content** is never interactive for the participant (static).

## Edge cases

- A reaction disabled in `reactionsEnabled` must not appear in the picker nor be selectable.
- Seeded comment with a deleted avatar key → initials fallback.
- Long names/handles/comment bodies → truncate per FB conventions; full text in title attr where helpful.
- Right-to-left body text → mirror layout (inherit dir from theme).
- `branded` with a non-image logo asset (e.g., deleted) → fallback + preflight flag.

## Accessibility notes

- The seven reactions each have an accessible name (not emoji-only); selection state is announced (`aria-pressed`/`aria-checked`).
- The picker traps focus while open, returns focus to React on close, and is operable by keyboard (Enter/Space to open, arrows to move, Enter to pick, Esc to close).
- Decorative chrome (header overflow, audience icon, frame) is `aria-hidden` (ADR-0024 page-frame precedent).
- Counts read as text (e.g., "202 comments"), not just glyphs.
- Color is never the sole carrier of reaction identity (icon + label).

## Open questions

- Long-press vs hover for the picker on touch — assumed long-press (and a tap-to-open fallback).
- Do we measure *which* reaction (chosen-reaction column) by default when live, or only like/share? (Assumed: capture chosen reaction; see data model.)
- Nested replies depth — v1 one level; confirm two isn't needed for the misinformation framework.
