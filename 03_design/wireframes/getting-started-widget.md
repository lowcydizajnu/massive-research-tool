# Wireframe spec — Getting-started widget (personal Home)

- **Serves user flow:** [Getting-started checklist](../../02_product/user-flows/getting-started-checklist.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

One card on the personal Home dashboard that shows how far the researcher has
gotten through the product's core loop and links each undone step to the surface
where it happens.

## Layout

A standard Home dashboard widget card (same `Card` treatment as the other
personal widgets — title row, body). Body is a single-column list of 8 rows,
one per step, in the canonical order. A one-line progress summary sits under
the title. No imagery, no illustration — it must read as quiet as the
recent-studies card, not as a promo.

## Content inventory

- **Title** — "Start here" (static).
- **Progress line** — "N of 8 done" (computed server-side); switches to
  "You're all set — remove this card anytime from Customize." when N = 8.
- **Step rows (8)** — each: state glyph (✓ done / ○ undone), label, and — when
  undone — the label is a link to the target surface. Labels (researcher-native,
  per design-rules vocabulary):
  1. Create your first study → /studies
  2. Add your first block → the newest authored study's Build tab, else /studies
  3. Preregister or publish → the same study's Run tab (where the Preregister /
     Publish actions live), else /studies
  4. Open recruitment → same study's Run tab, else /studies
  5. See your first results → same study's Results tab, else /studies
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
- **Success** — all 8 done: progress line swaps to the all-set copy; rows all
  muted ✓; card remains until the user removes it via Customize.

## Interactions

- **Undone step label** — link; navigates to the target surface listed above.
  No optimistic ticking: state only changes when the underlying data exists on
  the next Home render.
- **Card removal / re-add / reorder** — entirely via the existing dashboard
  Customize mode (no bespoke dismiss control on the card itself).

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
