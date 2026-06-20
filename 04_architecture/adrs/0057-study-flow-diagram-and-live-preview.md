# ADR 0057 — Study flow diagram + live Builder preview

- **Status:** proposed
- **Date:** 2026-06-20
- **Deciders:** Project owner, Claude
- **Tags:** builder, whiteboard, runtime-visualization, ux

## Context

> What is forcing this decision?

The whiteboard (ADR-0020, React Flow / `@xyflow`) today renders a study as **free-placed** block boxes and **condition pills** in two columns, wired together by edges that encode **visibility relationships** ("this condition → that block = show the block only to that arm"; "this block's answer → that block"). There is **no Start node, no terminal node**, positions are hand-dragged and persisted (`experimentVersion.whiteboardViewport.nodePositions`), and conditions read as separate little entry points the user places. The owner's verdict, correctly: it's a relationship-wiring board, not a picture of the study — "freely placed, not connected boxes and pills."

What a researcher actually needs is the references' pattern (Salesforce/onboarding/ElevenLabs/Lindy): a **directed execution-flow diagram** — one Start, the screens in their real order connected by directional edges, branch points **inline on the flow**, and a clear end — that they can read, trust, navigate, and edit.

The study's real runtime is **linear-with-conditional-visibility** (`lib/whiteboard/screens.ts` `deriveScreens` + `server/runtime/participant.ts` `resolveVisibleScreens`): an ordered list of screens, each shown or skipped per (a) the participant's randomly-assigned **arm** (`block.visibility.showIfCondition`, the `condition` table, ADR-0014) and (b) **answer-based logic** (`block.showIf`, a `ConditionGroup` tree, ADR-0021), grouped into screens (ADR-0028). Early exit already exists as the **end-redirect** block (ADR-0042). So a faithful flow can be *derived* from the model that already exists — no runtime change.

Separately, the participant **preview** is a full-screen modal (`/studies/[id]/preview`) running the real runtime — accurate, but it forces a leave-look-return-edit loop. The owner wants a **side-by-side live preview** in the Builder.

## Options considered

> ### Option A — Add Start/End nodes to the current free canvas
> - Keep free placement + visibility-wiring; just drop in a Start and an End node.
> - **Pros:** smallest change.
> - **Cons:** still scattered, still reads as wiring not flow, edges still don't mean "sequence." Doesn't fix the actual complaint.

> ### Option B — Derived, auto-laid-out execution-flow diagram (chosen)
> - Build the graph **from the real structure** (ordered screens + arm visibility + `showIf` + end-redirect terminals): a fixed **Start**, an optional **Random assignment** node when >1 arm, the ordered spine of screens, **inline branch nodes** for answer logic that rejoin or route to a terminal, and **one or more terminal nodes** (Finish + early-exits). **Auto-layout** (no free 2D placement); reorder by dragging along the spine and `+` insert points between steps. **Arm representation: chips-on-one-spine by default, toggle to swimlanes** (one lane per arm). Full editor: canvas actions map to the **existing** block / visibility / branch mutations, so the diagram and the list Builder are two views of one study. Keep React Flow (ADR-0020 tech); retire free node placement.
> - **Pros:** matches the mental model + the references; always faithful (derived, can't drift); navigable; reuses existing mutations + runtime semantics; no engine change.
> - **Cons:** needs a layout pass (layering/longest-path) and graph derivation; we give up arbitrary 2D arrangement (deliberately).

> ### Option C — Custom SVG flow renderer (drop React Flow)
> - Hand-roll nodes/edges/pan/zoom.
> - **Pros:** total control of layout.
> - **Cons:** reinvents pan/zoom/edge-routing/a11y that React Flow already gives us; large surface for bugs. Not worth it.

## Decision

> A single, declarative sentence.

**We will render the whiteboard as an auto-laid-out, *derived* execution-flow diagram — Start → optional random-assignment → the ordered spine of screens with inline answer-branches → one or more terminals — editable in place and two-way-synced with the list Builder via the existing mutations; arms render as chips on one spine by default with a toggle to swimlanes; React Flow stays, free node placement is retired. Separately, the Builder gains an inline side-by-side live participant preview that reuses the real runtime and refreshes on debounced edits while preserving the previewed screen.**

The flow is computed from the same `deriveScreens` + arm + `showIf` data the runtime uses, so it is correct by construction and cannot drift from what participants experience. Free placement (`nodePositions`) is dropped in favor of derived layout; we keep only pan/zoom (`whiteboardViewport.{x,y,zoom}`). Multiple terminals are not a new runtime concept — they are the implicit study-complete end plus any **end-redirect** blocks (ADR-0042) reached by a branch, surfaced as terminal nodes. The live preview supersedes the modal as the *default* in the Builder; the full-screen modal remains available.

## Consequences

> - **What becomes easier.** Reading/trusting/navigating a study; spotting unreachable screens and invalid (forward) branches; onboarding to someone else's study; editing structure where you see it.
> - **What becomes harder.** We now own a **layout derivation** (graph build + layering) and must keep the diagram in lockstep with the snapshot; arbitrary 2D arrangement is gone (intended).
> - **What we are now committed to.** A single source of truth (the snapshot/screens) for both the diagram and the runtime; canvas edits going through the **existing** mutations (no parallel write path); terminals defined by study-complete + end-redirect blocks.
> - **What we are now precluded from.** Free-form moodboard placement; storing per-node positions (migration-free removal — the column stays but `nodePositions` is ignored/cleared on derived layout).

## Revisit triggers

> Conditions under which we reopen this.

- The runtime gains **true multi-path branching** (goto/jump, not just visibility) — the derivation + node model would expand.
- Studies routinely exceed a few hundred screens — layout/render performance needs virtualization or a different engine.
- Arms exceed what chips/swimlanes can legibly show — need a different arm affordance.
- A second non-web client appears — preview reuse assumptions change.

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0020 whiteboard canvas tech](0020-whiteboard-canvas-technology.md) (tech kept, free-placement model superseded), [0021 answer-based branching](0021-answer-based-branching.md) (`showIf`), [0028 question groups & screens](0028-question-groups-and-screens.md) (`deriveScreens`), [0014 response data model & conditioning](0014-response-data-model-and-conditioning.md), [0042 flow blocks / end-redirect](0042-flow-blocks.md) (terminals).
- Code: `components/feature/whiteboard/whiteboard-canvas.tsx`, `whiteboard-nodes.tsx`, `lib/whiteboard/graph.ts`, `lib/whiteboard/screens.ts`, `lib/whiteboard/conditions.ts`, `server/runtime/participant.ts`, `components/feature/take/preview-experience.tsx`.
- Wireframes: [study-flow-diagram](../../03_design/wireframes/study-flow-diagram.md), [builder-live-preview](../../03_design/wireframes/builder-live-preview.md).
- User flow: [build-study-as-a-flow](../../02_product/user-flows/build-study-as-a-flow.md).
