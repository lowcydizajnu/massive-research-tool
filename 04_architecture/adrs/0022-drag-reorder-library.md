# ADR 0022 — Drag-reorder library (dnd-kit)

- **Status:** accepted
- **Date:** 2026-06-08
- **Deciders:** project owner, Claude (agent)
- **Tags:** ui, builder, whiteboard

## Context

V1.10 shipped block drag-reorder in the Builder list and whiteboard List using the native HTML5 drag-and-drop API (a grip handle + a drop-indicator line). On live review the owner found the interaction stiff — there is no smooth reflow as you drag (native DnD has no built-in animation, and items snap rather than slide). They asked for a polished reorder with the tiles relocating as you move one.

A proper FLIP-style sortable reflow is fiddly to hand-roll correctly (pointer + keyboard sensors, transform math, accessibility, touch). The established, well-maintained solution is **dnd-kit**. This is the first time we add a client UI library specifically for interaction mechanics, so per CLAUDE.md ("choosing a library triggers an ADR") and ADR-0007 (cost-ceiling / lock-in discipline) it gets a decision record + a lock-in inventory row, mirroring how React Flow was handled (ADR-0020).

## Options considered

### Option A — dnd-kit (`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` + `@dnd-kit/modifiers`)

- The de-facto React sortable toolkit: `SortableContext` + `useSortable` give smooth transform/transition reflow, pointer **and** keyboard sensors, and axis/restriction modifiers out of the box.
- **Pros:** MIT; client-only; tree-shakeable (~10kb core); accessible by default (keyboard reorder, ARIA); the reorder result is just a new id array, so it plugs into our existing `reorderBlocks` / `requestReorder` (confirm-dialog) flow unchanged.
- **Cons:** a new dependency; its drag context wraps the list (a small structural change to two components).

### Option B — keep native HTML5 DnD, hand-animate

- Add FLIP animation manually (measure positions, animate transforms) on top of the existing native implementation.
- **Pros:** no new dependency.
- **Cons:** significant custom code to get right across pointer/keyboard/touch; easy to introduce a11y regressions; reinvents exactly what dnd-kit already solves. Poor effort-to-quality ratio.

### Option C — a heavier board library (react-beautiful-dnd, etc.)

- **Pros:** batteries-included.
- **Cons:** react-beautiful-dnd is effectively unmaintained and not React 19-ready; larger footprint than we need for a single vertical list.

## Decision

**We will use dnd-kit** for block drag-reorder in the Builder list and the whiteboard List. It is the smallest dependency that delivers the smooth, accessible sortable the owner asked for, and it slots behind our existing reorder handler (a new id order in → `reorderBlocks`, with the broken-condition confirm dialog intact). Like React Flow (ADR-0020) it is a client-only UI library with no data-model footprint, so the lock-in boundary is a component wrapper, not a `server/adapters/` interface.

## Consequences

- **Easier:** a polished, keyboard-accessible reorder with animated reflow; future sortable needs (e.g. reordering options, conditions) can reuse the same `SortableList` wrapper.
- **Harder:** one more client dependency to keep React-version-current (low risk — dnd-kit supports React 19).
- **Committed to:** dnd-kit imports confined to the reorder UI; the reorder *result* stays a plain `instanceId[]` so swapping libraries only touches the wrapper.
- **Precluded from:** nothing — the data model is untouched (order is still the `blocks` array order in `definition_snapshot`, ADR-0012).

## Revisit triggers

- dnd-kit stops supporting the current React major, or becomes unmaintained.
- We need cross-container drag (e.g. dragging blocks between groups) at a scale that warrants a different model.

## References

- ADR-0020 (React Flow — same client-only-UI-library lock-in posture).
- ADR-0007 (vendor cost-ceiling / lock-in discipline); ADR-0012 (blocks JSON is the source of truth for order).
- `04_architecture/lock-in-inventory.md` (dnd-kit row).
- `05_app/components/feature/whiteboard/sortable-list.tsx`; reorder helper `05_app/lib/whiteboard/reorder.ts`.
