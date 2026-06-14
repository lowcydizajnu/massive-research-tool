# Design system — response modules (config fields + participant inputs)

> **Status:** v0.1 (2026-06-03, V1.6 PR-1a). Documents the field patterns the Builder config form and the participant runtime use for the V1.6 response modules. Extends `build-stage-builder-mode.md` (Builder right panel) + `participant-runtime.md` (participant render). Tokens by name only (`tokens.md`); no raw hex.

## Scope

V1.6 introduces real response modules beyond the V1.5 likert-7 + social-post placeholder. This entry defines (a) the Builder config field types and (b) the participant input patterns shared across them. Per-module specifics live in the module registry (`server/modules/registry.ts`); this doc is the visual/interaction contract.

## Builder config field types (right-panel Configure)

The Configure form is value-type-driven (one control per config key):

| Config value type | Control | Notes |
| --- | --- | --- |
| `boolean` | checkbox | commits immediately |
| `string` | single-line text input | commits on blur |
| `number` | number input (`min`/`step` where sensible) | commits on blur; coerced |
| `string[]` | **option-list editor** | rows with edit + remove (✕) + an "Add option" button; commits on change. Used for multiple-choice options, ranking items. |

- Each control has a `<label>` (humanised key) or `aria-label`.
- Enum-valued config (e.g. social-post `veracityGroundTruth`) renders as a text input in PR-1a and is validated server-side against the module's Zod enum (an invalid value surfaces the generic "Invalid block config" error). Typed select controls are a follow-up refinement (tracked for a later PR); not a blocker for the modules to function.
- Validation + completeness stay server-authoritative (the registry Zod schema); the form never blocks input, it reflects the saved state.

## Participant input patterns (the `/take` BlockView)

Server-rendered, native controls (ADR-0013: no client router; minimal JS), labelled for AT:

- **Single choice** (multiple-choice, `multiple:false`): a `fieldset`/`legend` with native radios (`name="value"`-style), one per option; each radio has an accessible name.
- **Multi-select** (multiple-choice, `multiple:true`): the same fieldset with checkboxes; ≥0 selected (or ≥1 when required).
- **Free text**: a labelled `<input>` (short) or `<textarea>` (long), with `maxLength` when configured; the prompt is the field label.
- **Stimulus** (social-post): read-only card — source byline, Plex Serif headline, body; the new veracity/topic-tags fields are researcher metadata (NOT shown to participants — ground truth must not leak into the stimulus).
- **Likert-7** (existing): 7 native radios with anchor labels; accessible names fixed in `bd1792f`.
- **Order randomisation** (`randomizeOrder`): when set, options are emitted in a participant-deterministic order seeded from `response.id` (same participant sees the same order on resume).

## Results treatment (per answer shape)

- **Numeric** (likert): mean + n (existing).
- **Categorical** (multiple-choice): per-option selection counts + n; no mean.
- **Text** (free-text): n only on screen; raw text per response in the CSV (one column per question, as today).
- **Spatial** (heat-map / hot-spot / graphic-slider, ADR-0041 + amendment): two tiers, both built only from existing v0.6 primitives (`--color-primary` fills at varying opacity, chips, segmented controls, native range, divs-as-bars — no new design-language decisions).
  - *Inline on Results* — the aggregate `SpatialOverlay`: the stimulus image with all clicks dotted (heat-map), region rectangles shaded by hit-share + count (hot-spot), or marker positions strewn along the track (graphic-slider). Decorative layer is `aria-hidden`; counts are the authoritative text.
  - *Dedicated Explore surface* (`…/results/explore/[instanceId]`, [spatial-explore](../wireframes/spatial-explore.md)) — condition-filter chips, Aggregate↔Per-respondent + (heat-map) Dots↔Density segmented controls, an opacity slider, and a block-type readout (hot-spot region-counts table / graphic-slider value histogram + mean·median·n / per-respondent meta). Dots are hard-capped with auto-switch to a fixed density grid (perf). The text readout — not position/color — carries the data for AT.

## Accessibility notes

- Every input has a programmatic label; radio/checkbox groups are wrapped in `fieldset`/`legend` (the prompt is the legend).
- Required questions are enforced server-side; the participant sees an inline `role="alert"` message (`answer_required` / `invalid_answer`) on the same page, never a silent drop.
- The option-list editor's remove buttons have accessible names ("Remove option {n}").
- No color-only signalling; selection state is native control state.
