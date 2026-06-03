# Wireframe spec — Results stage

- **Serves user flow:** [Hanna runs and reads results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let Hanna read what her study collected — per-condition completion counts and a per-question answer summary — and export a clean per-response CSV for her own analysis. We summarize and export; we do not do inferential statistics (out of scope, ADR-adjacent decision in the flow).

## Layout

The Build-stage shell reused (StageTabs pill with **Results** active; work-surface card). Inside, top to bottom: a header (study title + a one-line "what you're seeing"), a **preview-included** toggle + **Export CSV** action row, a **per-condition** summary (one row/card per condition: name + completed n), and a **per-question** summary (one block per question: prompt + a compact answer summary). Empty state replaces the summaries when there are no responses.

## Content inventory

- **Study title** — from the preregistered version.
- **Summary caption** — e.g. "12 completed responses across 2 conditions" (run mode; excludes preview unless toggled).
- **Preview-included toggle** — default off; when on, includes `mode='preview'` responses (URL-param driven so it's server-rendered, shareable, and bookmarkable).
- **Export CSV button** — downloads one row per response (see States · Export).
- **Per-condition rows** — condition name/slug + completed count (+ % of total).
- **Per-question blocks** — for each question block (modules where `collectsResponse`): the prompt + a summary appropriate to the module: likert-7 → **mean + n** (V1.5; distribution bars are a later nice-to-have). Stimulus blocks (social-post) are listed as "shown, no answer collected" or omitted.
- **Empty state** — "No responses yet — share your recruitment link from the Run stage," with a link to Run.

## States

- **Default (has responses).** Caption + condition rows + question summaries + Export enabled.
- **Empty (zero responses, run mode).** Empty-state copy + link to Run; Export still available (header-only CSV).
- **Preview-included on.** Same layout; caption notes "including preview responses"; counts include preview rows.
- **Not preregistered.** Prompt to preregister first (no version to report on) — mirrors Run.
- **Loading.** Server-rendered; no async spinner.

## Interactions

- **Preview toggle** — flips `?preview=1`; the RSC re-queries including/excluding preview and re-renders.
- **Export CSV** — a download (route handler or server action streaming `text/csv`); filename includes the study + timestamp. One row per response; columns: `response_id`, `condition`, `external_pid`, `started_at`, `completed_at`, then one column per question block keyed by a stable header (e.g. the block's prompt or instanceId). Respects the current preview toggle.

## Edge cases

- **A condition with zero completes** — still shown with n=0 (so Hanna sees the assignment imbalance), not hidden.
- **A question never answered** (all skipped/optional) — summary shows n=0 / "—".
- **Long prompts / many questions** — the card scrolls; summaries stay compact.
- **Mixed module versions across responses** (replication edge) — group by block instanceId; the CSV records `module_version` provenance per the data model (not necessarily surfaced in the on-screen summary in V1.5).
- **Only preview responses exist, toggle off** — reads as the empty state (correct: no real data yet).

## Accessibility notes

- Condition + question summaries are real tables/lists with headers, not color-only bars; any distribution bar has a text value beside it.
- The Export button is a real link/button with descriptive text ("Export CSV — one row per response").
- The preview toggle is a labelled control with its state announced; the caption text reflects the current inclusion so screen-reader users aren't surprised by counts.

## Open questions

- Distribution bars vs mean-only for likert in V1.5 — mean + n ships first; bars later.
- Whether to surface per-response rows on screen (a table) or keep raw rows CSV-only in V1.5 — leaning CSV-only on screen-summary + export to keep the surface focused.
