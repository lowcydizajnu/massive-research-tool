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
- **Preregistration template** — radiogroup, two options, stored as `definition_snapshot.overview.templateKey`. **Choosing a template changes which typed fields appear below it** — that is the whole point of the control, and it mirrors how OSF's registration templates work. A picker that changed nothing on screen would be indistinguishable from a broken one (owner, 2026-07-15). Each template's field set is declared in `lib/prereg-templates`:
  - **Open-ended** (default) — "A free-form plan. Everything you write is filed as one summary."
  - **Replication recipe** — "Structured for replicating an existing finding (Brandt et al., 2014)."
  Each option is a label + one-line description. Vocabulary: the surface says **Preregistration template** — never "schema", never "Framework" (a retired primitive), and never bare "Template" (that means a starter study, `workspace_template`).
- **Abstract** — editable textarea, ≤5000 chars, `overview.abstract`.
- **Notes on changes from the original** — replications only, ≤5000, `overview.replicationNotes`.
- **Hypotheses** — ordered `string[]`, each ≤1000, labelled `H1…Hn`, `overview.hypotheses`.
- **Original study** *(Replication recipe only)* — textarea, ≤2000, `overview.originalStudy`. Filed as the Recipe's original-study answer (`77-12`). On a fork, leaving it blank falls back to the study it was replicated from.
- **Target effect** *(Replication recipe only)* — textarea, ≤2000, `overview.targetEffect`. The effect being replicated with the original's key statistics; leads the Recipe's description (`77-2`).
- **Differences from the original** *(Replication recipe only)* — textarea, ≤20000, `overview.differences`. Filed as `77-73`, merged with the per-block rationales authored in Build.
- **Sampling plan** — textarea, ≤2000, `overview.samplingPlan`. Label help: "Target N and the power analysis that produced it." Filed to OSF as the sample-size answer on the Replication recipe; part of the summary on Open-ended.
- **Analysis plan** — textarea, ≤20000 markdown, `overview.analysisPlan`. Filed as the analysis answer on the Replication recipe.
- **Variables** — ordered structured list, `overview.variables[]`; each row = **name** (≤200) + **role** select (`Independent` / `Dependent` / `Covariate` / `Exclusion`) + **measure** — an optional select bound to a block in this study (by `instanceId`; "— not linked —" allowed) + optional **notes** (≤1000). Add/remove/reorder. ≤50 rows.
- **Expected outcomes** — ordered list, `overview.expectedOutcomes[]`; each row pairs an optional **hypothesis reference** (select `H1…Hn`, or "—") with a **prediction** textarea (≤1000). Add/remove/reorder. ≤50 rows.
- **Data-collection status** — **read-only, server-derived** chip: "Not started" (`success` tone) / "Collecting" (`warning`) / "Finished" (`warning`), with the explainer "You can only preregister before your first participant response." It is never a researcher toggle, and it is **not stored on the plan** — it is computed from the study's live response rows at render, so it cannot drift from reality. (It needs no stored counterpart: because the [Preregister stage](preregister-stage.md) hard-gates on it, any preregistration that exists was necessarily filed before the data existed — the guarantee is carried by the gate, not by a field that could go stale.)

  It reports on **data, not recruitment**: the trigger is a recorded participant response, so "Not started" while recruitment is open and nobody has taken the study yet is **correct, not a bug**. The researcher's own Preview runs never count.
- **Suggested headings** — static chips (Background / Methods / Ethics · IRB / References) that quick-add a named free-markdown section; hidden once used. **"Analysis plan" is no longer a suggested chip** — it is now a typed field, and offering both would create two homes for one concept. (The prior version of this spec also listed a "Hypotheses" chip; hypotheses have been typed since V1.12 B1 and the chip does not exist in the built editor.)
- **Sections** — ordered `{id, heading, contentMd}` (heading ≤200, markdown ≤20000, ≤30 sections), reorder/remove. On a replication these are seeded with the recipe sections (Target effect / Original result / Planned sample / Differences from the original) — see Edge cases.
- **Save overview** — `studies.setOverview` (PendingButton) + a transient "Overview saved" status.

## States

- **Default** — loaded plan; template = stored `templateKey`, or the derived default for a study saved before item ⑤ (see Edge cases).
- **Loading** — server-rendered; resolves before paint.
- **Empty** — new study: Open-ended selected, empty abstract, no hypotheses/variables/outcomes, no sections.
- **Template = Open-ended** — Sampling plan, Variables, Expected outcomes, Analysis plan.
- **Template = Replication recipe** — the same four, **plus the Recipe's own three questions**: Original study, Target effect, Differences from the original. (These map to the verified OSF Recipe keys `77-12` / `77-2` / `77-73`. Before they were typed they existed only as sections auto-seeded onto forks, so a non-fork picking the Recipe had nowhere to state them.) Also shows the replication-notes textarea when the study is a fork.
- **Data-collection: not started** — chip `success`; preregistration is available on the Preregister stage. Includes the recruitment-open-but-nobody-has-taken-it-yet case.
- **Data-collection: collecting / finished** — chip `warning` + explainer; the plan is still editable here, but the Preregister stage blocks freezing a *new* preregistration (see [preregister-stage.md](preregister-stage.md)). Amendments remain available.
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

