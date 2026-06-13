# Wireframe spec — Embedded data

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · flow block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Capture specific URL parameters (e.g. Prolific PID, condition, source) into the response — for panel reconciliation — without showing anything to the participant.

## Layout

No participant UI (the runtime filters it from the screen flow). In the Builder it's a card listing the parameter names it will capture.

## Content inventory

- **params** (the exact URL-param names to capture — a default-deny allowlist; nothing else is captured).
- Captured at start into `response.metadata.embedded` regardless of where the block sits.

## States

- **Default** — as drawn.
- **Loading** — n/a (server-rendered).
- **Empty** — unconfigured shows the builder "Needs setup" chip.
- **Partial** — n/a (no participant answer).
- **Error** — embedded-data-specific (below).
- **Success** — n/a / completion.

## Interactions

- At the study link, declared params present in the URL are stored; absent ones are skipped. No participant action.

## Edge cases

- Only declared names are captured — never the whole query string (PII safety, ADR-0042).
- Placement in the block list is irrelevant (capture is at start) — the block renders no screen.

## Accessibility notes

- No participant-facing element; nothing to announce. Builder card names the params for the researcher.

## Open questions

- Captcha is reserved (Cloudflare Turnstile) but not shipped (ADR-0042); revisit on bot pressure.
