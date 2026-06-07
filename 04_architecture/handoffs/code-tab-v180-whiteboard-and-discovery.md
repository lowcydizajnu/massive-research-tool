# Code tab handoff — V1.8 (Whiteboard + Cross-workspace discovery)

V1.7.1 + V1.7.2 are shipped + tagged (`be1068e`). V1.8 is the next anchor: **two parallel PR streams** bundled into one V1.8 release (~5 weeks total Code-tab time). Project owner picked the bundling explicitly — single deploy at the end instead of two short ship cycles.

**Stream A — Whiteboard mode** (~4 weeks; the strategic differentiator). Locked architecture: [ADR-0020 — Whiteboard canvas technology](../adrs/0020-whiteboard-canvas-technology.md) — React Flow / xyflow as the canvas; MIT; data shape maps 1:1 to our existing `definition_snapshot.blocks` (no new data model).

**Stream B — Cross-workspace discovery / Browse public studies** (~1 week; closes the V1.7 network story). Today fork-by-id/link is the only way Sofia finds Hanna's public study. The Browse destination makes public studies discoverable + replicate-able with one click.

Streams are largely independent — different files, different routes, different tRPC procedures — so you can land them as parallel PRs and merge them in whatever order makes sense. One V1.8 audit log + tag at the end.

## Read first

