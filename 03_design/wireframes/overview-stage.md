# Wireframe spec — Overview stage

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Studies › study › Overview (first stage)](../ia/information-architecture.md)
- **Persona:** [principal-investigator](../../02_product/personas/principal-investigator.md)
- **Status:** ready for handoff

## Purpose

Give the study a researcher-authored **plan** — a chosen **Preregistration template**, typed plan fields (sampling, analysis, variables, expected outcomes), an abstract, numbered hypotheses, and free-markdown sections — that travels with the study and is frozen into the preregistration record (V1.12 B1; typed fields + picker per [ADR-0101](../../04_architecture/adrs/0101-preregistration-templates-typed-fields.md), LOS Round 2 item ⑤).

The plan is authored **here**; it is frozen and filed on the [Preregister stage](preregister-stage.md). The typed fields exist so the plan is *structured* rather than prose — that is what lets us map it field-by-field to the OSF registration instead of scraping section headings.

## Layout

Standard stage layout: `<StageTabs active="Overview">` (Overview is the first tab) above a work-surface card (`surface.canvas`, `radius.lg`). Inside, a single ≤760px column (`gap.5`), in order:

1. **Preregistration template** picker — a labelled radiogroup at the top of the plan, because it governs which typed fields appear below it.
2. **Abstract** textarea.
3. **Notes on changes from the original** textarea — replications only (unchanged).
4. **Hypotheses** — ordered `H1…Hn` list with reorder/remove (unchanged).
5. **Plan fields** — the typed editors the chosen template exposes (Sampling plan, Analysis plan, Variables, Expected outcomes), each a labelled group in the same `fieldCls` idiom as Abstract.
6. **Data-collection status** — a read-only derived chip + one-line explainer (it gates preregistration).
7. **Sections** — the existing free-markdown section list + **Add section** row with suggested-heading chips (unchanged, minus one chip — see Content inventory).
8. **Save overview** — `PendingButton` + transient status.

Field labels reuse the existing pattern: `text-[length:var(--text-label)] uppercase tracking-wide text-[var(--color-text-muted)]`. Inputs reuse the shared `fieldCls` (`radius.md`, `border-subtle`, `surface.canvas`, `text.body`, focus ring `color.primary`). No new visual decisions — design language is locked at v0.6 as coded in `05_app/styles/tokens.css`.

## Content inventory

- **Title** — from `studies.get`.
- **Preregistration template** — radiogroup, two options, stored as `definition_snapshot.overview.templateKey`:
  - **Open-ended** (default) — "A free-form plan. Everything you write is filed as one summary."
  - **Replication recipe** — "Structured for replicating an existing finding (Brandt et al., 2014)."
  Each option is a label + one-line description. Vocabulary: the surface says **Preregistration template** — never "schema", never "Framework" (a retired primitive), and never bare "Template" (that means a starter study, `workspace_template`).
- **Abstract** — editable textarea, ≤5000 chars, `overview.abstract`.
- **Notes on changes from the original** — replications only, ≤5000, `overview.replicationNotes`.
- **Hypotheses** — ordered `string[]`, each ≤1000, labelled `H1…Hn`, `overview.hypotheses`.
- **Sampling plan** — textarea, ≤2000, `overview.samplingPlan`. Label help: "Target N and the power analysis that produced it." Filed to OSF as the sample-size answer on the Replication recipe; part of the summary on Open-ended.
- **Analysis plan** — textarea, ≤20000 markdown, `overview.analysisPlan`. Filed as the analysis answer on the Replication recipe.
- **Variables** — ordered structured list, `overview.variables[]`; each row = **name** (≤200) + **role** select (`Independent` / `Dependent` / `Covariate` / `Exclusion`) + **measure** — an optional select bound to a block in this study (by `instanceId`; "— not linked —" allowed) + optional **notes** (≤1000). Add/remove/reorder. ≤50 rows.
- **Expected outcomes** — ordered list, `overview.expectedOutcomes[]`; each row pairs an optional **hypothesis reference** (select `H1…Hn`, or "—") with a **prediction** textarea (≤1000). Add/remove/reorder. ≤50 rows.
- **Data-collection status** — **read-only, server-derived** chip: "Not started" (`success` tone) / "Collecting" (`warning`) / "Finished" (`warning`), with the explainer "You can only preregister before data collection starts." It is never a researcher toggle, and it is **not stored on the plan** — it is computed from the study's live recruitment state at render, so it cannot drift from reality. (It needs no stored counterpart: because the [Preregister stage](preregister-stage.md) hard-gates on it, any preregistration that exists was necessarily filed while collection had not started — the guarantee is carried by the gate, not by a field that could go stale.)
- **Suggested headings** — static chips (Background / Methods / Ethics · IRB / References) that quick-add a named free-markdown section; hidden once used. **"Analysis plan" is no longer a suggested chip** — it is now a typed field, and offering both would create two homes for one concept. (The prior version of this spec also listed a "Hypotheses" chip; hypotheses have been typed since V1.12 B1 and the chip does not exist in the built editor.)
- **Sections** — ordered `{id, heading, contentMd}` (heading ≤200, markdown ≤20000, ≤30 sections), reorder/remove. On a replication these are seeded with the recipe sections (Target effect / Original result / Planned sample / Differences from the original) — see Edge cases.
- **Save overview** — `studies.setOverview` (PendingButton) + a transient "Overview saved" status.

