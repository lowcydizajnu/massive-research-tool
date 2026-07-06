# Wireframe spec — Notification block (Builder + take render)

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

A stimulus block that shows a participant an in-context **notification** (banner/toast) — with a type, optional CTAs, and a close affordance — so researchers can study reactions to system/app notices, alerts, and nudges (dark-patterns, deception-in-context). Implements ADR-0095. This spec covers both the Builder **Configure** panel and the participant **take** render.

## Layout

**Take render** — a horizontal notice: an optional left **thumbnail** (circular or square, `custom` variant only) or a variant **icon**, then a stack of **title** + **body**, then **0–2 CTA buttons**, and a right **✕ close** (when dismissable). Positioned either **inline** in the screen flow or **fixed to the top** of the take viewport (an overlay bar above the content). Variant drives the accent/background (error/warning/info/success via the existing semantic tokens; custom uses the neutral surface + the researcher thumbnail).

**Builder Configure panel** — sections: Type (variant select), Content (title, body), Thumbnail (upload; shown for `custom`), Call-to-action (0–2 rows: label + target picker), Behaviour (dismissable toggle, position toggle, trigger select). A live mini-preview mirrors the take render. A deception notice + attestation prompt appears for `custom`.

## Content inventory

- **Variant select** — error / warning / info / success / custom — config, drives icon + colour.
- **Title** — short text — config, ≤ ~120 chars.
- **Body** — one or two lines — config, ≤ ~300 chars.
- **Thumbnail** (custom only) — image (R2 upload) + shape (circle/square) — config.
- **CTA row × 0–2** — label (≤ ~40 chars) + target: **External link** (URL), **Another study** (study picker), — config. (Intra-study "screen" target deferred, ADR-0095.)
- **Close ✕** — shown when `dismissable` — static control.
- **Behaviour** — `dismissable` (bool), `position` (inline / fixed-top), `trigger` (on load / after N seconds / conditional).
- **Deception notice** (custom) — static warning + link to the attestation, mirroring social-post branded tier.

## States

- **Default (Builder)** — variant `info`, empty title/body, no CTAs, dismissable on, inline, on-load; "needs setup" until title (or body) is filled.
- **Take — on-load** — renders immediately when its screen shows.
- **Take — after-delay** — hidden until the timer elapses, then appears (respects reduced-motion: no slide, just fade/appear).
- **Take — conditional** — hidden until its `showIf` is satisfied (reuses RevealGate for a same-screen trigger).
- **Dismissed** — participant clicks ✕ → the notice hides; the interaction (`dismissed`) is recorded; Continue is never blocked.
- **CTA clicked** — records `cta:<index>`; `url` opens a new tab (participant stays in the study); `study` navigates to the other study's start.
- **Ignored** — advanced without interacting → `ignored`.
- **Error (Builder)** — a CTA with an empty label or missing target shows an inline validation note; block stays "needs setup".

## Interactions

- **✕ close** — hides the notice, records `dismissed`. Keyboard-focusable, `aria-label="Dismiss notification"`.
- **CTA button** — for `url`: `target="_blank" rel="noopener"` (new tab); for `study`: navigate to `/take/<studyId>/start`. Records `cta:<index>` before navigating.
- **Builder variant change** — swaps icon/colour in the mini-preview; toggling to `custom` reveals the thumbnail uploader + the deception notice.
- **Builder CTA add/remove** — up to 2; each row picks a target kind then its value (URL field or study picker).
- **Trigger = after** — numeric seconds input (Builder); runtime shows the notice via a client timer.

## Edge cases

- **Very long title/CTA label** — truncate with ellipsis; body wraps to a max of ~3 lines then clamps.
- **Fixed-top on mobile** — the bar spans full width, doesn't cover the progress bar; content below gets top padding so nothing is hidden.
- **Two CTAs on a narrow screen** — buttons wrap below the text rather than overflow.
- **No CTAs** — the notice is informational; only the ✕ (if dismissable) is interactive.
- **`study` target = a study the participant can't access / unpublished** — the link still points at `/take/<id>/start`; that study's own gate handles access (we don't pre-validate reachability here).
- **Not dismissable + fixed-top** — persists on the screen until Continue; make sure it can't trap focus or hide the Continue button.

## Accessibility notes

- Container `role="status"` for info/success, `role="alert"` for error/warning (assertive), so screen readers announce it (esp. on after-delay/conditional appearance).
- Close button is a real `<button>` with an `aria-label`; focus order: content → CTAs → close.
- Variant is never colour-only — the icon + the title convey type; error/warning use `role="alert"` text too.
- Respect `prefers-reduced-motion` for the appear transition.
- Fixed-top overlay must not steal focus on mount unless the researcher made it a blocking modal (that's the Modal block, not this one).

## Open questions

- Should `ignored` be recorded when the notice was never triggered (e.g. an after-delay that the participant out-ran by clicking Continue first)? (Proposed: record `ignored` only if it was shown.)
- Do we want a max count of fixed-top notifications per screen (stacking) in v1, or one? (Proposed: one fixed-top per screen for v1; stacking is a later overlay-primitive extension.)
- Auto-dismiss after N seconds (toast behaviour) — deferred; v1 dismiss is manual (✕) or persists.
