# Wireframe spec — Getting-started widget (personal Home)

- **Serves user flow:** [Getting-started checklist](../../02_product/user-flows/getting-started-checklist.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

One card that shows how far the researcher has gotten through the product's core
loop and links each undone step to the surface where it happens.

## Layout

A **pinned card above the widget grid on BOTH dashboards** (personal `/home` and
workspace `/dashboard`) — NOT a customizable widget (ADR-0045 am. 2026-07-02), so a
saved layout can't hide it. Native card treatment (border, `surface.canvas`), a **×
dismiss control** in the top-right, a title + one-line progress summary, then the 8
steps in a **2-column responsive grid** (`grid-cols-1 sm:grid-cols-2`) so the short
labels fill the width instead of leaving dead space. No imagery — it reads as quiet
as the recent-studies card, not a promo.

## Content inventory

- **Title** — "Start here" (static).
- **Progress line** — "N of 8 done" (computed server-side); switches to
  "You're all set — remove this card anytime from Customize." when N = 8.
- **Step rows (8)** — each: state glyph (✓ done / ○ undone), label, and — when
  undone — the label is a link to the target surface. Labels (researcher-native,
  per design-rules vocabulary):
  1. Create your first study → opens the New-study modal (never navigates to
     /studies, so the first-run tour can't re-fire)
  2. Add your first block → the newest study's Build tab; **while no study exists,
     opens the New-study modal** (create-first). Carries a supporting line naming
     the shipped signature blocks: "Try a fully interactive Social post or a live
     AI conversation." (No Hume/voice — not shipped.)
  3. Preregister or publish → the same study's Run tab (where the Preregister /
     Publish actions live); no study → New-study modal
  4. Open recruitment → same study's Run tab; no study → New-study modal
  5. See your first results → same study's Results tab; no study → New-study modal
  6. Save a study from Browse → /browse
  7. Invite a teammate → /team
  8. Connect your OSF account → /settings/account (Connections)
- **Done rows** — muted text, no link, ✓ in the success token color.

## States

- **Default** — mixed done/undone rows as derived.
- **Loading** — none of its own; the widget is server-rendered with the page.
- **Empty** — not applicable (the 8 steps always render; a brand-new account
  simply shows 0 of 8 done).
- **Partial** — n/a (single query; it either resolves or errors).
- **Error** — the standard per-widget error card ("Couldn't load this widget"),
  isolated from the rest of Home.
- **Complete** — all 8 done: the card **stops rendering** (nothing to guide).
- **Dismissed** — the user clicked ×: the card stops rendering on both dashboards
  (persisted in `publicMetadata.dismissedGettingStarted`).

## Interactions

- **Undone step** — link / button per the routing above; deep-links switch the
  active workspace when the target study lives in another one. No optimistic
  ticking: a step flips only when the underlying data exists on the next render.
- **× (dismiss)** — top-right; hides the card immediately (optimistic) and
  persists `dismissedGettingStarted` so it stays hidden across devices/reloads.
  This is the only removal affordance — the card is not part of Customize.

## Edge cases

- Very long study titles never appear (steps link to surfaces, not named studies).
- Invited-teammate accounts: step 7 stays undone until a workspace they own has
  a second member — the flow doc records this as acceptable.
- Steps 2–5 target "the newest authored study" — with zero studies they fall
  back to /studies; with many studies the newest is used.
- Slow network / offline: server-rendered with the page; no client fetches.

## Accessibility notes

- The list is a semantic `<ul>`; each row's state is conveyed in text (visually
  hidden "done"/"not done"), not by glyph color alone.
- Undone-step links get the standard focus ring; done rows are plain text (not
  disabled links).

## Open questions

- None blocking. Copy reviewed against the design-rules vocabulary (Preregister,
  Recruitment, Browse, Workspace, Saved — no developer terms).