## States

- **Default** — loaded plan; template = stored `templateKey`, or the derived default for a study saved before item ⑤ (see Edge cases).
- **Loading** — server-rendered; resolves before paint.
- **Empty** — new study: Open-ended selected, empty abstract, no hypotheses/variables/outcomes, no sections.
- **Template = Open-ended** — Sampling plan, Analysis plan, Variables, Expected outcomes all shown.
- **Template = Replication recipe** — the same typed fields, plus the seeded recipe sections in the section list and the replication-notes textarea.
- **Data-collection: not started** — chip `success`; preregistration is available on the Preregister stage.
- **Data-collection: collecting / finished** — chip `warning` + explainer; the plan is still editable here, but the Preregister stage blocks freezing (see [preregister-stage.md](preregister-stage.md)).
- **Error** — `setOverview` failure surfaces via the mutation; study-not-found → `notFound()`.
- **Success** — "Overview saved" status for 3s.

## Interactions

- **Template radiogroup** — selects `templateKey`; changes which typed fields render. Switching **never destroys data** — a field hidden by a template switch keeps its stored value and reappears on switching back (values are additive on the overview object, not per-template).
- **Abstract / hypotheses / sections** — unchanged (controlled inputs; edits clear the saved status; reorder ▴▾ swaps with the neighbour; ✕ removes).
- **Sampling plan / Analysis plan** — controlled textareas.
- **Variables — Add variable / role select / measure select / ✕ / ▴▾** — appends, edits, removes, reorders a row. The measure select lists this study's response-collecting blocks by title; a variable may stay unlinked.
- **Expected outcomes — Add expected outcome / hypothesis select / ✕ / ▴▾** — same pattern. The hypothesis select offers `H1…Hn` from the hypotheses above; renumbering hypotheses does not rewrite existing references (they hold the index at time of authoring — see Edge cases).
- **Data-collection chip** — non-interactive.
- **Save overview** — writes the whole plan to the snapshot (preserving blocks). Data-collection status is not part of the payload — it is derived, never sent.

## Edge cases

- **Study saved before item ⑤ (no `templateKey`)** — the reader defaults it: a study with a declared replication intent resolves to **Replication recipe**, everything else to **Open-ended**. This exactly preserves the pre-item-⑤ behaviour, where the OSF schema was picked implicitly from replication intent. Nothing needs migrating.
- **Frozen plans stay valid** — every typed field is optional with a default, so preregistrations frozen before item ⑤ read back cleanly (empty typed fields + their original sections).
- **Legacy recipe sections vs typed fields** — a replication created before item ⑤ carries its sampling text in the seeded "Planned sample" section and its analysis text in a section headed "Analysis plan". Those sections remain visible and editable; the typed field wins when filled, and the legacy section is used when it isn't. The editor does not silently migrate the text (that would rewrite the researcher's plan behind their back).
- **Hypothesis renumbering** — deleting H1 renumbers the list; existing expected-outcome references are not rewritten. The reference select shows the current label and marks a now-missing reference as "—".
- **Block deleted after being linked as a measure** — the variable keeps its name/role and shows "— not linked —"; nothing is destroyed.
- **Long text** — textareas scroll; server caps enforce max lengths.
- **Many variables / outcomes (≤50 cap each)** — the page scrolls.
- **Markdown** — authored here, rendered safely where the plan is *displayed* (preregistration narrative / OSF / public record) — not in this editor for v1.
- **Permissions** — a viewer cannot save; the mutation is write-gated (`writeProcedure`).

## Accessibility notes

- The template picker is a `radiogroup` with an accessible name ("Preregistration template"); each option's description is wired via `aria-describedby`, so the choice is not conveyed by layout alone.
- Each variable / expected-outcome row is a labelled group; reorder buttons carry aria-labels (Move up/down) and disable at the ends; remove buttons name their target ("Remove variable 2").
- The data-collection chip is not colour-only — tone is paired with text ("Not started" / "Collecting" / "Finished") and the explainer states the consequence.
- Save status is `role="status"` (polite).
- Selects (role, measure, hypothesis reference) have visible labels, not placeholder-only labelling.

## Open questions

- Live markdown preview in the editor (split view) — still deferred; the editor is author-only for v1.
- **Auto-derivation (item ⑨)** — variables and the design/procedure narrative are largely derivable from the built study (blocks already declare whether they collect a response, and conditions/factors already describe the design). The data shape reserves a per-field `source: derived | researcher` slot for this, but v1 renders **no** provenance UI because nothing is auto-filled yet. When ⑨ lands, derived fields need an "Auto-filled from your design" affordance + a refresh/override treatment — spec that then.
- Stricter OSF templates (standard OSF Preregistration, AsPredicted, EEG/ERP, Eye-tracking) are deliberately **not** offered in v1: they carry required questions, which needs a required-field gate before filing. Revisit per ADR-0101's triggers.
