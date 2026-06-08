# QA audit — 2026-06-08 — V1.9–V1.11 Answer-based branching + condition builder + undo

## Overview

- **Auditor:** Claude (agent).
- **Scope:** the answer-based-flow arc, shipped iteratively from the owner's live production review (V1.9.0 → V1.11.0). Covers **ADR-0021 + its amendment**: per-block answer conditions, the type-aware AND/OR condition builder, the whiteboard flow wires, block drag-reorder, cross-view consistency, the design-system confirm dialog, and Builder/Whiteboard undo. Also folds in the V1.8.2 polish (editable block title + short `key · version` type display).
- **Verdict:** ✅ cleared for continued use; live on production at each step. **No database migration** anywhere in this arc — all new state (titles, conditions, branch rules) lives in the `definition_snapshot.blocks` JSON we own (ADR-0012).

## What shipped (by tag, on `main`)

1. **v1.8.2** (`030248a`) — editable per-block **title** (`setBlockTitle`) shown as the primary label in the Builder card / Configure panel / whiteboard node + list; module type demoted to secondary `key · version` (dropped the `core/…@` path). ADR-0021 written.
2. **v1.9.0** (`c9ce7f7`) — **answer-based branching engine**: `branchRules` (equality) in the blocks JSON; incremental runtime resolver (`resolveVisibleBlocks`) that recomputes the visible path against answers recorded so far; whiteboard block→block wiring.
3. **v1.10.0** (`7e45771`) — **type-aware AND/OR condition builder** (`lib/whiteboard/conditions.ts` engine + `ConditionBuilder` panel + `setBlockCondition`, superseding equality with a `showIf` tree); canvas condition wires; **block drag-reorder** (`reorderBlocks` + grip/native DnD).
4. **v1.10.1** (`bcbf9ff`) — flat ("is answered") connections (no modal on connect); drag drop-indicator; condition tags in list/Builder previews; multiple incoming wires (multiple parents, OR by default).
5. **v1.10.2** (`af72236`) — **cross-view consistency**: a clause counts only if its source is an earlier block (`conditionWithSources`), enforced in the runtime, canvas, and previews; `reorderBlocks`/`removeBlock` prune forward/dangling clauses (`pruneForwardConditions`); design-system `ConfirmDialog` warns before a destructive reorder.
6. **v1.10.3** (`01018f1`) — the reorder warning lists only conditions the move *actually* breaks (`newlyBrokenByReorder` diffs broken-before vs broken-after).
7. **v1.11.0** (this close-out) — **undo (↶)** in Builder + Whiteboard: `setBlocks` restore mutation + `useBlockHistory` (per-study edit-history stack in sessionStorage).

## Verification

- **Unit/integration:** **200 vitest green** (23 files). New coverage: the condition engine (`evaluateClause`/`evaluateCondition`/`answerValues`/`normalizeCondition`/`operatorsForKey`/`summarizeCondition`/`conditionWithSources`/`clausesBrokenByOrder`/`newlyBrokenByReorder`), the runtime branching path (`resolveVisibleBlocks` walks in order with a running "earlier" set; legacy `branchRules` still honored), and the `move()` reorder helper.
- **Static:** `typecheck` clean, `lint` clean (import-name guardrail active), `next build` clean — whiteboard + compare routes registered.
- **Manifest:** `validate.py` clean (ADR-0021 + amendment registered).
- **Not click-tested by the agent:** the interactive surfaces (condition editor inputs, DnD reflow, the confirm modal, undo across view switches) were verified by typecheck/build + the pure-logic tests and shipped for the owner's live review; the owner drove acceptance per step.

## Consistency model (the load-bearing invariant)

A condition clause on a block is **valid only if its source block comes earlier** in the block order. This single rule is enforced everywhere — the participant runtime, the canvas wires, and the list/Builder "Shown if …" tags all filter through `conditionWithSources`, and `reorderBlocks`/`removeBlock` prune anything that violates it. This closed the owner-reported bug where a reorder left the canvas drawing impossible wires that the panel had already hidden.

## Lock-in / safety review

- No new vendors; React Flow remains MIT and confined to `components/feature/whiteboard/*` (ADR-0020). The condition engine is pure and client-safe (`lib/whiteboard/conditions.ts`), shared by the server runtime and the builder UI so they cannot disagree.
- All new mutations (`setBlockTitle`, `setBlockBranching`, `setBlockCondition`, `reorderBlocks`, `setBlocks`) are `writeProcedure`s scoped to the workspace via `loadWorkingTip`; inputs are zod-validated; `setBlocks` (undo restore) validates block structure and prunes invalid clauses before writing.
- Participant-runtime correctness: completion is decided against the *re-resolved* path after each answer; answers to skipped/forward blocks are ignored; a participant can never be shown a block whose condition references a not-yet-answered block.

## Carry-forwards / deferred (owner-facing)

- **Drag-reorder animation** — current implementation is native DnD with a drop-indicator line; a full FLIP-style tile reflow would need a DnD library (dnd-kit). Offered; not built.
- **Visual nesting** of conditional blocks under a parent — deferred deliberately (a block can have multiple parents, so the inline "Shown if …" tag represents it more honestly than a tree).
- **Gear directly on the wire** — the condition editor currently opens from the selected-block panel; a per-wire inline gear is a possible refinement.
- **Owner to confirm** the flat "is answered" semantics read right, and whether to invest in dnd-kit / nesting.
