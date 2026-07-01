# ADR 0020 — Whiteboard canvas technology

- **Status:** accepted
- **Date:** 2026-06-04
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** ui, canvas, whiteboard, v1.8, vendor-choice

## Context

V1.8 ships **Whiteboard mode** — the second face of the Builder/Whiteboard toggle that's been wired-but-inert since the Phase 5 scaffold. The toggle currently does nothing on click. V1.8 makes it a real surface where the researcher sees the study laid out as a visual graph (blocks as nodes, condition-visibility rules as edges) and can rearrange, branch, and compare versions side-by-side.

The functional requirements for the V1.8 Whiteboard:

1. **Render each block as a node** on an infinite canvas. The node carries the block's title + module type + (when applicable) a condition badge.
2. **Render condition-visibility rules as edges** between nodes — V1.6 shipped `block.visibility.showIfCondition`; the Whiteboard makes those wires visible instead of hidden in JSON.
3. **Pan + zoom** the canvas; multi-select + drag nodes; the canvas position is part of the study's autosave (so the next visit shows the same layout).
4. **Multi-version compare** — open two versions side-by-side (Builder shows v1; Whiteboard can show v1 next to v3 for a visual diff of what changed). Uses the V1.7.2 `studies.getVersion` read-only preview pattern.
5. **Round-trip with Builder** — adding/removing/configuring a block on the Whiteboard reflects in Builder mode immediately, and vice versa. They're two views of the same `definition_snapshot.blocks` array per ADR-0012; no separate Whiteboard data model.
6. **Server-side rendering not required** — Whiteboard is researcher-only (per ADR-0013, the participant runtime stays MPA). Client-side React tree is fine; the auth-protected route segment handles loading.
7. **Accessible enough to pass `e2e/a11y-researcher-surfaces.spec.ts`** — keyboard navigation between nodes (Tab + Enter), screen-reader announcements of node selection. Whiteboards are notoriously bad at this; we need at minimum a fallback list of nodes for AT.
8. **Theme-compatible** — warm parchment page + Plex Serif headings + the modular floating panels per design-language brief v0.6. Most canvas libraries ship dark/light themes; the warm-parchment specifically may need custom token overrides.

Explicit V1.8 NON-requirements (deferred to V1.9+):
- Free-form sketching / annotation layer (sticky notes, hand-drawn shapes, arrows between non-block elements).
- Sketch-to-block conversion (draw a shape → convert to a question block).
- Real-time multi-user collaboration on the canvas (per ADR-0007, Liveblocks is stubbed; V1 substrate only).

Prior ADRs in play: **ADR-0001** (modular composition) — blocks are versioned modules with schemas, so the Whiteboard node-content is data we already model; **ADR-0007** (vendor lock-in) — any third-party canvas SDK adds a vendor we have to track in the lock-in inventory + decide a migration target; **ADR-0012** (block format + autosave) — the source-of-truth data lives in `definition_snapshot.blocks`, so Whiteboard is a view + edits round-trip through `writeBlocks`; **ADR-0013** (participant runtime SSR-MPA) — Whiteboard is researcher-side only, no participant impact; **ADR-0019** (version preview/restore) — the multi-version compare reuses `studies.getVersion`.

## Options considered

### Option A — React Flow / xyflow (MIT)

- Open-source library purpose-built for node-based UIs (workflow editors, mind maps, BPMN, ETL pipelines). Maintained by xyflow (Berlin); MIT licensed (no usage tier, no per-seat cost, no SaaS gating).
- Data model: nodes + edges as plain TypeScript arrays. Our `definition_snapshot.blocks` array maps 1:1 to nodes; `block.visibility.showIfCondition` maps 1:1 to edges. The Whiteboard becomes a translation layer over data we already have.
- Customization: nodes are arbitrary React components — we plug in shadcn/Tailwind components themed with our existing CSS variables; the node's "card" look matches Builder's block list.
- Plugins available for selection/drag/copy-paste/keyboard navigation; accessibility primitives (focus management) are first-class.
- **Pros:** correct shape for the problem (study = directed graph of blocks); MIT (no lock-in concern under ADR-0007); React-native (no iframe, no canvas-element fights, no separate state model); themeable via our existing tokens; lightweight (~30kb gzipped); used in production by Stripe, Typeform, Stack AI; data shape is OUR shape, not theirs (zero data-model lock-in).
- **Cons:** not designed for free-form drawing — V1.9 sketch-to-block would need a different layer on top (e.g. Excalidraw integrated as an annotation overlay); aesthetic is "clean tech" rather than "hand-drawn editorial" so the warm-parchment theme requires custom CSS overrides on the default styles.

