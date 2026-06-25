# Wireframe spec — Text emotion probe · Take

- **Serves user flow:** [Participant takes a study](../../02_product/user-flows/participant-take-a-study.md) (participant runtime)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — participant runtime (one block screen)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md) (surface serves the recruited participant; authored for the operator's study)
- **Status:** draft

## Purpose

Let a participant read a prompt and type an answer, which is (after submit) analyzed for emotional content. From the participant's point of view this is identical to a free-text block — emotion analysis happens server-side, asynchronously, and is never shown to them.

## Layout

Reuses the free-text Take view (`FreeTextInput`): prompt at top, a single- or multi-line text field (per `longForm`), a character counter against `maxLength`. No extra participant-facing emotion UI.

## Content inventory

- **Prompt** — the researcher's question (from config). Static per screen.
- **Text field** — single line or paragraph box per `longForm`.
- **Character counter** — used/`maxLength`.
- **Continue** — submits the answer, then advances.

## States

- **Default** — prompt + empty field.
- **Loading** — n/a (text is local until submit).
- **Empty** — nothing typed; if `required`, Continue is gated.
- **Partial** — text entered, not submitted.
- **Error** — submit failure → inline retry; never blocks beyond the `required` rule.
- **Success** — submit → advances; the `hume.analyze` text job is enqueued server-side (invisible to the participant).

## Interactions

- **Type** — standard text entry up to `maxLength`.
- **Continue** — submit; on success, advance. No emotion result shown to the participant (analysis is async, researcher-only).

## Edge cases

- Very long answer — capped at `maxLength` (and a hard 10k server ceiling).
- Empty/whitespace answer — if not `required`, advances; the job skips analysis (no spurious row).
- Slow network — submit disabled until complete.
- Paste of huge text — truncated to `maxLength`.

## Accessibility notes

- Text field has a visible label (the prompt) and an associated counter.
- Keyboard-only flow throughout; Continue reachable in tab order.
- Counter announced politely as it approaches the limit.

## Open questions

- None for V2.1 — participant-facing "show scores" is intentionally out (async batch analysis; cannot be shown inline without blocking the participant).
