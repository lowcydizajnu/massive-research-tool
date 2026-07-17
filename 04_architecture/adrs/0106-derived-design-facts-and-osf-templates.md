# ADR 0106 — Item ⑨: derived design facts, and the OSF template picker

- **Status:** accepted
- **Date:** 2026-07-16
- **Deciders:** Paweł Rosner
- **Tags:** preregistration, osf, integrity, templates

## Context

LOS Round 2 item ⑨. Two unrelated deliverables have been filed under that number, and this ADR separates them because they are different projects:

- **ADR-0101 D-provenance (:52, :58, :67)** — the *auto-deriver*: fill `source: "derived"` on the typed plan fields from the built study.
- **ADR-0101 :46** — the *OSF template gate*: required-field handling + late-400 surfacing, which is what stands between us and the OSF templates beyond our two.

Owner direction 2026-07-16: **both, deriver first**, because *"the goal was also to make user able to select templates provided by osf"*. So: **Phase A** the deriver, **Phase B** the picker.

The roadmap's framing was: *"our studies are already built from method-specific blocks, so we can auto-derive the method/design sections — the plan writes itself; the researcher fills only the reasoning."* Grounding against the code corrects that on three points.

**The premise is capability-bound.** The insight names Eye-tracking and EEG/ERP as the strategic opening. We have **zero** gaze and **zero** EEG capability — all 54 core blocks are questionnaire/stimulus/timing. Filing those method sections would mean preregistering a method the platform cannot run, which is the invention rule's worst case wearing a domain-expertise costume.

**"14 templates" is wrong.** Live enumeration of `GET /v2/schemas/registrations/` on 2026-07-16 returns **44 active schemas**, and the insight's names — sourced from a newsletter, never verified — do not match `attributes.name`, which is the only thing `resolveSchemaId` matches on. "Eye-tracking" is really `"Eye-Tracking Research Methods"`; "AsPredicted" is `"Preregistration Template from AsPredicted.org"`; the doc's "Replication Recipe pre/post" is the **2013** pair, while the one we actually file is **2014**. Many of the 44 are provider-specific and irrelevant to us (Character Lab, YOUth, EGAP, ASIST, Global Flourishing, Services, Platform), and one is literally `"Outdated EGAP Registration (DO NOT USE)"`.

**The most standard sentence in a method section would be a lie.** Nothing in this codebase randomizes block order. `randomizeOrder` shuffles *options inside a multiple-choice question*; blocks execute in snapshot array order. A deriver that emitted "presented in random order" would fabricate exactly the line a reviewer most expects.

## Options considered

### Option A — Derive facts only; the researcher decides what they mean *(chosen)*

A read-only, recomputed "Design facts" panel of what is true by construction, plus candidate variables carrying the data type read off each block's `responseSchema`. An explicit per-row **"Use this"** is the only thing that writes `source: "derived"`. No prose is auto-filled.

- **Pros:** cannot fabricate — everything shown is read directly off the snapshot; no staleness, because nothing derived is stored; fills exactly the slot ADR-0101 built and nothing more; delivers the actual asymmetry (OSF cannot read your design).
- **Cons:** unglamorous next to "the plan writes itself"; the researcher still writes every sentence of reasoning.

### Option B — Auto-fill the plan prose (`samplingPlan`, `analysisPlan`, a procedure narrative)

The roadmap's literal reading: generate the method/design sections as text with `source: "derived"`.

- **Pros:** the biggest visible time-saving; closest to the newsletter framing.
- **Cons:** **it requires inventing.** An analysis plan is a statistical commitment, and a response type is not a test; nothing in a block says "two-sided t-test". A procedure narrative wants "presented in random order" — which nothing in this codebase does. And stored derived prose is a second source of truth that silently disagrees with the blocks the moment the study is edited. A preregistration is a scientific commitment; a field that overstates what the system knows is worse than an empty field.

### Option C — Ship the OSF template picker first, deriver later

ADR-0101 :46's deliverable on its own: required-field gate + late-400 handling, unlocking OSF Preregistration / AsPredicted / Social Psychology.

- **Pros:** directly answers *"make user able to select templates provided by osf"*; needs no derivation at all.
- **Cons:** the picker's value multiplies once the design facts exist to fill it — 16 required questions is a lot of typing the deriver can inform. Owner chose deriver-then-picker for exactly this reason, so this becomes **Phase B**, not a rejection.

