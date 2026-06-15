# ADR 0045 — Dashboard customization — per-user layouts + workspace defaults

- **Status:** accepted
- **Date:** 2026-06-15
- **Deciders:** project owner
- **Tags:** data-model, dashboards, ui

## Context

V1.13.0 shipped three dashboards — the personal `/home` (ADR-0033), the per-workspace `/dashboard`, and the Studies·Running tab — each rendering a **fixed default layout** of widgets in a CSS-masonry grid. The owner wants users to customize them: drag-to-reorder, add widgets, and remove widgets ("User should be able customise dashboard — drag and drop items, reordering, add new widgets, remove old", handoff Section N5).

Constraints in play:
- Two dashboards are customizable (`/home` = `dashboard_kind: 'user'`; `/dashboard` = `dashboard_kind: 'workspace'`). The Running tab stays fixed — a live operational table doesn't benefit from reorder.
- Today's widgets are **hard-coded** in `home-widgets.tsx` / `dashboard-widgets.tsx` and rendered directly by the RSC pages. There is no notion of "which widgets, in what order" as data.
- Customization must persist per-user (not per-device), survive across sessions, and a workspace admin should be able to set a "house default" the rest of the team inherits until they customize.
- We already depend on `@dnd-kit/*` for block reorder (ADR-0022) — reuse it; introduce no new vendor.
- The catalog is scoped to the **~11 widgets that exist today** (owner decision 2026-06-15); the registry must be forward-compatible so the deferred widgets slot in later without a migration.

## Options considered

### Option A — Dedicated `dashboard_layout` table (per-user) + `workspace_dashboard_default` table (admin), widgets as an ordered jsonb array

- A row per `(user_id, dashboard_kind, workspace_id)` holds the user's ordered widget list (with optional per-widget settings) as jsonb. A separate `workspace_dashboard_default` row holds the admin "house default". A server-side resolver layers user → workspace-default → code-default.
- **Pros:** clean tenancy (FKs + cascade delete); the per-user override and the workspace default are independent rows with independent lifecycles; jsonb keeps the widget list flexible (settings per entry) without a column per widget; querying "does this user have an override?" is one indexed lookup; forward-compatible (unknown widget keys are filtered at resolve time).
- **Cons:** two new tables + a migration; a resolver to write and test.

### Option B — Store the layout in Clerk `publicMetadata`

