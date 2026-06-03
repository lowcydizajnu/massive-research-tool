# Wireframe spec — Participant runtime

- **Serves user flow:** [Participant takes a study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md) (beneficiary; the screens are used by an anonymous participant)
- **Status:** draft

## Purpose

The surfaces an anonymous participant sees when taking Hanna's preregistered study via a recruitment link: a consent gate, one question per page, and a completion screen. Server-rendered MPA per ADR-0013 (distinct URL per question, no client router, no auth) so third-party heatmap/recording tools work and answers persist on every step. The same screens render Preview (`?preview=true`) so Hanna sees exactly what participants see, with no data recorded.

## Layout

A dedicated **participant shell** — NOT the researcher chrome (no left rail, no top bar, no tRPC, no Clerk). A single centered column (~640px) on `surface.page` parchment; a white `surface.canvas` card (`radius.lg`, `shadow.md`) holds the active screen. A slim header shows the study title (Plex Serif) + a thin progress indicator ("Question 3 of 8"). In Preview mode a persistent `warning`-tone ribbon pins to the top: "Preview — no responses are recorded."

Three screens share the shell:
1. **Start / consent** — `/take/[studyId]/start`
2. **Question** — `/take/[studyId]/[sessionId]/[questionIndex]`
3. **Complete** — `/take/[studyId]/[sessionId]/complete`

## Content inventory

- **Study title** — from the preregistered version (server). Plex Serif, truncates.
- **Progress indicator** — "Question {n} of {visibleTotal}" computed server-side for the assigned condition; a thin token-colored bar. Absent on consent/complete.
- **Preview ribbon** — shown only when `response.mode = 'preview'`; `warning` tone; text "Preview — no responses are recorded."
- **Consent body** — a generic consent statement (researcher-editable copy is V1.6) describing participation + voluntariness; if the researcher configured third-party analytics (V1.6) a tracking note + opt default-off control.
- **Begin button** — primary; advances from consent to the first question (form POST).
- **Question block** — the active module instance rendered for the assigned condition (e.g. social-post stimulus, likert-7 scale). The block's own inputs; RSC shell, client hydration only where the module needs it (ADR-0013).
- **Answer input(s)** — module-specific; the field name(s) the server action validates against the module `responseSchema`.
- **Next / Continue button** — primary submit; advances (form POST → server action → redirect to next visible question).
- **Validation message** — inline, per-field, when an answer fails `responseSchema`.
- **Completion body** — thank-you copy; the recruitment completion code/URL when configured (V1.6); a distinct "Preview complete — nothing was recorded" variant in preview mode.

## States

- **Consent (default).** Study title + consent body + **Begin**.
- **Recruitment closed.** If `recruitment_session.status != 'open'`: a polite "This study isn't accepting responses right now." No session created, no Begin.
- **Question — default.** Progress + the block + answer input(s) + **Continue**.
- **Question — submitting.** Continue shows busy (`aria-busy`); real page navigation follows (no spinner-forever — it's a POST+redirect).
- **Question — invalid answer.** Inline validation message(s); the same question re-renders; nothing advanced or stored for that item.
- **Resume.** Re-entering an in-progress session lands on its stored `current_question_index` with the same condition; previously answered questions, if revisited, show the prior answer (items upsert).
- **Complete (run).** Thank-you + completion code/URL (when set). `current_n` already incremented.
- **Complete (preview).** "Preview complete — nothing was recorded," with a way back for Hanna (e.g. close tab / return to Build).
- **Not found.** Unknown/malformed study or session id → a minimal participant 404 (own shell, not the researcher notFound).
- **Already taken.** Duplicate `external_pid` for the recruitment_session → "You've already completed this study."

## Interactions

- **Begin** (consent) — form POST → server creates the `response` (first entry), assigns condition (weighted random), captures `external_pid` if present, sets `mode`, redirects to `/take/[studyId]/[sessionId]/0`.
- **Continue** (question) — form POST → server action validates the answer against the module `responseSchema`; on success upserts the `response_item`, advances `current_question_index` past any condition-hidden blocks, redirects to the next question's URL (or `/complete` after the last). On failure re-renders with the inline message.
- **Browser back/forward** — works natively (real page loads); going back re-renders an earlier question with its stored answer.
- **No client-side question navigation** — there are no in-page "skip"/"jump" controls in V1.5; the only progression is Continue (and native back).

## Edge cases

- **Condition-hidden blocks** — a block whose `visibility.showIfCondition` excludes the assigned condition is skipped in both directions; progress total counts only visible blocks.
- **Very long stimulus / question** — the column scrolls; the Continue button stays reachable (not fixed-overlay in V1.5).
- **Refresh / crash mid-question** — prior items already persisted; reopening resumes at `current_question_index`. An unsubmitted in-progress answer is not preserved (acceptable in V1.5).
- **`?preview=true` tampering on later requests** — ignored; `mode` is read once at session creation and thereafter only from the `response` row (ADR-0013).
- **Zero visible blocks for the assigned condition** — degenerate; Begin leads straight to Complete. (Builder should prevent this, but the runtime must not crash.)
- **Mobile** — single-column shell is mobile-first; inputs are tap-friendly; recruitment platforms route many participants on phones.

## Accessibility notes

- Each question page has a clear `<h1>`/labelled region; the progress indicator is text ("Question 3 of 8"), not color-only, and exposed via `aria`.
- Inputs have associated `<label>`s; validation messages are linked via `aria-describedby` and announced (`role="alert"`).
- Continue is a real submit button; the form is keyboard-submittable; focus moves to the new page's heading on navigation (native for full page loads).
- Preview ribbon is announced once (`role="status"`), not on every page (avoid nagging screen-reader users).
- The participant shell sets a sensible `lang` and meets contrast on parchment per tokens; no reliance on the researcher theme toggle.

## Open questions

- Generic vs researcher-editable consent copy — generic for V1.5 (editable = V1.6 with the tracking-config UI).
- Progress indicator when later visibility could change the visible total — V1.5 has only static condition visibility, so the total is stable per session; revisit if branching (V1.6) makes it dynamic.
- Where the third-party tracking script injects (route-level `<head>` for `/take/*` only) — mechanism ships empty in V1.5 (ADR-0013); confirm injection point when the settings UI lands in V1.6.
