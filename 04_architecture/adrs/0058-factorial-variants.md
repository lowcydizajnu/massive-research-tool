# ADR 0058 — Factorial variants (A/B, 2×2, …)

- **Status:** proposed
- **Date:** 2026-06-20
- **Deciders:** Project owner, Claude
- **Tags:** study-model, runtime, builder, experimental-design

## Context

> What is forcing this decision?

Researchers run the *same* study in several **variants** that differ only in some data — a post's like-count low vs high ("social influence"), a gain- vs loss-framed message — as A/B or factorial designs (2×2, 3×2, …). Today the app has three nearby primitives but none fits: **conditions** (ADR-0014) are *within-study* randomized arms; **versions** (ADR-0012) are snapshots of one study; **forks/replications** (ADR-0018) are cross-study copies. The owner was explicit (and a standing note agrees): a *variant is not a condition* — conditions can live *inside* a variant; variants are a level above, defined by **factors × levels** where specific block fields take different values per cell while everything else is shared.

What's needed: define factors/levels, generate the cells, bind which fields vary, **edit shared content once** (it propagates to every cell), keep cells **connected + trackable**, run them as **one between-subjects study** (each participant randomized to a cell), and split results by cell. The owner is not fully certain on the model and asked to **keep it reversible**.

## Options considered

> ### Option A — Factor × level matrix on one study (chosen)
> - The study snapshot gains `factors` (each with `levels`) and `variantBindings` (a bound block-field → per-level values). Cells = the cross-product of levels. Shared content stays the single source of truth; cells store only overrides. At run time each participant is assigned a cell; block configs are resolved by applying that cell's overrides.
> - **Pros:** matches the factorial mental model; bulk-edit shared once = "follow changes" for free; connected by construction; reuses the snapshot-jsonb pattern (mostly migration-free); one recruitment.
> - **Cons:** the runtime must resolve overrides; results/export must carry a cell dimension; biggest build.

> ### Option B — Linked sibling studies
> - Each variant is its own study (fork) in a "variant group" + a compare/bulk tool.
> - **Pros:** reuses forks; loosely coupled.
> - **Cons:** bulk-edit + exact "follow changes" are hard (N real copies drift); more to manage; weaker analysis story.

> ### Option C — Variant axis on versions
> - Multiple named variant-versions under one study.
> - **Cons:** conflates "a saved snapshot" with "a design cell"; muddies preregistration/versioning semantics.

## Decision

> A single, declarative sentence.

**We will model variants as Option A — a factor × level matrix on one study: factors/levels + field-level variant bindings live additively in the definition snapshot; cells are the cross-product; shared content is the source of truth and cells hold only per-level overrides; one recruitment assigns each participant a cell (between-subjects, uniform by default), recorded additively on the response; results + export gain a cell dimension. The whole feature is flag-gated and additive so it can be reverted or re-modelled (e.g. to Option B) without trapping data.**

Reversibility is a first-class constraint: a study with zero factors behaves exactly as today; deleting all factors leaves no residue; the only schema change is **additive** (a nullable `response.variant_cell` jsonb for the assignment — everything else rides the snapshot jsonb like `consent` / `groups` / `showIf`).

## Consequences

> - **What becomes easier.** True factorial designs without N copies; one place to edit shared content; per-cell preview + the flow diagram's cell split; per-cell results.
> - **What becomes harder.** The participant runtime must resolve a cell's overrides before rendering a block; results/export carry a cell dimension; preregistration readiness must check every level has its bound values; the flow diagram + live preview need a "previewing cell" selector.
> - **What we are now committed to.** Shared-content-as-source-of-truth (cells = overrides only); between-subjects assignment recorded immutably; factor structure frozen on a registered study (changes = amendment, ADR-0004).
> - **What we are now precluded from (for now).** Adaptive / sequential assignment; per-cell *structural* differences (different blocks per cell) — cells differ only by *bound field values*, not by which screens exist.

## Revisit triggers

> Conditions under which we reopen this.

- The owner decides variants should be separately *run / recruited* (not one randomized study) → reconsider Option B's linked-siblings.
- Researchers need cells that differ structurally (different blocks), not just data → the override model must grow.
- Matrices routinely exceed ~12 cells → assignment / auth / results ergonomics need rethinking.
- Per-cell allocation weights or interaction-specific (multi-factor) bindings become required.

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0014 response data model & conditioning](0014-response-data-model-and-conditioning.md) (conditions = within-cell arms; assignment precedent), [0012 block format & autosave](0012-block-format-and-autosave-semantics.md) (snapshot-jsonb additive pattern), [0028 question groups & screens](0028-question-groups-and-screens.md), [0021 answer-based branching](0021-answer-based-branching.md), [0044 make-live & version-spanning results](0044-make-live-and-version-spanning-results.md) (results-dimension precedent), [0004 preregistration amendments](0004-preregistration-amendments.md), [0057 study flow diagram](0057-study-flow-diagram-and-live-preview.md) (cell split + previewed-cell selector).
- Flow: [run-a-factorial-study](../../02_product/user-flows/run-a-factorial-study.md). Wireframe: [variant-matrix](../../03_design/wireframes/variant-matrix.md).
- Code touchpoints: `server/modules/blocks.ts` (snapshot), `server/runtime/participant.ts` (assign cell + resolve overrides), `server/trpc/routers/studies.ts` (variant mutations + results), `lib/whiteboard/flow.ts` (cell split), `components/feature/builder/*` (matrix editor), `lib/export/dataset.ts` (cell column).
