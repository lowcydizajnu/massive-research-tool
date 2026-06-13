# Wireframe spec — Constant sum

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Allocate a fixed budget (points or %) across options that must total a target — the classic allocation/trade-off measure, with the total enforced server-side.

## Layout

A prompt, one number input per item with its label, and a running target reminder ("must total 100"). A live tally is a deferred enhancement.

## Content inventory

- **Prompt**, **items** (labels), **total** (target sum), **required**.
- One numeric input per item.
- Records `{values: {itemIndex: number}}`.

## States

- **Default** — configured block renders its inputs.
- **Loading** — n/a (server-rendered inside the take form; drill-down's island hydrates).
- **Empty** — unconfigured (no options/items/rows) shows the builder's "Needs setup" chip; participant sees nothing actionable.
- **Partial** — partial answer allowed unless required; the runtime rejects a blank required answer.
- **Error** — invalid answer (e.g. constant-sum total mismatch) rejected server-side with the standard `?e=invalid_answer` redirect.
- **Success** — answer recorded; advances to the next screen.

## Interactions

- Type a number per item. On submit the runtime checks the sum equals `total` (when answered).

## Edge cases

- Sum ≠ total → rejected server-side.
- Negative or non-numeric → rejected.
- Empty + not required → allowed.
- Live client tally deferred; server total is the only correctness requirement.

## Accessibility notes

- Native number inputs with per-item labels; the target is stated in text, not color.

## Open questions

- None blocking; deferred enhancements noted inline.