- Persist the widget list on the user's Clerk metadata (as we do for `themeChoice`, ADR-0011).
- **Pros:** no migration; no new table.
- **Cons:** no place for a *workspace*-scoped default (metadata is per-user, not per-workspace); a per-(user × workspace) layout would bloat metadata with one blob per workspace the user belongs to; couples a core product surface to the auth vendor (violates the spirit of ADR-0007 — metadata is for identity/onboarding flags, not feature state); no relational integrity (a deleted workspace can't cascade).

### Option C — Single table with a discriminator column instead of two tables

- One `dashboard_layout` table where `owner_kind ∈ {user, workspace_default}` distinguishes per-user rows from admin-default rows.
- **Pros:** one table.
- **Cons:** the two concepts have different keys (per-user is keyed by user×kind×workspace; the workspace default is keyed by workspace alone) and different write authorization (any member vs admin-only) — collapsing them forces nullable columns and weaker constraints; the `UNIQUE` story gets muddy. Two purpose-built tables read clearer and constrain better.

## Decision

**We will use Option A: a per-user `dashboard_layout` table and an admin-set `workspace_dashboard_default` table, with widgets stored as an ordered jsonb array `[{ widgetKey, settings? }]`, resolved server-side at page load.**

A dashboard's rendered layout is computed by a pure resolver with a fixed precedence: **(1)** the user's own `dashboard_layout` row if present; else **(2)** for the workspace dashboard, the `workspace_dashboard_default` row if an admin set one; else **(3)** the code-defined default (`USER_DASHBOARD_DEFAULT_LAYOUT` / `WORKSPACE_DASHBOARD_DEFAULT_LAYOUT` in the widget registry). The resolved list is then **filtered against the registry** — unknown keys (a removed/renamed widget) are dropped, and `ownerOnly` widgets are dropped for non-owner viewers. This makes the catalog forward-compatible (we can add widgets to the registry and they appear for new users without touching stored layouts) and removal-safe (a stored key with no registry entry simply vanishes rather than crashing). Reset deletes the user's row, falling back to the next precedence level. The registry is the single source of truth for what a widget *is* (component, loader, size, category, settings schema, `ownerOnly`, `defaultInLayout`); the tables only ever store *ordering + which keys + per-widget settings*, never widget content.

## Consequences

- **Easier:** adding a widget later = one registry entry (+ optionally appending its key to a default array); customization, persistence, and admin defaults work for it for free. Removing a widget is safe (resolver filters it). The dashboards become data-driven instead of hard-coded JSX.
- **Harder:** the dashboard pages must be refactored from directly-rendered widgets to a registry-driven render path (each widget becomes a registry entry with a `Component` + `loader`); per-widget data fetching moves behind the registry's loaders with per-widget error isolation preserved.
- **Committed to:** the `widgets` jsonb shape `[{ widgetKey: string, settings?: object }]`; the three-level resolution precedence; admin-only writes to `workspace_dashboard_default` (enforced by a role check — owner/admin); per-user writes gated to the caller's own row.
- **Precluded from:** cross-device-but-not-cross-session layouts (we persist server-side, deliberately) and per-widget settings schemas richer than a small flat object in V1.13.0 (kept intentionally simple — itemCount, sort, window).

## Revisit triggers

- We want layouts to vary by device/breakpoint (would need a layout-per-breakpoint model, not one ordered list).
- The widget catalog grows past ~30 and the jsonb-array + client edit-mode stops scaling (consider a grid/coordinate model).
- A widget needs settings too complex for a flat jsonb object (promote to its own table).
- We add a non-web client that renders dashboards (the resolver + registry contract would need to be shared/serialized).

## References

- Handoff Section N5 — `04_architecture/handoffs/code-tab-dashboards-and-library.md` (the customization spec this ADR formalizes).
- ADR-0033 — IA v0.5 personal mode + the three-dashboard model these layouts customize.
- ADR-0022 — drag-reorder library (`@dnd-kit`); the same `SortableList` primitive backs edit-mode reorder.
- ADR-0007 — vendor lock-in boundary (why layout state lives in our DB, not Clerk metadata).
- Wireframe — `03_design/wireframes/dashboard-customize-mode.md` (the edit-mode UX gate).

## Amendment (2026-06-15) — custom data widgets

The owner asked for user-defined widgets: "a dropdown with endpoints the user can display, define date range, etc." This extends the registry model rather than replacing it.

- **A custom widget is an instance, not a singleton key.** Its layout entry uses a `widgetKey` of the form `custom:<ulid>` so a user can add several. The resolver recognizes the `custom:` prefix and resolves it against a synthetic `CUSTOM` meta (it is NOT in `WIDGET_REGISTRY`, so it never appears in the normal Add-widget palette — a dedicated "Add a custom widget" action mints a new instance key).
- **Configuration lives in `settings`** (the same jsonb already on every layout entry — no schema change): `{ source: string, dateRange?: '7d'|'30d'|'90d'|'all', itemCount?: number, title?: string }`.
- **Sources are a curated catalog** (`lib/dashboard/custom-sources.ts`), never arbitrary internals: metric sources (a single number — e.g. responses in a window, studies authored, followers) and list sources (a short list — recent studies, recent activity). Each source declares which dashboard kind(s) it applies to.
- **The widget fetches its own data** (`dashboard.customData({ kind, workspaceId?, source, dateRange, itemCount })` → a discriminated `{ type:'metric', label, value } | { type:'list', items }`). So custom widgets are self-contained client components — the RSC pages don't pre-render their nodes, which keeps add/configure instant without a server round-trip per instance.
- **Why not a new table:** instance identity + config fit the existing `dashboard_layout.widgets` jsonb; no migration. **Why a curated catalog (not free SQL/URL):** safety + tenancy — every source is a vetted, workspace-scoped read. Free-form embeds/queries are explicitly out of scope (the rejected "embed-a-URL" option).

## Amendment (2026-06-15) — flexible 2D grid layout (react-grid-layout)

The owner asked for a "fully flexible grid — drag & drop on the actual layout (not a flat list), make widgets narrower/wider, and more columns (like 3)." The N5.2 model — a CSS multi-column masonry in view mode + a flat `@dnd-kit` `SortableList` in edit mode — gives order only (no size, no 2D position, edit ≠ the real layout). This amendment replaces the **layout mechanics** (not the registry/resolver/precedence, which are unchanged) with a true draggable + resizable grid.

- **Engine: `react-grid-layout` (RGL).** The mature, MIT, widely-used draggable/resizable dashboard grid (the Grafana/data-dashboard pattern). Client-only, so per ADR-0007 the boundary is the `components/feature/dashboard/*` island (like React Flow for the whiteboard) — NOT a `server/adapters/` interface (there is no server SDK; the data shape is ours). **Verify React 19 / Next 15 peer compatibility on install** — if RGL can't be made to mount cleanly under React 19 (peer-dep or `findDOMNode` issues), fall back to the lighter "flowing grid" (CSS grid + per-widget `colSpan` + the `@dnd-kit` we already have) which needs no new dependency. This fallback is the explicit safety valve; record the outcome in the lock-in inventory row.
- **Columns:** responsive via RGL's `ResponsiveGridLayout` + `WidthProvider` — **lg = 3 columns**, md = 2, sm = 1. Widgets reflow down at each breakpoint.
- **Per-widget geometry lives in the layout entry's existing jsonb — no migration.** Each `{ widgetKey, settings? }` entry gains an optional `layout?: { x, y, w, h }` (grid units; the canonical `lg`/3-col layout — md/sm are derived at render so we don't store three copies). The save path (`dashboard.saveLayout`) already accepts the entry jsonb (the Zod entry schema is widened to include `layout`); the resolver passes `layout` through untouched. **Backward-compatible:** an entry with no `layout` (every layout saved before this change, and code-default layouts) is auto-placed — we seed a default `{w,h}` from the widget's registry `size` (full → full width; large/medium → 2 cols; small → 1 col) and let RGL pack it. So existing saved layouts keep working and simply gain geometry the first time the user drags.
- **Drag + resize happen on the real grid, in both modes.** View mode renders the RGL grid `static` (no drag handles, no resize). **Customize** flips `isDraggable` + `isResizable` on — the user drags widgets to new cells and drags the corner/edge to resize (width AND height; "narrower/wider" is the headline, height is free with RGL). Content taller than its tile scrolls inside the tile (`overflow: auto`); each widget declares a sensible `minW`/`minH` so it can't collapse. `onLayoutChange` updates the staged draft; Save persists via the existing mutation; Cancel/Reset unchanged.
- **What's retired:** the masonry CSS (`columns-*`) and the flat `SortableList` edit mode. The Add-widget palette, per-widget settings gear, custom-widget instances, workspace-default, and the resolver/precedence all carry over unchanged — a custom widget is just another grid item.
- **Why not free-form pixels / a heavier builder:** RGL's grid-unit model (snap-to-cell, collision, compaction) is the right amount of structure — it keeps the parchment layout tidy and the stored geometry tiny, vs absolute pixels which fragment across viewport widths. **Why not keep the flat-list edit:** the owner explicitly rejected it ("not a flat list") — editing must be on the actual layout.
- **Lock-in:** new row in `04_architecture/lock-in-inventory.md` — RGL, client-only, boundary = the dashboard grid island, migration target = the flowing-grid fallback (CSS grid + `@dnd-kit`), same posture as the React Flow entry.
