# Wireframe spec — Accuracy + confidence judgment

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Capture a categorical judgment (e.g. real vs. fake) AND a confidence rating in one block — the metacognition pairing central to misinformation research, enforced as a single block so the two are never separated.

## Layout

A prompt, a row of accuracy options (radios), then a labelled confidence slider beneath. One participant card.

## Content inventory

- **Prompt** — the judgment question.
- **Accuracy options** — researcher-defined choices (radios), stored as the chosen string.
- **Confidence slider** — 0–100 (configurable max), labelled min/max anchors.
- Records `{accuracy, confidence}`.

## States

- **Default** — configured block renders its inputs.
- **Loading** — n/a (server-rendered inside the take form; drill-down's island hydrates).
- **Empty** — unconfigured (no options/items/rows) shows the builder's "Needs setup" chip; participant sees nothing actionable.
- **Partial** — partial answer allowed unless required; the runtime rejects a blank required answer.
- **Error** — invalid answer (e.g. constant-sum total mismatch) rejected server-side with the standard `?e=invalid_answer` redirect.
- **Success** — answer recorded; advances to the next screen.

## Interactions

- Pick one accuracy option; drag the confidence slider. Both required when `required`.

## Edge cases

- No option chosen but slider moved → still incomplete (accuracy required).
- Grouped screen: fields namespaced `${np}accuracy` / `${np}confidence`.

## Accessibility notes

- Radios are a native `radiogroup`; the slider is a native `input[type=range]` with `aria-label`. Keyboard-complete.

## Open questions

- None blocking; deferred enhancements noted inline.