### Option B — Excalidraw (`@excalidraw/excalidraw`, MIT)

- Open-source whiteboard library with a hand-drawn aesthetic. Embeddable as a React component. Used by Notion AI, Obsidian, others. MIT licensed (no commercial restrictions).
- Data model: shape objects with x/y/width/height/strokeColor/etc. We'd map each block to an Excalidraw "rectangle with text" shape. Condition-visibility edges become Excalidraw arrows.
- Strong free-form drawing primitives (pens, shapes, freehand) — useful for V1.9+ sketching, but unnecessary for V1.8's node-graph view.
- **Pros:** mature, polished, MIT; great aesthetic match for the warm-parchment + Plex-Serif design language (hand-drawn feels editorial); single library covers V1.8 (node graph) AND V1.9 (free-form sketching).
- **Cons:** the data model is THEIRS — we'd be storing Excalidraw scene JSON either alongside or instead of `definition_snapshot.blocks`. Round-trip with Builder gets fragile because edits on either side must reconcile across two different data models. The library is built for free-form drawing, not for "this rectangle IS a study block with module config" — we'd be fighting it to enforce semantic constraints (you can't visually delete a block by erasing its rectangle; you must use the Builder's remove-block flow for autosave + tests to stay correct).

### Option C — tldraw (BSL license; paid for SaaS)

- Excellent SDK for building custom whiteboards. Very flexible. Used by Vercel's own internal tools (per their public posts), Linear, others.
- **Licensing:** Business Source License (BSL) requires a commercial license for SaaS use over a fairly small revenue threshold. Free for hobbyist + internal use; paid for public-facing products like ours.
- **Pros:** most polished SDK; collaboration primitives built in; very customizable.
- **Cons:** **direct conflict with ADR-0007's cost-ceiling discipline** — adds a paid license fee that scales with our user growth, requires us to track a new vendor in the lock-in inventory, and locks us into tldraw's licensing terms (which can change). Substantially more code lock-in than the MIT options because their data model + SDK abstractions go deeper. Rejected on license grounds alone before evaluating the rest.

### Option D — Custom canvas (Konva / Fabric / raw HTML5 Canvas)

- Build the canvas ourselves on a low-level 2D primitive.
- **Pros:** zero vendor lock-in; fully tailored to our exact needs.
- **Cons:** ~3-6 months of engineering for things React Flow ships out of the box (pan/zoom, multi-select, edge routing, keyboard navigation, accessibility primitives, animation). Reinventing this is not a good use of a one-person team's time when V1.8 has a 4-week target.

### Option E — ReactFlow + Excalidraw hybrid (deferred decision)

- Use React Flow for the node graph (V1.8 primary); add Excalidraw as a separate "Annotation" tab inside Whiteboard for V1.9+ sketching. Two libraries, two purposes, clean separation.
- **Pros:** best of both worlds; each library does what it's built for; no fighting; V1.8 ships smaller scope.
- **Cons:** two npm dependencies; users have to switch tabs between "structure" (React Flow) and "annotation" (Excalidraw). Acceptable if/when V1.9 sketching becomes a requirement.

## Decision

**We will use React Flow / xyflow (Option A) as the V1.8 Whiteboard canvas.** Free-form sketching (Excalidraw layer per Option E) is explicitly deferred to V1.9+.

In plain language: V1.8 needs to show study blocks as a directed graph with condition-visibility wires between them. React Flow is purpose-built for exactly that — its data model already matches ours (nodes + edges = blocks + condition rules), it's MIT-licensed so there's no commercial lock-in, and it ships the affordances we'd otherwise rebuild (pan, zoom, multi-select, keyboard navigation, custom node components). Excalidraw and tldraw are excellent at things we don't need yet (free-form drawing, real-time collab); adopting them now would mean fighting their data models or paying licensing fees for value we won't use until V1.9 at the earliest.

