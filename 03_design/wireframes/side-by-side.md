# Wireframe spec — Side by side

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Several sub-questions sharing one row per item — a condensed table where each row is rated across multiple columns at once (distinct from matrix-grid: columns can be different question types).

## Layout

A prompt, then a table: rows are items, columns are sub-questions, each cell an input (select/radio).

## Content inventory

- **Prompt**, **rows** (item labels), **columns** (`{key, label, options}`), **required**.
- One input per (row, column) cell.
- Records `{values: {`${rowIndex}_${colKey}`: string}}`.

## States

- **Default** — configured block renders its inputs.
- **Loading** — n/a (server-rendered inside the take form; drill-down's island hydrates).
- **Empty** — unconfigured (no options/items/rows) shows the builder's "Needs setup" chip; participant sees nothing actionable.
- **Partial** — partial answer allowed unless required; the runtime rejects a blank required answer.
- **Error** — invalid answer (e.g. constant-sum total mismatch) rejected server-side with the standard `?e=invalid_answer` redirect.
- **Success** — answer recorded; advances to the next screen.

## Interactions

- Answer each cell. Required = every cell answered.

## Edge cases

- Grouped screen namespacing: cell fields prefixed by `np`.
- Narrow viewport: columns stack under each row (responsive); the exact stacked layout follows the design brief.
- Stray row/col keys → rejected.

## Accessibility notes

- Each cell input is labelled by its row + column (sr-only composite label); a real table semantics (`role=group` per row).

## Open questions

- None blocking; deferred enhancements noted inline.
