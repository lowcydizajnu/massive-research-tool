# Wireframe spec — Preview (chrome-free, device-framed)

- **Serves user flow:** [hanna-run-and-read-results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Studies › study › Preview stage](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Show the researcher exactly what a participant sees — chrome-free and at common device widths — before running, so the instrument is checked in its real form (V1.12 A4).

## Layout

A full-viewport overlay (`fixed inset-0`, above the researcher TopBar/rail/stage-tabs). Two zones:

- **Control strip** (top, researcher-only): "Preview" label · device toggle (Desktop / Tablet / Mobile) · Share-link menu · Open-in-new-tab · ✕ Close.
- **Stage** (fills the rest): a centered card at the selected width on the dimmed page background, scrolling, rendering the study through the participant `BlockView`.

```
[ Preview  (Desktop|Tablet|Mobile)        Share link · Open in new tab · ✕ ]
            ┌───────────── device frame (960 / 768 / 390) ─────────────┐
            │  Preview ribbon · title · block 1 · block 2 · …          │
            └──────────────────────────────────────────────────────────┘
```

## Content inventory

- **Device toggle** — radiogroup, computed widths (Desktop 960 / Tablet 768 / Mobile 390). Static labels.
- **Share-link menu** — creates/lists/revokes public preview links (V1.12 I; from `previewTokens` router).
- **Open in new tab** — link to `/studies/<id>/preview` (same overlay, own tab).
- **Close ✕** — returns to `/studies/<id>/build`.
- **Preview ribbon** — static "nothing recorded" note.
- **Study title** — from server (`studies.get`).
- **Blocks** — every block via participant `BlockView`; conditional blocks all shown (no answers to branch).

## States

- **Default** — device = Desktop; blocks rendered.
- **Loading** — server component; the page resolves before render (no client loading state).
- **Empty** — no blocks → "No blocks yet — add some in Builder, then preview."
- **Partial** — n/a (single server fetch).
- **Error** — study not found → `notFound()`.
- **Success / optimistic** — n/a (read-only).

## Interactions

- **Device toggle** — click/arrow keys set the frame width; instant.
- **Share link** — opens a popover: "Create + copy link" (7-day token, copied to clipboard) + active-link list with Revoke.
- **Open in new tab** — opens the chrome-free preview in a new tab.
- **Close / ESC** — navigates to Builder.

## Edge cases

- Very long titles wrap; long blocks scroll within the frame.
- Zero blocks → empty copy. Many blocks → the stage scrolls.
- Slow network — server-rendered, so the overlay appears already populated.
- Offline — standard Next error boundary.
- Permissions — the route is workspace-scoped via `studies.get`; non-members hit `notFound()`. (The *public* shared link is the separate `/preview/<id>?token=` route, ADR-0026.)

## Accessibility notes

- Overlay is `role="dialog" aria-modal`; ESC closes; focus starts on the control strip.
- Device toggle is a `radiogroup` with arrow-key selection.
- Reduced motion: width changes are instant (no animated reflow required).

## Open questions

- Future max-fidelity option: iframe a live `mode:"preview"` session through `/take` for true per-question navigation (the "Open in new tab" affordance is the seam). Deferred.
