# Wireframe spec — Voice emotion probe · Take

- **Serves user flow:** [Participant takes a study](../../02_product/user-flows/participant-take-a-study.md) (participant runtime)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — participant runtime (one block screen)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md) (surface serves the recruited participant; authored for the operator's study)
- **Status:** draft

## Purpose

Let a participant read a prompt and record a spoken answer, which is captured and (after submit) analyzed for vocal emotion. From the participant's point of view this is identical to the audio-record block — emotion analysis happens server-side, asynchronously, and is never shown to them.

## Layout

Reuses the audio-record Take view (`AudioRecordInput`): prompt at top, a single record control, a recording indicator/timer, and a re-record affordance before submit. Same layout zones as audio-record; no extra participant-facing emotion UI.

## Content inventory

- **Prompt** — the researcher's question (from config). Static per screen.
- **Record / Stop control** — starts/stops microphone capture.
- **Timer** — elapsed vs the duration limit (from config).
- **Playback / re-record** — review then discard-and-retry before submitting.
- **Continue** — submits the recording (uploaded to R2), then advances.

## States

- **Default** — prompt + idle Record button.
- **Loading** — requesting mic permission; uploading after stop.
- **Empty** — nothing recorded yet; if `required`, Continue is gated.
- **Partial** — recorded but not submitted (review state).
- **Error** — mic permission denied / upload failed → inline message + retry; never blocks the rest of the study beyond the `required` rule.
- **Success** — upload complete → advances; the `hume.analyze` job is enqueued server-side (invisible to the participant).

## Interactions

- **Record** — request mic → capture; **Stop** at limit or manually.
- **Re-record** — discard and capture again.
- **Continue** — upload + submit; on success, advance. No emotion result is shown to the participant (analysis is async and researcher-only).

## Edge cases

- Mic blocked / no device — clear message; `required` may strand the participant, so copy points to enabling the mic.
- Very short / silent recording — uploaded as-is; Hume may return a sparse vector (handled server-side).
- Slow network — upload spinner; submit disabled until complete.
- Reload mid-record — capture is lost (no resumable recording); participant re-records.

## Accessibility notes

- Record control is a labelled button with an `aria-pressed`/recording state; timer is announced politely, not assertively.
- Keyboard: record/stop and continue reachable in tab order; no pointer-only affordances.
- No reliance on color alone for the recording indicator.

## Open questions

- None for V2.1 — participant-facing emotion feedback ("show scores") is intentionally out (Hume analysis is async batch, not inline; showing scores would require blocking the participant on a job).
