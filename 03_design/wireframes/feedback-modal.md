# Wireframe spec — Feedback modal

- **Serves user flow:** [Provide product feedback](../../02_product/user-flows/provide-product-feedback.md)
- **IA placement:** [App shell — global affordances](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

> One sentence: what this screen exists to do.

Let a researcher compose and send a piece of feedback, choosing what context (screenshot, browser details) to attach.

## Layout

> Layout zones.

- Centered modal dialog over a scrim, ~480px wide, on `surface.canvas` with `radius.lg` + `shadow.md`.
- Top: title row. Middle (vertical stack): kind selector → message textarea → screenshot toggle → context disclosure. Bottom: action row (Cancel / Send feedback).

## Content inventory

> Every piece of content visible.

- **Title** — "Send feedback". Static.
- **Kind selector** — radio chips: Bug / Idea / Question / Other (default Bug). Computed selection.
- **Message textarea** — ~6 rows; placeholder "What's on your mind? Bugs, ideas, confusion — anything." Required; up to ~4000 chars.
- **Screenshot checkbox** — "Include a screenshot of this page". Default ON; **forced default OFF + helper copy** ("Screenshots are off because of your cookie choice — turn on to include one") when cookie consent is "necessary only".
- **Context disclosure (expandable)** — "Include browser context"; expands to a read-only JSON preview of exactly what will be sent: URL, route pattern, coarse country, hashed user-agent, workspace id, study id. Computed client-side.
- **Cancel button** — secondary. **Send feedback button** — primary.
- **Error text** — inline, on submit failure. Computed.

## States

- **Default** — composed form, Send enabled once the message is non-empty.
- **Loading (submitting)** — Send shows a spinner + "Sending…"; inputs disabled. If a screenshot is included, the modal briefly hides for capture, then returns showing progress.
- **Empty** — message empty → Send disabled.
- **Partial** — text saved but screenshot still uploading: row is already written; a small "attaching screenshot…" note.
- **Error** — submit failed → error text, form intact, Send re-enabled. Screenshot-only failure → success toast for the text + note the screenshot didn't attach.
- **Success** — toast "Thanks — feedback sent", modal closes, focus returns to the floating button.

## Interactions

- **Kind chip** — click/arrow keys select one; `role=radiogroup`.
- **Textarea** — type; drives Send enable/disable.
- **Screenshot checkbox** — toggles capture; disabled-with-explanation under "necessary only" consent unless the user opts in.
- **Context disclosure** — toggles the JSON preview; nothing is sent that isn't shown here.
- **Send feedback** — writes the row via `feedback.submit`; if screenshot on, renders the page with html2canvas → uploads to the returned signed R2 URL → `feedback.confirmScreenshot`. System response: toast + close. Error path: per States.
- **Cancel / Esc / scrim click** — closes without sending.

## Edge cases

- Very long message — capped (~4000 chars) with a counter near the limit.
- Screenshot of a huge / scrolled page — capture the viewport-rendered page; best-effort, never blocks the text submission.
- Slow network — submit stays in Loading; Cancel disabled mid-flight.
- Offline — submit fails → error state, text preserved.
- Capture unsupported / throws — silently fall back to text-only + note.
- No workspace / no study context (personal pages) — those context fields are simply absent from the JSON.

## Accessibility notes

- `role=dialog`, `aria-modal=true`, `aria-label="Send feedback"`; focus trapped; Esc closes; focus returns to the trigger.
- Kind chips as a labeled `radiogroup` with arrow-key navigation.
- Live region announces submit success/failure.
- `prefers-reduced-motion`: no modal slide; fade only.

## Open questions

- Whether to let researchers attach a file/log in addition to a screenshot. Out of scope for v1.