### Option D — Domain templates (Eye-tracking, EEG/ERP) as the roadmap suggests

- **Pros:** the newsletter's headline opening.
- **Cons:** **rejected on capability.** We have zero gaze and zero EEG blocks. Filing those method sections would preregister a method the platform cannot run — inventing, wearing domain expertise as a costume.

## Decision

**Phase A — the study describes itself; the researcher decides what it means.** We derive *facts that are true by construction*, never prose about intent. **Phase B — a real template picker**, built on the schema structure OSF actually exposes.

### D1 — Derive facts, never intent

Derivable, because it is read directly off the frozen snapshot (never inferred):

- the block inventory **in snapshot order**, each block's configured values verbatim (`exposureMs`, `waitSeconds`, likert anchors and its 1–7 bound, `maxPoints`, …)
- arms: slugs, names, allocation weights — or the implicit single `control` when none exist
- which blocks are gated to which arms (`visibility.showIfCondition`)
- per-variable **data type**, read from the linked block's `CoreModuleDef.responseSchema`
- materials, deception attestations, divergence notes

**Never derived** — each is intent, and stating it would be invention:

| Tempting | Why it's a lie |
|---|---|
| "presented in random order" | **today** nothing shuffles blocks; `randomizeOrder` is option-order. See the note below — this row is time-bound, not permanent |
| an **analysis plan** | a response type is not a statistical test |
| **hypotheses** / expected outcomes | pure intent |
| a variable's **role** (iv/dv/covariate/exclusion) | intent — derive the *candidate*, never the role |
| the **construct** measured | no citation/scale field exists on any module; guessing it from a prompt string is invention |
| "treatment vs control" | arm semantics are undeclared; only "shown only to [slugs]" is true |
| "participants failing the attention check were excluded" | no exclusion rule exists anywhere |

**Randomization is a missing feature, not a fact of life.** Owner direction 2026-07-16, on being shown that nothing shuffles blocks: *"regarding randomizer — it is feature/functionality we need to add to our app."* Correct, and it is a real gap for an experiment platform: presentation-order randomization and counterbalancing are standard method, and their absence is arguably a larger hole than this ADR's own subject.

That does **not** loosen D1. Until block-order randomization actually ships, "presented in random order" stays a lie and the deriver must not say it. What it changes is the shape of the fix: randomization must be **declared in the snapshot** (a design decision the researcher makes and the runtime obeys), not an emergent runtime behaviour — because a fact the deriver can read is a fact a reader can trust. Built that way, the row flips from "never" to "true by construction" the day the feature lands, with no change here beyond deleting a row. Built as runtime-only shuffling with nothing in the snapshot, it would be *permanently* underivable and the preregistration could never state it.

**Its own ADR, its own unit** — it touches the runtime, the Builder, the export, and the participant assignment path, none of which item ⑨ goes near. Sequenced after Phase A per the owner's "Ok, go", but the dependency runs the other way round: the deriver gets more valuable once there is a randomization decision to report.

### D2 — Compute, never store

Derived facts are recomputed on render and **never persisted as prose**. Persisted derived text is a second source of truth that silently disagrees with the blocks the moment the study is edited — the same hazard ADR-0101 D-variables already refuses for data types ("the data type is DERIVED from the linked block's responseSchema, never stored").

Freeze is the reprieve, not the risk: at preregistration the plan and the blocks freeze inside the **same** `definitionSnapshot`, so anything recomputed from that snapshot is unfalsifiably current for that filing.

**Read the RAW snapshot** (`readBlocks`), never the Builder's tRPC read — `studies.ts:1884` merges the module's *current* defaults under the saved config, so an untouched field is indistinguishable from a deliberate choice, and a field added to a module after the block was saved appears as though it were configured.

### D3 — The only thing that writes `derived` is an explicit, per-row act

The panel offers candidate variables (name + linked block + data type). **"Use this"** copies one into `variables[]` with `source: "derived"` and the `instanceId` link. Nothing else writes `"derived"`; no PlanField prose is ever auto-filled.

**Rejected:** auto-filling the five PlanFields. That is D1's "never" list wearing a helpful face.

### D4 — Provenance is server-computed, and the clobber gets fixed first

Two defects block D3 and must land with it:

