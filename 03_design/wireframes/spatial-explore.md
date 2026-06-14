# Wireframe spec — Explore spatial responses

- **Serves user flow:** [Hanna runs and reads results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Results stage · per-question deep-dive](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Decisions for this surface are recorded in the [ADR-0041 amendment (2026-06-14)](../../04_architecture/adrs/0041-image-interaction-blocks.md).


The Results page shows an inline *aggregate* overlay for spatial blocks (all clicks pooled on the stimulus). That answers "where did people click overall?" but not "who clicked where?", "did the two conditions differ?", or "what's the spread of slider positions?". This is the dedicated, **explorable** surface for one spatial question: filter by condition, switch between the pooled aggregate and one-respondent-at-a-time, and (heat-map) switch between a dot plot and a density grid. It is reached from a per-question **Explore responses →** link on Results, and is the target of the CSV/Excel **visualization link**.

Covers **heat-map**, **hot-spot**, and **graphic-slider** in v1. Signature is deferred (ADR-0041 amendment — `/api/media` authorization).

## Layout

The focused-study shell reused (StageTabs with **Results** active; work-surface card). Inside, top to bottom:

1. **Breadcrumb** — `Results › Explore` (Results is a link back).
2. **Header** — the question prompt (Plex Serif) + a one-line caption (`n` respondents, block type in researcher words: "click map" / "region picks" / "image slider").
3. **Control row** — condition filter chips; an Aggregate ↔ Per-respondent segmented control; for heat-map, a Dots ↔ Density segmented control; an opacity slider (aggregate dots only); an **image-saturation slider** (mutes/desaturates the stimulus so the markers read clearly — display-only, applied to the image, never the markers). Controls compose from existing v0.6 primitives — no new design-language decisions (chips, segmented control, native range input, `--color-primary` fills at varying opacity, exactly as the inline overlay).
4. **Stimulus panel** — the image at a comfortable width (~640px max) with the visualization drawn over it (normalized 0..1 coordinates, so markers place correctly at any width).
5. **Side/under panel** — block-type-specific readout (region counts table / value histogram / per-respondent meta).

## Content inventory

- **Question prompt + caption** — from `spatial` payload (`prompt`, `kind`, `responses.length`).
- **Condition chips** — one per condition that has ≥1 response here, plus "All"; each shows its count; toggling filters the visualization and every derived readout. Reflected in the URL (`?c=<slug>`) so the view is shareable/bookmarkable and server-rendered-friendly.
- **Aggregate ↔ Per-respondent** — Aggregate pools all (filtered) respondents; Per-respondent steps through one respondent at a time (Prev / Next + position "3 / 18", showing that respondent's condition + external PID when present).
- **heat-map** — Dots: one translucent dot per click. Density: a fixed grid (cells shaded by click density, `--color-primary` opacity). Opacity slider tunes dot translucency (aggregate Dots only).
- **hot-spot** — the configured regions drawn as outlined rectangles; Aggregate shades each by hit share + shows its count; Per-respondent highlights only the regions that respondent picked. A region-counts table sits beside the image (label + count + % of respondents), sorted desc.
- **graphic-slider** — the image with a marker per respondent's position (Aggregate: all markers along the track; Per-respondent: that one marker). A horizontal value histogram (fixed bins over 0..1) + mean/median/n beside the image.
- **Empty state** — no responses for this block (or none in the chosen condition) → "No responses to explore yet" with a link back to Results.

## States

- **Default (has responses).** Aggregate view, All conditions, heat-map defaults to Density when the click count exceeds the dot cap (perf), else Dots.
- **Per-respondent.** Prev/Next stepper; wraps disabled at ends; keyboard-operable.
- **Condition filtered.** One condition chip active; caption + histogram/counts recomputed; if that condition has zero here, the empty state shows with the chips still switchable.
- **Over the dot cap.** heat-map auto-switches to Density and notes "{N} clicks — showing density (switch to Dots to see individual clicks)"; choosing Dots renders at most the cap and says how many are not drawn (no silent truncation).
- **No stimulus image configured.** Coordinates-only message (as the inline overlay) — points/values still summarized in the readout; link to CSV export.
- **Loading.** Server-rendered page shell; the interactive panel hydrates (client island).

## Interactions

- **Condition chip** — toggles `?c=<slug>` (or clears to All); recomputes everything client-side from the already-loaded `responses[]` (no refetch).
- **Aggregate ↔ Per-respondent / Dots ↔ Density** — segmented controls; instant, client-side.
- **Prev / Next** — step respondents; also ← / → when the stepper has focus.
- **Opacity slider** — `role="slider"` (native range), tunes aggregate dot opacity live.
- **Image-saturation slider** — native range, tunes `filter: saturate()` on the stimulus image only (display-only; the markers and the exported data are untouched). Default 100%.
- **Explore responses →** (on Results, per spatial question) — navigates here for that `instanceId`.
- **From the export** — each spatial block is a **column** in the CSV/Excel dataset whose per-row cell is an absolute deep link `https://…/studies/<id>/results/explore/<instanceId>?r=<responseId>` that opens **that respondent** here in per-respondent view (opens signed in). A respondent with no response for the block gets an empty cell.
- **Deep-link landing (`?r=<responseId>`)** — opens directly in per-respondent view focused on that respondent (condition defaults to All so the respondent is present). If the id isn't among this block's responses, a "no response for this block" notice shows and the view falls back to aggregate.

## Edge cases

- **Thousands of clicks** — hard dot cap + auto-Density (not a soft note); density grid is a fixed cell count regardless of N; recompute memoized per filter change.
- **A respondent with zero points/empty pick** — counted in `n` only if they answered; per-respondent stepper skips no one but shows "no marks" for an empty answer.
- **Condition with one respondent** — per-respondent still works (1 / 1); aggregate == that one.
- **graphic-slider with identical values** — histogram bin stacks; mean/median still shown.
- **Region removed across versions** — explore reports on one frozen version's snapshot, so region defs and picks always align (no cross-version mixing here).

## Accessibility notes

- Condition chips are real toggle buttons with `aria-pressed` and a text count (not color-only). Segmented controls are labelled button groups with `aria-pressed`/`role`.
- The dot/region/marker layers are decorative (`aria-hidden`); the **authoritative data is the text readout** — region-counts table, value histogram with numeric labels, per-respondent meta — so nothing is conveyed by position/color alone.
- Per-respondent stepper announces the current position + that respondent's condition via `aria-live`.
- The opacity slider is a labelled native range; Density/Dots and Aggregate/Per-respondent state is announced.
- Full keyboard path: chips, segmented controls, stepper (buttons + arrow keys), slider — no pointer-only affordance.

## Open questions

- Per-condition side-by-side small multiples (two mini-stimuli) vs the single-panel + chip filter — single panel ships first; small multiples are a later refinement.
- Signature gallery — deferred to a later wave pending the `/api/media` `resp/` authorization decision (ADR-0041 amendment).
