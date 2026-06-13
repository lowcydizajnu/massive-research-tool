# Wireframe spec — Drill down

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Cascading dependent dropdowns (e.g. country → region → city) where each level's options depend on the previous choice — captures a precise hierarchical selection in little space.

## Layout

A prompt and a stack of selects revealed one at a time; choosing a level reveals the next with its dependent options.

## Content inventory

- **Prompt**, **levels** (the nested option tree: each node has a label and optional children), **required**.
- A small client island renders the dependent selects (ADR-0013 exception).
- Records `{path: string[]}`.

## States

- **Default** — configured block renders its inputs.
- **Loading** — n/a (server-rendered inside the take form; drill-down's island hydrates).
- **Empty** — unconfigured (no options/items/rows) shows the builder's "Needs setup" chip; participant sees nothing actionable.
- **Partial** — partial answer allowed unless required; the runtime rejects a blank required answer.
- **Error** — invalid answer (e.g. constant-sum total mismatch) rejected server-side with the standard `?e=invalid_answer` redirect.
- **Success** — answer recorded; advances to the next screen.

## Interactions

- Choose level 1 → level 2 options populate from that node's children → etc. Changing an upper level resets lower levels.

## Edge cases

- No-JS: only the first level renders server-side; documented JS-required for deeper levels (first genuinely degraded block — noted in the changelog, not an ADR).
- A path that doesn't match the tree → rejected server-side (tree walk).

## Accessibility notes

- Native selects with labels; keyboard-complete. The island only re-renders the dependent options.

## Open questions

- None blocking; deferred enhancements noted inline.
