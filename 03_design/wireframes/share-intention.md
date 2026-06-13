# Wireframe spec — Share intention

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Measure whether a participant would share a stimulus and why — the behavioral-intention measure at the heart of misinformation studies, with an optional/required reason.

## Layout

A prompt, a share-likelihood scale (radios), and a reason textarea that appears (and may be required) once a choice is made.

## Content inventory

- **Prompt** — e.g. "Would you share this post?"
- **Options** — likelihood scale (radios).
- **Why textarea** — optional or required-on-answer per `whyRequired`.
- Records `{intention, why?}`.

## States

- **Default** — configured block renders its inputs.
- **Loading** — n/a (server-rendered inside the take form; drill-down's island hydrates).
- **Empty** — unconfigured (no options/items/rows) shows the builder's "Needs setup" chip; participant sees nothing actionable.
- **Partial** — partial answer allowed unless required; the runtime rejects a blank required answer.
- **Error** — invalid answer (e.g. constant-sum total mismatch) rejected server-side with the standard `?e=invalid_answer` redirect.
- **Success** — answer recorded; advances to the next screen.

## Interactions

- Choose a likelihood; type a reason. If `whyRequired`, the reason is required only once an intention is chosen.

## Edge cases

- `whyRequired` + chosen intention + blank reason → rejected.
- No intention chosen → reason not required.

## Accessibility notes

- Radiogroup + labelled textarea; keyboard-complete.

## Open questions

- None blocking; deferred enhancements noted inline.