The Whiteboard view is a **translation layer over `definition_snapshot.blocks`** (ADR-0012), not a separate data model. Edits on the Whiteboard call the same `studies.writeBlocks` mutation that Builder edits do. The canvas viewport state (zoom level + pan position) lives in a small `whiteboard_viewport` JSON field on the autosave version row (additive migration); not the snapshots — the viewport is per-user-per-session-ish UX state, not part of the immutable study definition.

## Consequences

- **What becomes easier.** Block-level structure is finally visible visually instead of hidden in JSON. Condition-visibility rules become wires you can see + drag, instead of slug strings in a multiselect. Multi-version compare reduces to "render two React Flow instances side-by-side," reusing the V1.7.2 `studies.getVersion` endpoint. Block adding/removing on the canvas reuses the existing Builder mutations — no new server endpoints required for the V1.8 happy path.
- **What becomes harder.** Adding a second canvas library later (Excalidraw for sketching) means two libraries in the bundle (~30kb React Flow + ~150kb Excalidraw). Theming React Flow's defaults to match the warm-parchment design language requires custom CSS overrides per ADR-0007 (vendor styling shouldn't leak; we wrap in our own component layer). Accessibility on a canvas is genuinely hard — Whiteboard view will need a parallel "list of nodes" fallback for screen readers (Whiteboard is opt-in via the toggle so the Builder list remains the primary accessible surface; not a regression).
- **What we are now committed to.** React Flow as a tracked vendor in `04_architecture/lock-in-inventory.md` (low concern: MIT, plain data shape, easy migration to Konva or custom canvas if the library ever goes south); a `whiteboard_viewport` jsonb field on `experiment_version` (additive migration; ADR-0012's autosave-is-mutable semantics cover it; immutable snapshots keep their viewport frozen at save time so opening v3 later shows the layout v3 had); the Whiteboard route segment lives in the `(app)` group, auth-protected, never reachable by participants.
- **What we are now precluded from.** tldraw (license incompatibility). Building the canvas ourselves under the same V1.8 budget (timeline incompatible). Storing study structure in a non-`blocks`-array format (would conflict with ADR-0012 + ADR-0019 + every existing test).

## Revisit triggers

- **Bundle size becomes a real concern** (the production bundle crosses the budget you eventually set in a `bundle-size` ADR). React Flow is ~30kb gzipped; not a current concern.
- **Real-time multi-user canvas editing becomes a V1.x requirement** — React Flow itself doesn't ship a collab layer; ADR-0007's Liveblocks adapter would need to wrap React Flow's state. Worth a separate ADR amendment when it lands.
- **Free-form sketching becomes important enough** to warrant adding Excalidraw — Option E becomes the new path; this ADR gets an amendment, not a supersede.
- **React Flow license changes** (currently MIT; a hypothetical future BSL-style change would mirror tldraw's situation) — migration target is Konva / Fabric / a small custom layer; the data model is ours so the migration is well-bounded.
- **Accessibility audit finds the canvas materially worse than the fallback list** — may need to ship the list as the primary surface and the canvas as an optional view.

## References

- [React Flow docs](https://reactflow.dev/) + [xyflow GitHub](https://github.com/xyflow/xyflow) (MIT license)
- [React Flow Whiteboard features](https://reactflow.dev/learn/advanced-use/whiteboard) (selection, draggable, theming)
- [tldraw license docs](https://tldraw.dev/) (BSL — rejected for licensing per ADR-0007)
- [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT — deferred to V1.9+ via Option E)
- [ADR-0007 — Path A vs B](./0007-path-a-vs-b.md) (vendor lock-in lens applied)
- [ADR-0012 — Block format + autosave](./0012-block-format-and-autosave-semantics.md) (data model the Whiteboard reads from)
- [ADR-0019 — Version preview + restore](./0019-version-preview-and-restore.md) (multi-version compare reuses these endpoints)
- [Lock-in inventory](../lock-in-inventory.md) (will add a React Flow row at V1.8 build time)