1. `overview-editor.tsx` seeds state from `.text` only and hardcodes `source: "researcher"` back onto all five PlanFields on every save. The moment anything writes `"derived"`, a researcher opening Overview and pressing Save silently reverts it — **the exact clobbering ADR-0101 :52 says the slot exists to prevent**. (`variables[]`/`expectedOutcomes[]` survive; the five PlanFields do not.)
2. `studies.ts:121` accepts `source: "derived"` **from the client**, so provenance is forgeable. A claim about who authored a scientific commitment must not be assertable by the browser.

**Server computes `source`**: a variable is `derived` iff it carries an `instanceId` the server can resolve against the snapshot. Anything else is `researcher`.

### D5 — The OSF disclosure is a researcher-controlled toggle, default ON

`osf-recipe.ts` reads `.text` and ignores `.source`, so a derived plan would file to OSF as though a human wrote it. The filing now notes which parts were auto-derived from the built study.

Owner direction: *"user/researcher should be able to manage it — at the end of the day it is his study, so we should solve it with some toggle/checkbox selected by default."* So it is **opt-out, not forced**: default ON (the honest default and a genuine selling point — the design facts are machine-true, not recalled), with the researcher free to turn it off. Their study, their filing.

### D6 — Phase B: the picker is built on `schema_blocks`, which we have now read

Verified live 2026-07-16 — this is the contract the picker needs, and none of it needs guessing:

- `GET /v2/schemas/registrations/{id}/schema_blocks/` returns every block with `registration_response_key`, **`required`**, `block_type`, `display_text`, `help_text`, `example_text`, `index`, `schema_block_group_key`.
- `block_type` ∈ `page-heading | question-label | long-text-input | single-select-input | multi-select-input | select-input-option | file-input`.
- **Select options are sibling blocks**: a `select-input-option` run follows its parent question, each carrying the exact submittable string in `display_text`. No enum guessing.
- **"OSF Preregistration"** (`697b72f611a8e98484c6139b`, v4): 87 blocks, 29 questions, **16 required**. This is why item ⑤ scoped v1 to the two all-optional schemas.

**We already know the answer to one of its required questions.** `344-4` is data-collection-status ("Data does not yet exist…"), which item ⑤ already enforces as a hard gate (`assertPlanBeforeData`). The gate's fact fills OSF's required field.

**Curate, don't enumerate.** 44 schemas, most irrelevant. The picker exposes a reviewed general-purpose subset; a provider-specific or `DO NOT USE` schema is never offered. Selection stays **by name** (`resolveSchemaId`) but the curated list records **id + version** so drift is detectable — ADR-0101 :68's revisit trigger, now actionable.

**Late-400 handling is required, not optional.** `osfApi` throws a raw `OSF POST … failed: <status> <text>`. A required-field rejection must name the question, not the status code.

## Consequences

- **Easier:** the method section stops being retyped from memory; OSF's own required questions become fillable.
- **Harder:** we can never claim randomization, constructs, or analysis intent from blocks — and shouldn't.
- **Committed to:** derived = computed, never stored; provenance decided server-side; the disclosure default-on but the researcher's to control.
- **Precluded from:** offering Eye-tracking/EEG templates while the platform cannot run those methods.
- **Accepted cost:** the derived panel is read-only and unglamorous next to "the plan writes itself". It is the version that is true.

## Revisit triggers

- **Block-order randomization ships (owner-confirmed as planned scope, 2026-07-16)** → the randomization row moves from "never" to derivable, *provided it is declared in the snapshot* (D1's note). This is the one revisit trigger already known to be coming.
- A module gains construct/instrument provenance (scale name, citation) → "we measured X using Y" becomes derivable.
- A structured exclusion rule ships → the exclusion row moves.
- OSF revises a curated schema under the same name → the recorded id+version detects it (D6).

## References

- [ADR-0101 — preregistration templates + typed fields](0101-preregistration-templates-typed-fields.md) — created the `FieldSource` slot this fills; :46 is Phase B's origin.
- [ADR-0005 — OSF registry adapter](0005-osf-registry-adapter.md) — `resolveSchemaId` matches `attributes.name`; its `filter[name]` note is stale (that call 400s).
- [LOS alignment insight](../../01_research/insights/los-alignment-and-templates.md) — **corrected here** on three points: the template count (44, not 14), their names, and the eye-tracking/EEG premise.
- Live OSF reads, 2026-07-16: `GET /v2/schemas/registrations/` (44 active); `GET /v2/schemas/registrations/697b72f611a8e98484c6139b/schema_blocks/` (87 blocks, 16 required questions, `select-input-option` siblings).