## Design facts (item ⑨ Phase A) — [ADR-0106](../../04_architecture/adrs/0106-derived-design-facts-and-osf-templates.md)

A read-only panel above the typed plan fields, headed **"From your design"**, with the sub-line *"Read from the study you built. We don't guess what it means — that part's yours."*

**It states facts, never intent.** Every line is read off the frozen snapshot; nothing here is inferred (ADR-0106 D1). What renders — **the procedure only**:

- **Order** — "N screens, in the order you built them." When block-order randomization ships this line states the declared randomization instead; until then it must **not** say "random" (nothing shuffles blocks — `randomizeOrder` is option-order inside one question).
- **Arms** — each condition's name and allocation weight, or "One group (no conditions)" when none exist.
- **Timing** — configured values verbatim: "Timed exposure: 3000 ms", "Forced wait: 5 s".

Nothing here is editable and nothing is stored. It is recomputed on every render, so it cannot go stale — and after preregistration it recomputes from the *frozen* snapshot, so it always describes the filed plan (ADR-0106 D2).

**Empty state.** A study with no blocks yet renders the panel with "Build your study and its design appears here." — not a hidden panel, because the absence is the point at the Overview stage.

### Variables is PRE-FILLED from the study — one list, not three

Owner, 2026-07-16, on seeing Measures / "Measures not yet listed as variables" / Variables side by side: *"why use so many names… I think we need to simplify, it is confusing, especially I see in Measures listed the same items which right below are described as a not yet listed."* Correct — that was a seam between item ⑤ (Variables, hand-added) and item ⑨ (Measures, read from blocks), not a design.

There are only ever **two** concepts, and only one list:

- **what the study collects** — a fact, read from the blocks;
- **what the researcher claims it means** — intent, the role.

So **Variables renders one row per response-collecting block**, pre-filled with the question, the response type, and the block link already set. The role starts at **"— not declared —"**. Choosing a role *is* declaring the variable — there is no separate "Use this" step, no candidate list, and nothing is ever re-typed that the study already contains.

- **Not declaring is normal, not a gap.** An attention check or a demographics item needn't be in anyone's hypothesis. Rows left undeclared are simply not variables, are not filed, and get no nag. What the researcher must never do is re-enter something they already built.
- **Role is never derived.** Only the researcher assigns iv/dv/covariate/exclusion (ADR-0106 D1).
- **"Add a variable"** stays, for variables that are **not** a block — the manipulation is usually the *arm*, not a question. Those have no block link and are plainly researcher-authored.
- **A row whose block is deleted** keeps its stored variable and shows "(removed block)", so the plan never silently loses a declaration.
- **The word is "variable."** A preregistration calls them variables and that is what OSF files; "measure" is not a second concept and must not appear as a second heading.

**Provenance treatment.** A variable whose block link resolves carries a **"From your design"** chip. Editing its name or notes leaves the chip (the *link* is still machine-true); the chip drops only when the block link is cleared. It is a statement about where the link came from, not a lock — nothing is read-only because of it.

### OSF disclosure toggle

At the foot of the panel: **"Note auto-derived sections when filing to OSF"**, a checkbox **checked by default** (ADR-0106 D5, owner direction 2026-07-16 — *"the researcher should be able to manage it… their study"*). Explainer: *"Your OSF filing will say which parts were read from your design rather than written by you. You can turn this off."*

Unchecking is a real choice with no nag and no warning tone. It is opt-out, not a confirmation gate — the researcher owns their filing.

## Open questions

- Live markdown preview in the editor (split view) — still deferred; the editor is author-only for v1.
- **Refresh/override for derived PlanFields** — moot for Phase A: no PlanField prose is ever auto-filled (ADR-0106 D3 rejects it), so there is nothing to refresh. Revisit only if D1's "never derive" list is ever loosened.
- Stricter OSF templates — **Phase B**, now scoped and unblocked. The live read (2026-07-16) confirms `schema_blocks` exposes `required` + the exact select-option strings, so the required-field gate is buildable. Note for that spec: the roadmap's template names are wrong (it's `"OSF Preregistration"`, `"Eye-Tracking Research Methods"`, `"Preregistration Template from AsPredicted.org"`), there are 44 schemas not 14, and Eye-tracking/EEG are out on capability grounds — see ADR-0106.
