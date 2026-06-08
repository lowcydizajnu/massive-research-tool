# Wireframe spec — Export builder

- **Serves user flow:** [hanna-run-and-read-results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Studies › study › Results › Export](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Let a researcher shape a clean, analysis-ready dataset before downloading — choose which variables to include, reorder + rename them, see a live preview of the actual rows, and export in their tool's format — plus a machine-readable data dictionary (V1.12 D).

## Layout

Two-panel, under the Results stage at `/studies/[id]/results/export`. **Left:** the variable list — fixed columns (Response ID, Condition, External PID, Started, Completed) then one row per question block; each variable has a visibility checkbox, a drag handle (reorder), and an editable export label. **Right:** a live preview table (first ~50 rows, sticky header, horizontal scroll) reflecting the current selection/order/labels, with a format selector + Download + "Download data dictionary".

## Content inventory

- **Variable row** — source name (`prompt` / fixed-column name) + module type, an export-label input (defaults to a slugified name), a hide toggle, a reorder handle.
- **Preview table** — selected columns in order, header = export labels, first 50 completed responses; "+N more rows" note.
- **Format selector** — CSV / TSV / JSON now; SPSS/Stata/Excel later (greyed with "coming soon").
- **Download** — generates the file client-side from `getResults` rows.
- **Data dictionary** — JSON now (variable name, label, type numeric/categorical/text, source module ref); PDF later.
- **Include preview responses** — checkbox mirroring `getResults({ includePreview })`.

## States

- **Default** — all variables visible, source order, CSV.
- **Loading** — Results query in flight.
- **Empty** — no completed responses → "No responses yet to export."
- **Partial** — n/a.
- **Error** — Results query failure surfaces inline.
- **Success** — Download triggers a browser file save; a transient "Exported N rows" note.

## Interactions

- **Hide / show** — toggles a variable in the export + preview.
- **Reorder** — drag handle reorders variables (same SortableList as the Builder; ADR-0022).
- **Rename** — edits the export label (preview header + dictionary update live).
- **Format** — switches the generated file type.
- **Download / Download dictionary** — client-side blob download.

## Edge cases

- A variable with no answers across responses still exports (blank cells).
- Renames colliding → both kept (export labels aren't required unique for CSV; dictionary lists raw + label).
- Large datasets — preview caps at 50 rows; the download includes all.
- Multi-select / matrix answers render as their CSV-stringified form (existing `stringifyAnswer`).

## Accessibility notes

- Variable list is a labelled list; reorder is keyboard-accessible (dnd-kit, per ADR-0022); each control has an accessible name tied to its variable.
- Preview table has a proper `<thead>` + scope headers.

## Open questions

- SPSS/Stata: ship value/variable-labelled CSV + a companion `.sps`/`.do` syntax file, or a true binary writer? (Deferred to the formats PR.)
- Named export templates (per-user/study/workspace) + the in-app explorer mode — deferred to follow-up PRs.
