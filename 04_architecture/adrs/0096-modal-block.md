# ADR 0096 — Modal block — overlay dialog with advance/stay + intra-study nav

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Paweł Rosner
- **Tags:** blocks, runtime, take, stimulus, deception, navigation

## Context

Second block in the simulated-app-environment family (ADR-0095, after Notification). The owner wants a **Modal**: "similar concept to the notification but more possible layouts with images and more text-formatting options; the participant can advance to the next page or stay on the current page; triggered conditionally, by a specific action, automatically by placement, or after some time."

ADR-0095 established the shared **overlay/trigger seam** (placement + trigger `on-load` / `after-delay` / `conditional-via-showIf`) and the typed **NavTarget** (`url` / `study` / `screen` — the same-study screen jump was added when the owner requested it on the Notification CTA). The Modal reuses all of that. What's genuinely new for the Modal:

1. A **centered overlay dialog** — a backdrop + a focused card in the middle of the viewport, with a focus-trap — rather than the Notification's inline/top toast.
2. **Richer content** — an optional image (top/left/right) and multiple text blocks, versus the Notification's title + one body.
3. An **"advance vs. stay"** outcome on its buttons: a button can *close the modal and advance the take flow* (submit the current screen → next screen) or *just close the modal and stay on the current screen*. The Notification never advanced.

Per the owner's standing directions this session: **minimum shared infra, extend as needed**, and route deception-bearing modals through the **same IRB-attestation gate** as social-post / the custom Notification.

## Options considered

### Option A — Reuse the Notification renderer with a "modal" position
- Add a `position: "modal"` to the existing notification block.
- **Pros:** no new block.
- **Cons:** conflates two distinct stimuli (a toast vs. a blocking dialog) in one config; the Modal needs backdrop/focus-trap/advance-vs-stay/image-layout that would bloat the Notification. Rejected — a separate block is clearer for researchers and cleaner in code.

### Option B — A dedicated `modal` block reusing the ADR-0095 seam (chosen)
- A new `modal` block: its own renderer (centered overlay + backdrop + focus-trap) and Configure editor, reusing the placement/trigger seam, the `NavTarget` (incl. the same-study screen jump), the deception gate, and the live-preview editor pattern.
- **Pros:** clean separation; reuses everything shared; the "advance vs. stay" outcome lives only where it belongs.
- **Cons:** a second overlay renderer — but it shares the trigger/timer/nav/gate helpers.

### "Advance" mechanism
- A modal button with `action: "advance"` closes the modal and **submits the current screen** (the same effect as the participant clicking Continue), so the take flow moves to the next screen with the normal submit + branch re-resolution. Implementation: dispatch a click on the screen's existing Continue control (`[data-take-continue]`) rather than a parallel navigation path — so branching/answer-recording/preview all behave exactly as a normal Continue. `action: "stay"` just closes the modal. This keeps the linear submit model intact (no bypass).

### Trigger scope
- `on-load` (auto by placement), `after-delay`, and `conditional` reuse the ADR-0095 seam unchanged. **`on-action`** (open the modal after the participant interacts with another block on the screen) is a *client* refinement that hooks the same tally the interaction-gate already uses; scoped to a later iteration if the first three cover the owner's cases. v1 ships `on-load` / `after-delay` / `conditional`.

## Decision

**We will add a dedicated `modal` block: a centered overlay dialog (backdrop + focus-trap) reusing the ADR-0095 overlay/trigger seam and `NavTarget`, whose buttons can advance the take flow or stay, with an optional image layout and the same deception gate as the Notification.**

Concretely, scoped to the Modal MVP:

- **Renderer** — a portal-free centered card over a semi-transparent backdrop, focus-trapped, dismissable by ✕ / backdrop / Esc when `dismissable`; respects reduced-motion; `role="dialog"` + `aria-modal`.
- **Content** — a title, body text, and an optional image with `imagePosition` (`top` | `left` | `right`).
- **Buttons (0–2)** — each has an `action`: `advance` (close + submit the screen → next), `stay` (close only), or a `NavTarget` (`url` / `study` / `screen`) reusing `lib/take/nav-target`.
- **Trigger + placement** — `trigger: on-load | after-delay | conditional` (the seam); the modal always renders as an overlay (no inline mode).
- **Recording** — like the Notification, it records the participant's action (`{ action: "dismissed" | "advance" | "stay" | "cta:<i>", atMs? }`, `collectsResponse: true`) and never *itself* blocks Continue (the researcher chooses whether the modal is dismissable).
- **Deception gate** — an `imitatesReal` toggle (default off); when on, the modal carries a deception warning + `deceptionAck`, folded into the same freeze hard-gate (`assertBrandingGate`) as branded social-posts and custom notifications.

## Consequences

- **Easier:** researchers get real modal dialogs (consent/cookie/paywall/system-dialog paradigms) with advance-vs-stay and image layouts; the family's shared seam proves out a second time.
- **Harder / new commitments:** a second overlay renderer (backdrop + focus-trap + Esc/backdrop close) to maintain; the "advance" mechanism depends on the screen's Continue control being present.
- **Committed to:** advance goes through the normal Continue (no submit bypass); the deception gate now spans social-post + notification + modal via one function.
- **Precluded (for now):** `on-action` trigger and multi-image / rich WYSIWYG formatting (basic text + one image in v1); stacking multiple modals.

## Revisit triggers

- Researchers need `on-action` opening, multiple images, or WYSIWYG text → extend the Modal.
- Multiple simultaneous overlays (a toast + a modal on one screen) need z-index/stacking rules → extend the overlay primitive.
- The advance mechanism proves brittle across screen layouts → give the runtime a first-class "advance current screen" action instead of clicking Continue.

## References

- ADR-0095 (the overlay/trigger seam + `NavTarget` this reuses), ADR-0084/0085 (the IRB deception gate reused via `assertBrandingGate` / `customNotificationsNeedingAck`'s sibling), ADR-0087/0088 (interaction gate + RevealGate).
- Code: `05_app/server/modules/registry.ts` (`notification` block — the sibling to mirror), `05_app/components/feature/take/notification-view.tsx` + `block-view.tsx` (renderer + dispatch), `05_app/lib/take/nav-target.ts` (`resolveNavTarget` + `resolveScreenHref`), `05_app/components/feature/builder/notification-config.tsx` (live-preview Configure pattern), `05_app/server/modules/branding-gate.ts` (deception gate), `05_app/components/feature/take/interaction-gate.tsx` (`[data-take-continue]`).
- Wireframe: `03_design/wireframes/modal-block.md`.
