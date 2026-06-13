# Wireframe spec — End redirect

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · flow block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Send completers back to a recruitment platform (Prolific/SONA) with a completion code — the standard panel hand-off.

## Layout

On the completion page: the thank-you, the completion code (copyable), and a prominent button to the recruitment URL (the destination is shown).

## Content inventory

- **redirectUrl** (https), **completionCode**, **buttonLabel?**.
- Rendered on completion; no participant answer recorded.

## States

- **Default** — as drawn.
- **Loading** — n/a (server-rendered).
- **Empty** — unconfigured shows the builder "Needs setup" chip.
- **Partial** — n/a (no participant answer).
- **Error** — end-redirect-specific (below).
- **Success** — n/a / completion.

## Interactions

- The participant clicks the button to return to the platform; the code is shown to copy if needed.

## Edge cases

- The URL is validated as http(s) before the button renders (open-redirect safety); an invalid URL → the code is still shown, no button.
- Never auto-redirects to a researcher-supplied URL (ADR-0042).
- Filtered from the screen flow (renders only on completion).

## Accessibility notes

- The button is a real link with visible destination text; the completion code is selectable text.

## Open questions

- Captcha is reserved (Cloudflare Turnstile) but not shipped (ADR-0042); revisit on bot pressure.
