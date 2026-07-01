# ADR 0021 — Answer-based branching (skip logic)

- **Status:** accepted
- **Date:** 2026-06-07
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, runtime, builder, whiteboard, v1.9

## Context

V1.8 shipped Whiteboard mode where blocks are nodes and **condition-arm** visibility rules (ADR-0014: `visibility.showIfCondition` = randomization arms assigned at the *start* of a session) are wires from a "Condition" node to a block. Reviewing it live, the owner asked for the thing the canvas naturally suggests: **wire one block to another, where the participant's path depends on their answer** ("if they answer Yes on A, show B next; otherwise skip it") — and a block may branch to more than one target.

That is **answer-based branching / skip logic**, which the current model does not have. Arm conditions are fixed per session; branching is *dynamic* — what a participant sees next depends on what they just answered. The V1 runtime (`server/runtime/participant.ts`) precomputes the visible block list once (`visibleBlocks(snapshot, conditionSlug)`) and indexes into it linearly; that assumption breaks when visibility depends on answers collected mid-session.

Prior ADRs in play: **ADR-0012** (blocks live in `definition_snapshot.blocks`, opaque JSON we own → no migration to add fields), **ADR-0014** (condition arms + the response/response_item model holding answers), **ADR-0020** (Whiteboard is a translation layer over the blocks array).

## Options considered

### Option A — Per-target answer rules in the blocks JSON, dynamic runtime resolution (chosen)

- Add an optional `branchRules` to each block instance in `definition_snapshot.blocks` (no migration — same place `visibility` lives): `branchRules?: { fromInstanceId: string; equals: string }[]`. A block with `branchRules` is shown only if **at least one** rule matches — i.e. the participant's recorded answer to `fromInstanceId` equals `equals` (OR across rules; arm `showIfCondition` must also pass — AND between the two systems).
- Whiteboard: a block→block wire **A → B labelled "Yes"** stores `{ fromInstanceId: A, equals: "Yes" }` on B. Multiple wires out of A (to B, C…) with different values = answer-dependent fork; multiple wires into B = OR.
- Runtime: resolve the path *incrementally* — at each step, recompute the visible set from (arm) AND (branchRules evaluated against answers recorded so far). Rules reference **earlier** blocks (the answer is already recorded); a rule whose source hasn't been answered yet is treated as not-matched (the target stays hidden until then).
- **Pros:** no schema migration; reuses the existing answers (`response_item`); composes with arm conditions; the data shape stays "ours" (Whiteboard + Builder both read it); equality-on-answer covers the overwhelming majority of skip-logic needs.
- **Cons:** progress total becomes path-dependent (the V1 linear `position/total` is now an estimate); re-answering an earlier block can change the downstream path (must re-resolve, and orphaned answers to now-skipped blocks must be ignored on completion). The runtime stops being "index into a fixed list".

### Option B — A separate `branch_edge` table + a graph executor

- Model edges relationally and walk a graph at runtime.
- **Pros:** queryable; clean for very complex flows.
- **Cons:** a migration + a second source of truth alongside the blocks array (Whiteboard/Builder would reconcile two models); heavier than equality-rules need for V1. Rejected for now; revisit if rules outgrow equality.

### Option C — Full expression language (AND/OR/operators across multiple sources)

- `>=`, `<`, `contains`, boolean combinators.
- **Pros:** maximally expressive.
- **Cons:** needs a rule editor UI + an evaluator + validation; over-built for the first version. We start with equality (Option A) and can grow the operator set later without changing the storage shape.

## Decision