1. [ADR-0020](../adrs/0020-whiteboard-canvas-technology.md) — the canvas tech decision (React Flow + why; what's deferred to V1.9+)
2. [ADR-0012 — Block format + autosave semantics](../adrs/0012-block-format-and-autosave-semantics.md) — the Whiteboard is a translation layer over `definition_snapshot.blocks`, not a new model
3. [ADR-0019 — Version preview + restore](../adrs/0019-version-preview-and-restore.md) — `studies.getVersion` is reused by Stream A's multi-version compare
4. [ADR-0002 — Forking model](../adrs/0002-forking-model.md) + [ADR-0018 — Cross-workspace forking](../adrs/0018-cross-workspace-forking.md) — Stream B's data layer is already there
5. [V1.7.2 audit log](../../06_qa/audit-logs/2026-06-04-v172-fixes-and-polish.md) — current state + outstanding owner carry-forward (Clerk account-linking)
6. [00_meta/STATUS.md](../../00_meta/STATUS.md) — current snapshot

---

## Stream A — Whiteboard mode (ADR-0020)

### A1. Install React Flow + lock-in inventory entry

- `npm i reactflow` (or `@xyflow/react` — pick the current npm package; xyflow renamed `reactflow` → `@xyflow/react` in late 2024).
- Add to `04_architecture/lock-in-inventory.md`: vendor = xyflow; usage = Whiteboard mode (study graph view); behind = `components/feature/whiteboard/*` (only Whiteboard imports xyflow types/components); migration target = Konva or custom HTML5 canvas; cost-ceiling trigger = none (MIT, no SaaS gating).
- No new adapter folder under `server/adapters/` — this is a client-only UI library; no server-side adapter required.

### A2. Schema: add `whiteboard_viewport` to `experiment_version`

- Drizzle migration adds `whiteboard_viewport jsonb NOT NULL DEFAULT '{}'::jsonb` to `experiment_version`.
- Shape: `{ x: number, y: number, zoom: number }` — empty `{}` means "fit-to-screen" on first render.
- Migration is additive + backwards-compatible. Existing rows get the default empty object.
- Per ADR-0020 "Consequences": autosave version's viewport is mutable (saved with each canvas pan/zoom debounce-write); frozen versions (named/preregistered/published) capture the viewport at snapshot time and never change.

### A3. Whiteboard route + data layer

- New route segment: `app/(app)/studies/[id]/build/whiteboard/page.tsx` (auth-protected; lives under the existing `(app)` group; reuses Builder's chrome).
- The Builder/Whiteboard toggle in the work-surface card (currently inert per the V1.5+ visualizer; wireframe lives in `03_design/wireframes/build-stage-builder-mode.md` § "Builder/Whiteboard toggle") becomes a real `<Link>` between `/build` and `/build/whiteboard`.
- Server-side data: tRPC `studies.get` already returns the full block list + visibility rules. Whiteboard's RSC layer feeds this into a client `<WhiteboardCanvas>` that wraps the React Flow component.
- Viewport persistence: client-side `useEffect` debounces (~500ms) on viewport change → `studies.updateWhiteboardViewport({ versionId, viewport })` mutation.

### A4. Node + edge mapping (the translation layer)

- **Nodes**: one per `BlockInstance` in `definition_snapshot.blocks`. Node id = `instance_id`. Node data = `{ blockKey, blockSource, blockVersion, configSummary, visibilityCondition }`. Custom node component renders a card matching the Builder block list aesthetic (shadcn card + Plex Serif title + Mono module type chip).
- **Edges**: for each block with `visibility.showIfCondition = [slugs]`, draw an edge from a synthetic "Condition: slug" entry-point node to that block. Condition entry-point nodes auto-layout at the canvas top-left; visibility rules become visible wires.
- **Layout**: use React Flow's `useLayoutedElements` hook or a simple dagre-based auto-layout for the initial fit. Once the user pans/zooms/drags, save their layout in `whiteboard_viewport` so the canvas opens where they left it.
- **Selection**: clicking a node opens the same right-panel Configure form Builder uses (single source of truth — shared component). The right panel stays mounted between Builder and Whiteboard views.

### A5. Round-trip edits

- Adding a block on the canvas (drag from a sidebar palette → drop on canvas) → calls `studies.addBlock` (existing endpoint) with the dropped position carried as the node's initial coords. Position is part of `whiteboard_viewport.nodePositions[instance_id]` (or similar — pick a shape).
- Removing a block on the canvas (click → Delete key) → calls `studies.removeBlock` (existing endpoint). Edges referencing it are auto-removed from the rendered graph (already implicit because we re-derive edges from the visibility rules on each render).
- Dragging an edge from one block to another → opens the right-panel Configure tab on the target block, scroll-to + focus the "Show only if condition" field. Adding the wire is the same as setting the visibility condition; no separate "edge data" model.
- All Whiteboard edits flow through Builder's existing tRPC procedures. Zero new server endpoints for edit flow; ONE new endpoint for viewport persistence.

### A6. Multi-version compare

- Route: `app/(app)/studies/[id]/build/whiteboard/compare/page.tsx?vs=<otherVersionId>`.
- Renders two React Flow instances side-by-side (50/50 split). Left = current; right = `studies.getVersion({ versionId: vs })` (ADR-0019 endpoint, reused).
- Edges + nodes shared between both versions render in normal color; nodes ONLY in left render in green (added); nodes ONLY in right render in red (removed); nodes in both but with different config render in amber (modified). Same diff shape as the V1.7 Replications tab's block diff routine — refactor that diff into a shared `lib/diff/blocks.ts` if it isn't already.
- Read-only — restoring a version still happens via the Versions sub-tab (ADR-0019).

### A7. Accessibility fallback

- Whiteboard's canvas is hard for screen readers. Build a parallel **"List view"** toggle inside Whiteboard mode itself — same data, rendered as a flat ordered list with each block as a `<button>` that opens the right-panel Configure form. Keyboard nav via Tab + Enter.
- The Whiteboard tab in `e2e/a11y-researcher-surfaces.spec.ts` (V1.7.1's axe spec) needs to cover both the canvas mode AND the list-fallback. Each must pass axe (canvas in "graph-aria-role" mode with aria-label per node; list with native semantics).
- Per ADR-0020 §"Consequences": Builder's block list stays the primary accessible surface; Whiteboard is opt-in via the toggle. The list fallback inside Whiteboard is belt-and-suspenders.

### A8. Theming

- React Flow's default styles (light blue selection, gray edges) clash with the warm-parchment + Plex Serif design language. Wrap in `<WhiteboardCanvas>` that imports `reactflow/dist/style.css` followed by `components/feature/whiteboard/whiteboard-theme.css` overrides keyed to our existing CSS variables (per ADR-0007 — vendor styling isolated inside our wrapper).
- Edges: thin lines in `--color-ink-deep` (light) / `--color-text-muted` (dark). Selection: 2px outline in the `accent` token. Node cards: existing block-list card primitive.

### A9. Tests

- Unit: node/edge derivation from `blocks` array (snapshots).
- Unit: viewport debounced-save logic.
- Integration: full round-trip — add a block in Whiteboard → confirm `studies.get` returns it → confirm Builder shows it.
- E2E (gated `auth` project): a Hanna spec that builds a 3-block study, toggles to Whiteboard, drags blocks into a layout, navigates to compare-vs-previous-version, sees the diff colors.
- Axe spec for both canvas + list-fallback modes.

---

## Stream B — Cross-workspace discovery / Browse public studies

### B1. Data layer

- No schema changes needed. Existing `experiment` table has `share_scope` (per ADR-0002) — public-replicable is the default. Existing `experiment_version` rows with `kind ∈ {published, preregistered}` are the discoverable ones.
- New tRPC procedure: `studies.browsePublic({ filters, cursor, limit })` — `publicProcedure` (NOT `workspaceProcedure`; this works without a workspace context for the listing).
  - Query: `experiment` joined to its latest `published`-or-`preregistered` version, where `share_scope = 'public-replicable'` (or whatever the enum value is).
  - Filters: by `tag_slug[]` (intersect with `experiment_tag` via the V1.7 tags table), by `author_user_id`, by `framework_id`.
  - Sort: most recent first; option for "most replicated" (count of forks per ADR-0018).
  - Cursor pagination (limit ~24 per page).
- New tRPC procedure: `studies.browseTags({ q })` — list of tags with usage counts for the filter sidebar (small autocomplete).

### B2. UI — `/browse` destination

- New top-level destination: `app/(app)/browse/page.tsx`.
- Top-bar adds "Browse" to the destination switcher (Studies, Library, Frameworks, Activity, Browse).
- Wireframe: a 3-column grid of study cards. Each card: study title (Plex Serif), author byline (with +Follow button reusing V1.7 follow affordance), framework chip, tag chips, "Replicate" CTA button.
- Filter sidebar: tag multiselect (autocomplete from `studies.browseTags`), author search, framework select.
- Empty state: "No public studies match those filters yet — try a broader search, or browse all."
- Wireframe spec at `03_design/wireframes/browse-public-studies.md` (you write it as a gate before the UI work — phase gate per CLAUDE.md). Same modular-card pattern as Studies destination + Frameworks destination.

### B3. Replicate CTA

- Clicking "Replicate" → reuses the ADR-0018 cross-workspace fork flow that V1.7 shipped. If the user has multiple workspaces, prompt for which workspace to fork into.
- Post-fork: redirect to the new fork's Builder. Activity event emitted per ADR-0015 (parent study's author sees the fork in Activity Follows).
- No new fork endpoint — this is purely a UI surface over the existing `studies.fork` mutation.

### B4. Discoverability follow-ups (small)

- The author byline + framework chip + each tag chip on browse cards get +Follow buttons (reusing the V1.7 follow affordance components).
- Each card links to the study's public Details view (if it doesn't exist yet, scaffold a read-only `/browse/[studyId]` page showing the latest published/preregistered version's blocks via `studies.getVersion`).

### B5. Tests

- Unit: filter combinations (tag intersection + author + framework + cursor pagination).
- Integration: a 3-study seed (one public, one workspace-only, one invite-only) → only the public one shows up in `browsePublic`.
- E2E (gated `auth` project): Sofia signs in (workspace B), navigates to /browse, finds Hanna's public study (workspace A), clicks Replicate, lands on her own fork in Builder.

---

## What's NOT in V1.8 (defer to V1.9+)

- **Free-form sketching on the Whiteboard** (Excalidraw layer per ADR-0020 Option E).
- **Sketch-to-block conversion** (draw → convert to question block).
- **Real-time multi-user canvas collaboration** (Liveblocks adapter stays stubbed per ADR-0007).
- **Browse search by full-text** (the V1.8 Browse uses faceted filters only; full-text search would need a separate ADR for the search infrastructure choice — Postgres FTS vs Meilisearch vs Algolia).
- **Saved-search follow target** (V1.7+ deferred; still deferred — Browse filters get a "Save this search" → "Follow this search" affordance in a later release).
- **Whiteboard for participants** — per ADR-0013 the participant runtime stays SSR-MPA; Whiteboard is researcher-only.

## Audit + ship

Same shape as V1.7.1/V1.7.2 close-outs:

- Both streams green → `npm run deploy:verify` against production → audit log at `06_qa/audit-logs/{date}-v180-whiteboard-and-discovery.md` (mirror the V1.7.0 deploy-audit template; cover both streams).
- Owner signs.
- `git tag v1.8.0`.
- Release notes at `release-notes/v1.8.0.md` summarizing what researchers now have.

Estimated total: ~5 weeks Code-tab time. Stream B can ship as a self-contained PR earlier if you want a visible mid-V1.8 milestone; Stream A's larger surface area (canvas + theming + a11y + multi-version compare + tests) is the longer pole.

When green: ping owner. Owner runs `npm run deploy:verify` against production after the V1.8 deploy; signs the audit log; confirms `git tag v1.8.0`.
