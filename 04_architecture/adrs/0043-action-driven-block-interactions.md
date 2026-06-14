# ADR 0043 — Action-driven block interactions (hot-spot regions as the first instance)

- **Status:** accepted
- **Date:** 2026-06-14
- **Deciders:** project owner + Claude
- **Tags:** participant-runtime, blocks, branching

## Context

Until now every block was a **measurement**: it records an answer and the runtime decides the next screen by `showIf` (ADR-0021). The owner asked for hot-spot regions that *do something* on click — "go to a question, a condition, a link… propose more." That turns a region from a passive target into an **action trigger**, which crosses an architectural line worth recording. The `spatial-followups` workflow + its adversarial review settled the shape; this ADR is the gate for the action variants (the `visible?` flag was a pure render attribute and shipped as an ADR-0041 amendment, not here).

Two framing corrections from the review:

- **"Go to a condition" doesn't map.** Conditions are the between-subjects arm, **random-assigned at `startResponse`** and not participant-navigable. What the owner wants is captured by **`setValue`** (tag the respondent) feeding the existing `showIf` engine, or by branching on the recorded region selection directly.
- **"Go to a question" already exists.** A region click is recorded as the answer; downstream blocks can `showIf` on it today. So we add *new side effects on click*, not a second navigation engine.

## Options considered

### Action model — Option A: a per-region tagged union, defaulting to `record` (chosen)

Each region gains an optional `action` discriminated on `type`. Absent ⇒ `{type:"record"}` (today's behavior), so every existing snapshot is unchanged. Variants:

- **`record`** — selection recorded; no side effect.
- **`link` `{url}`** — clicking opens an `https` URL in a new tab **and** records the selection. Open-redirect-safe: `https`-only via a zod `.refine` in the registry config schema **and** re-validated at render (`new URL(u).protocol === "https:"`); `window.open(url, "_blank", "noopener")`, only on a participant click, never an auto-navigate. The URL is researcher config, not participant input, so it's not an injection vector. (Note: end-redirect is **not** an https-only precedent — it accepts `http:` too; hot-spot `link` is deliberately stricter.)
- **`advance`** — records the selection and submits the screen to advance (image-as-menu). **Does not bypass validation:** the region button stays `type="button"` and calls `form.requestSubmit(continueBtn)` through the real Continue (`data-take-continue`), so `recordScreenAnswers` still validates every sibling block server-side; a required-and-empty sibling returns `answer_required` and re-renders. Single-select. The Builder warns when hot-spot isn't the sole/last block on its screen.
- **`setValue` `{key, value}`** — writes `key→value` into the **answer payload** (`answer.tags`, a `Record<string,string>`) and records the selection, for analysis or downstream `showIf` branching.

### Where `setValue` writes — Option A: the answer payload (chosen) · Option B: `response.metadata`

- **A (chosen):** fold tags into `response_item.answer.tags` (jsonb). It's already per-block, per-respondent, validated, and surfaced by `getResults`/export with zero new plumbing, and stays in the snapshot/answer JSON (ADR-0012) — **no migration**. A tag is intrinsically tied to *this block's interaction*, so answer-level is the right grain.
- **B rejected:** `response.metadata` **does not exist** — the `response` table has only `clientMetadata` (the embedded-data write to `response.metadata` was a silent no-op; see ADR-0042's 2026-06-14 amendment). Routing tags there would repeat that bug.

## Decision

Add the `action` tagged union to the hot-spot region config (optional, default `record`) and extend the response schema to `{ selected: string[], tags?: Record<string,string> }`. Participant render: `link` opens the URL + records; `advance` records + `requestSubmit`s the real Continue; `setValue` writes a tag + records; `record` unchanged. **`validateAnswer` is default-deny for tags** — a tag key is accepted only if some region's `action` is `setValue` with that key (mirrors the existing stray-`selected` rejection), so a forged client tag can't drive branching. Tags appear in the CSV via `stringifyAnswer` (appended to the live return, not the dead branch) and optionally on the hot-spot Explore payload. Keyboard parity holds automatically — every region is a `<button>` (Enter/Space fire the action); `link`/`advance`/`setValue` need no pointer.

Backward-compatible + migration-free: `action`/`tags` are optional and additive; old `{selected}` answers and old region configs validate unchanged.

## Consequences

- **Easier:** image-as-menu (advance), in-stimulus links, click-to-tag for analysis/branching — without a bespoke navigation engine.
- **Harder:** the hot-spot block is now multi-modal; the Builder must explain the per-region action + warn on `advance` misuse. The action union is the seam other blocks could reuse later (hence the ADR, not just an amendment).
- **Committed to:** actions default to `record`; `setValue` lives in the answer (never `response.metadata`); `link` is https-only + participant-clicked; `advance` never bypasses sibling validation; default-deny tag validation.
- **Precluded from:** participant-driven condition/arm navigation (arms are random-assigned); auto-navigating links; arbitrary goto (branching stays `showIf`-based).

## Revisit triggers

- A second block wants actions → lift the union into shared block metadata rather than per-block config.
- Researchers want richer targets (jump-to-named-screen) → design an explicit navigation primitive (a real superseding ADR), not more action variants.

## Follow-up (2026-06-14) — branching ergonomics

Two refinements after the owner asked "how exactly do I branch on a region, and why do I see just Finish?":

- **Condition builder picks by label, stores the key.** The "Show this block when …" value field was free text — branching on a hot-spot region meant typing its raw key (`r1`/`r2`). It now renders a **dropdown of the source block's choices by label** (hot-spot regions, multiple-choice/attention-check options), storing the recorded value; multi-value operators (`is any of`) render a checkbox set. Free-text/numeric sources keep the text input. So "show block 3 when hot-spot **is** Region 2" needs no key knowledge. (`valueOptionsForSource` in `condition-builder.tsx`.)
- **No premature "Finish."** Forward branching means a block conditional on the *current* screen's answer is hidden (so uncounted) while that screen is shown — the runtime would label the button "Finish" even though answering might reveal another screen. `getRuntimeScreen` now returns `mayContinue` (`pathMayExtend`: a hidden block's answer-condition references a block on this screen), and the screen shows **"Continue"** instead of "Finish" in that case — biased toward Continue (Continue-then-end is less jarring than Finish-then-more). This confirms the existing runtime already *reveals* the conditional block after the answer (`recordAnswer` re-resolves the path); only the label was wrong.

## References

- spatial-followups + hotspot-actions-signature-auth-design workflows + adversarial reviews (2026-06-14)
- [ADR-0041](0041-image-interaction-blocks.md) (hot-spot block + the `visible?` amendment-c), [ADR-0021](0021-answer-based-branching.md)-era `showIf` branching, [ADR-0042](0042-flow-blocks.md) (the `response.metadata` non-existence the `setValue` decision avoids), [ADR-0012] snapshot model (no migration)
- Wireframes: [hot-spot](../../03_design/wireframes/hot-spot.md), [hot-spot-region-editor](../../03_design/wireframes/hot-spot-region-editor.md)
- Code: `server/modules/registry.ts` (hot-spot `action` + `tags`), `components/feature/take/hot-spot-input.tsx`, `components/feature/builder/configure-form.tsx` (`RegionsEditor`), `app/(take)/take/[studyId]/actions.ts` (extract `tags`), `server/trpc/routers/studies.ts` (`stringifyAnswer` tags)
