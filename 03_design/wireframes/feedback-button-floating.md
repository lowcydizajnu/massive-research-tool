# Wireframe spec — Feedback button (floating)

- **Serves user flow:** [Provide product feedback](../../02_product/user-flows/provide-product-feedback.md)
- **IA placement:** [App shell — global affordances](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

> One sentence: what this screen exists to do.

A persistent, low-friction affordance — present on every authenticated page — that opens the feedback modal.

## Layout

> Layout zones.

- A single fixed, circular button anchored bottom-right of the viewport, ~24px from the bottom and right edges.
- Sits above page content but **below** modals/dialogs (z-index between content and the dialog layer).
- Never rendered in the participant runtime (`/take/*`) per ADR-0014, and not on the auth/legal public surfaces (only inside the `(app)` shell).

## Content inventory

> Every piece of content visible.

- **Icon** — a chat/feedback glyph (💬 / speech-bubble). Static. ~20px inside a ~48px target.
- **Accessible label** — "Send feedback" (visually hidden; the button is icon-only). Static.
- **Tooltip (optional)** — "Send feedback" on hover. Static.

## States

- **Default** — round button, warm `surface.panel` background, brand-color border, subtle shadow.
- **Hover/focus** — lifts slightly (shadow + translateY), visible focus ring.
- **Loading** — n/a (purely a trigger).
- **Empty / Partial** — n/a.
- **Error** — n/a (errors live in the modal).
- **Open** — while the modal is open, the button may stay visible behind the scrim.

## Interactions

- **Button** — affordance: round floating control. Action: click / Enter / Space opens the feedback modal. System response: modal mounts, focus moves into it. Error path: none.

## Edge cases

- Very long content — n/a (icon only).
- Zero / many data — n/a.
- Slow network — n/a (opening is instant; submission is the modal's concern).
- Offline — button still opens the modal; submission failure is handled there.
- Permissions denied — only shown to signed-in users, so no denied state.
- Small viewports — stays pinned bottom-right; must not overlap other fixed affordances (e.g. cookie banner). When the cookie banner is visible it sits above it / out of its way.

## Accessibility notes

- `<button>` with `aria-label="Send feedback"`; keyboard-focusable in natural tab order.
- Visible focus ring (token-based), not just hover.
- `prefers-reduced-motion`: drop the lift animation.
- Hit target ≥ 44×44px.

## Open questions

- Whether to hide it inside the Builder's focused/zen mode. Deferred — show everywhere in the `(app)` shell for v1.
