# Wireframe spec — Study flow diagram

- **Serves user flow:** [Build a study as a flow](../../02_product/user-flows/build-study-as-a-flow.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Build stage, "Flow" view (replaces the free-placement whiteboard)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence.

Show the study as the exact directed flow a participant moves through — Start → ordered screens → inline branches → one or more terminals — and let the researcher read, navigate, and edit that flow in place (ADR-0057).

## Layout

> Layout zones.

- **Top toolbar (left → right):** view switch **List ▏Flow** (this is the Flow view); **Arm view: Chips ▏Swimlanes** toggle; zoom out/in / **Fit**; **Add** (block · branch · group). Mirrors the existing whiteboard toolbar, minus any "free arrange" affordance.
- **Canvas (center, the bulk):** auto-laid-out top-to-bottom. **Start** anchor pinned at top; the ordered **spine** of screen nodes below it; **inline branch** nodes where answer logic forks; **terminal** node(s) at the bottom (one **Finish · complete** plus any **early-exit** terminals). Directional edges; branch edges carry labels (e.g. *pass* / *fail*). `+` insert points sit on the edges between steps. Pan/zoom only — no free node dragging.
- **Right config panel (opens on select):** settings for the selected node — block config, **arm visibility** (which arms see this screen), **branch logic** editor (`showIf`), title. Matches the references' right-hand settings panel.

## Content inventory

> Every piece of content.

- **Start node** — fixed entry anchor; static label "Start".
- **Random assignment node** — shown only when the study has >1 arm; lists the arms + allocation weights (from the `condition` table). Static-from-server.
- **Screen node** — title (or block name), block count if grouped, **arm chips** (which arms see it: `all` / `A · B` / `+N` overflow), a **Needs setup** badge if incomplete, a **warning** badge if unreachable. Source: derived from `deriveScreens` + arm visibility.
- **Branch node** — compact summary of the `showIf` condition (e.g. "attention check = correct"); two labeled out-edges (true/false) that rejoin the spine or route to a terminal. Source: `block.showIf` (ADR-0021).
- **Terminal node(s)** — **Finish · complete** (implicit study end) and any **early-exit** terminals (an end-redirect block, ADR-0042) with their redirect target shown. Source: derived.
- **Edges** — directional; branch edges labeled.
- **`+` insert points** — between steps; open the Add menu (block / branch / group) at that position.
- **Toolbar controls** — view switch, arm-view toggle, zoom/fit, Add.

## States

> Each state.

- **Default** — full flow rendered, nothing selected.
- **Loading** — skeleton spine while the study/graph loads.
- **Empty** (no blocks) — just `Start → Finish` with a single `+ Add your first step` on the edge between them.
- **Single arm** — no Random-assignment node; screens show no arm chips (everyone sees everything).
- **Many arms** — chips overflow to `+N`; Swimlanes toggle becomes the better read.
- **Partial** — some screens "Needs setup" (badge), study still renders.
- **Invalid / warning** — a branch references a later block (forward clause → marked invalid with a fix hint); an unreachable screen (warning badge). Non-blocking.
- **Error** — graph failed to load → inline message + retry; never a blank canvas.

## Interactions

> For each interactive element.

- **Click a node** — selects it, opens the right config panel. (System: panel reflects that node.)
- **`+` insert point** — opens Add (block / branch / group); inserts at that position in the real order; the diagram re-lays-out. (Maps to the existing add-block / set-`showIf` mutations.)
- **Drag a node along the spine** — reorder; snaps to insertion slots (no free 2D placement); re-layout on drop. (Maps to block reorder.)
- **Add / edit a branch** — pick the source block's answer + operator + value (reuses the existing `showIf` `ConditionGroup` editor); draws the labeled fork. Route the false arm to a terminal to model screen-out.
- **Set arm visibility** — on a screen's config, choose which arms see it (chips editor → `setBlockVisibility`).
- **Delete a node / branch / arm** — removes from the study (confirm for a node with children); re-layout.
- **Arm-view toggle** — Chips ⇄ Swimlanes; same study, re-rendered.
- **Zoom / Fit / pan** — viewport only (persisted as `whiteboardViewport.{x,y,zoom}`).
- **Double-click a screen** — jump to that block in the List view (navigation).

## Edge cases

> - **Very long titles** — truncate with tooltip; node width capped.
- **Zero / one / many** — empty state above; 1 screen renders Start→screen→Finish; hundreds of screens scroll vertically (consider windowing later).
- **Shared screen in Swimlanes** — a screen seen by several arms appears in each of those lanes (open question: repeat vs span — default repeat, dimmed "shared" tag).
- **Forward-referencing / unreachable** — badges as above; never crash the layout.
- **Slow network** — loading skeleton; edits optimistic where the list Builder already is.
- **Permissions denied** (viewer role) — read-only flow (no `+`, no drag, no config writes); panel shows values disabled.

## Accessibility notes

> Beyond the defaults.

- **List-view fallback** — the existing accessible list view (ADR-0028 / A7) remains the keyboard-complete equivalent; the flow diagram is the visual layer, not the only way.
- **Keyboard reorder** — move-up / move-down on a focused node (parity with the list), since spine-drag is pointer-only.
- **Focus order** — Start → screens in flow order → terminals; branch arms reachable in sequence.
- **ARIA** — label branch arms ("if pass / if fail"), arm chips ("shown to arms A, B"), terminal kind ("early exit / complete"); the canvas is a labeled region.
- **Reduced motion** — no animated/flowing edges when `prefers-reduced-motion`.

## Open questions

> To resolve before high-fi.

- Layout engine: dagre/elk vs a hand-rolled longest-path layering (favor a small dependency-free layering for a single spine + short branch detours).
- Swimlane rendering of shared screens (repeat vs span).
- Whether reorder-by-drag is worth it vs `+`-insert + move-up/down only for v1.
