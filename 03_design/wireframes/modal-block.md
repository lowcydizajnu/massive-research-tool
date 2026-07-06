# Wireframe spec — Modal block (Builder + take render)

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

A stimulus block that shows a participant a **modal dialog** — a centered card over a backdrop, with an optional image, text, and up to two buttons that can advance the study or just close — for consent/cookie/paywall/system-dialog paradigms and dark-patterns research. Implements ADR-0096, reusing the ADR-0095 overlay/trigger seam. Covers the Builder Configure panel + the participant take render.

## Layout

**Take render** — a semi-transparent **backdrop** covering the take viewport, with a centered **dialog card**: an optional **image** (top / left / right of the text), a **title**, **body**, a **✕ close** (when dismissable, top-right), and a **button row** (0–2). Focus is trapped inside the dialog.

**Builder Configure panel** — a live-preview editor (like the notification / social-post editors): Content (title, body), Image (upload + position), Buttons (0–2 rows: label + action picker), Behaviour (dismissable, trigger), plus an "imitates a real product" toggle with the deception attestation. A live preview renders the real modal inline (not floating) in the panel.

## Content inventory

- **Backdrop** — static overlay; click to close when dismissable.
- **Image** (optional) — R2 upload; `imagePosition` = top / left / right — config.
- **Title** — short text — config, ≤ ~120 chars.
- **Body** — one or more short paragraphs — config, ≤ ~1000 chars.
- **✕ close** — shown when `dismissable` — records `dismissed`.
- **Button × 0–2** — label + **action**: **Advance** (close + go to the next screen), **Stay** (close only), **External link**, **Another study**, or **This study — a screen** (reuses the CTA nav-target).
- **Deception notice + attestation** (when `imitatesReal`) — mirrors the branded social-post / custom notification gate.

## States

- **Default (Builder)** — empty title/body, no image, one Advance button, dismissable, on-load; "needs setup" until title or body is filled (and the attestation when `imitatesReal`).
- **Take — on-load / after-delay / conditional** — the modal appears per the trigger (after-delay via a client timer; conditional via the block's `showIf` / RevealGate). Reduced-motion: fade, no scale-pop.
- **Open** — backdrop + centered card, focus trapped (Tab cycles within), Esc closes when dismissable.
- **Advance clicked** — records `advance`, closes the modal, and submits the current screen (the same as clicking Continue) → next screen.
- **Stay clicked / dismissed** — records `stay` / `dismissed`, closes the modal, participant remains on the screen.
- **CTA (link/study/screen) clicked** — records `cta:<i>`, navigates per the nav-target.
- **Error (Builder)** — a button with an empty label, or `imitatesReal` without the attestation, shows an inline note; block stays "needs setup".

## Interactions

- **✕ / backdrop / Esc** — close the modal (records `dismissed`); only when `dismissable`. Focus returns to the take surface.
- **Advance button** — closes, then triggers the screen's Continue control (`[data-take-continue]`) so branching + answer recording behave exactly as a normal Continue.
- **Stay button** — closes only.
- **Link / study / screen button** — navigates per `resolveNavTarget` / `resolveScreenHref` (new tab for external; same tab for study/screen).
- **Builder image position** — top / left / right radio; the live preview reflows.

## Edge cases

- **No dismiss + no advance button** — guard against a trap: if the modal isn't dismissable, at least one button must advance (the Builder warns; otherwise the participant is stuck).
- **Tall content on a small viewport** — the dialog body scrolls inside the card; the backdrop doesn't scroll the page behind it.
- **Very long title / button label** — truncate / wrap; the card has a max width and max height.
- **Image fails to load** — the layout collapses gracefully to text-only.
- **Reduced motion** — no scale/slide; just an opacity fade.
- **Screen readers** — the dialog is announced (`role="dialog"` + `aria-modal="true"` + a labelled title); focus moves into it on open.

## Accessibility notes

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title; focus trap while open; Esc to close (when dismissable); focus restored on close.
- Buttons are real `<button>`s; the ✕ has an `aria-label`. Backdrop click is a convenience, not the only close path (the ✕ is keyboard-reachable).
- Respect `prefers-reduced-motion`; never rely on colour alone.

## Open questions

- Should `advance` on a required-but-unanswered screen be blocked (the screen's own validation would reject the Continue)? (Proposed: yes — advance goes through the real Continue, so required-field validation applies, and the modal reopens with the validation message. Confirm the UX.)
- Do we want a max modal count per screen (one for v1) and z-index rules if a Notification + Modal coincide? (Proposed: one modal per screen in v1.)
- `on-action` trigger (open after interacting with another block) — deferred; confirm demand.