We will implement **Option A**: per-block `branchRules` (equality on an earlier block's answer) stored in the blocks JSON, evaluated by an incremental runtime resolver, drawn as labelled block→block wires on the Whiteboard. Arm conditions (ADR-0014) and branch rules coexist (both must pass).

Build order: (1) data shape + a `setBlockBranching` mutation; (2) runtime resolver + unit tests (the load-bearing, correctness-critical part — recompute visible blocks against recorded answers; ignore answers to skipped blocks at completion); (3) Whiteboard block→block wiring + per-wire value editing; (4) Builder surface for viewing/editing rules.

## Consequences

- **Easier:** real skip-logic studies; the Whiteboard's block→block wires finally mean something; no migration.
- **Harder:** progress UI (`position/total`) is now an estimate, not exact; the runtime resolver must handle re-answers (path changes) and completion (don't require answers to skipped blocks); preview should show all blocks (it already does, with a note).
- **Committed to:** equality-on-prior-answer semantics; rules reference earlier blocks; OR within a block's rules, AND between branch + arm. The blocks JSON is now the single source for structure, arm-visibility, AND branching.
- **Precluded (for now):** relational edge model (Option B); a full expression language (Option C) — both remain open via extension of the same storage.

## Revisit triggers

- Researchers need operators beyond equality (ranges, multi-select contains) → grow `branchRules` (add `op`), keep storage.
- Flows get complex enough that a relational/graph model + a visual valid(no-orphan / no-cycle) checker is worth it → Option B.
- Cycles become possible (a rule referencing a later block) → add cycle detection + define semantics.

## References

- ADR-0012 — block format + autosave (where `branchRules` lives, no migration).
- ADR-0014 — condition arms + response/response_item (the answers branch rules read).
- ADR-0020 — Whiteboard canvas (the surface that draws the block→block wires).
- `05_app/server/runtime/participant.ts` — `visibleBlocks`/`getRuntimeQuestion` (the resolver to make incremental).

---

## Amendment (2026-06-07) — richer condition model + order-spine wires

Reviewing the first cut live, the owner refined the model. Two changes, both within the chosen Option A "order + conditional wires" approach (the runtime stays order-based; conditions gate visibility — no graph rewrite):

1. **Wires reflect list order (the spine).** The whiteboard draws a wire between each consecutive pair of blocks (in block order), so every block is visibly connected — a block with no wire "looks like an element I considered but never added." A wire is **flat** (no condition) by default; the block sequence is unchanged by flatness.

2. **The condition is a type-aware compound tree, edited from the wire.** Each wire carries a **settings button** that opens a condition editor for the transition *into* its target block: "show this block only if …". The editor's inputs depend on the **source** block's module type — a stimulus (social-post) has no answer so its wire is **flat-only**; Likert/slider are numeric (`=, ≠, ≥, ≤, between`); single-select is option-based (`is`, `is any of`); multi-select is membership (`includes any of`); free-text is `is` / `contains`. Clauses combine with **AND / OR**.

### Data (supersedes the equality-only `branchRules`)

A block gains an optional `showIf` condition group in the blocks JSON (still no migration):

```
showIf?: { op: "and" | "or"; clauses: Clause[] }
Clause = { fromInstanceId: string; operator: Operator; value: string[] }
Operator = "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"between"|"is"|"isAnyOf"|"contains"|"includesAny"
```

Legacy `branchRules` (equality-OR) are read as the group `{ op:"or", clauses: rules.map(eq) }` for back-compat; new writes use `showIf`. The pure model + evaluator + the type→operator menus live in a shared, client-safe `lib/whiteboard/conditions.ts` so the **runtime** (`resolveVisibleBlocks`) and the **builder UI** evaluate/offer identically.

### Runtime

`branchVisible` becomes "evaluate the block's `showIf` (or legacy `branchRules`) group against the answers recorded so far." Group `op` is AND/OR over clauses; each clause applies its operator to the source block's answer value(s) (normalized by `answerValues`). Everything else (incremental resolution, completion against the updated path, ignoring orphaned answers) is unchanged.

### Build order

(1) `lib/whiteboard/conditions.ts` — types + operator menus + pure evaluator + tests; (2) wire it into the runtime resolver (keep legacy branchRules working) + `setBlockCondition` mutation + `StudyBlock.showIf`; (3) UI — auto-drawn order-spine wires, a wire settings button, and the type-aware AND/OR condition editor. Drag-reorder of blocks (Builder + list) ships alongside the UI step.

### Consequences delta

- The block array order is now also the **visual spine** on the canvas (auto-wired), not just the data order.
- Conditions are compound + typed (Option C capabilities arrive, but stored in the same blocks JSON — no migration).
- Stimulus blocks can't be a condition source (no answer) — the editor offers only a flat wire from them.
