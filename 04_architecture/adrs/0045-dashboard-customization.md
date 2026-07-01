# ADR 0045 — Dashboard customization — per-user layouts + workspace defaults

- **Status:** accepted
- **Date:** 2026-06-15
- **Deciders:** Paweł Rosner (project owner)
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

## Amendment (2026-06-15) — flexible grid layout (flowing CSS grid + dnd-kit)

The owner asked for a "fully flexible grid — drag & drop on the actual layout (not a flat list), make widgets narrower/wider, and more columns (like 3)." The N5.2 model gave order only (a CSS-column masonry in view + a flat `@dnd-kit` `SortableList` in edit — no size, edit ≠ the real layout). This amendment replaces the **layout mechanics** (not the registry/resolver/precedence) with a true multi-column, drag-reorderable, width-adjustable grid.

- **Engine: a flowing CSS grid + the `@dnd-kit` we already own — NOT react-grid-layout.** RGL (2.x) was tried first (the obvious "Grafana-style" pick) and **reverted**: its **fixed-cell model truncates content** — our widgets are content-sized lists, and forcing them into fixed-height rows clipped them / forced internal scrollbars — and its responsive layout misbehaved (widgets collapsed into one column). The correct model for content widgets is **auto-height tiles in a flowing grid**, which is also lighter (no new dependency, no SSR width-measurement fragility). This was the fallback the first cut of this amendment named as the safety valve; we took it. **Outcome recorded:** RGL dependency removed; no lock-in row needed.
- **Columns:** a plain CSS grid — `grid-cols-1` (mobile) → `md:grid-cols-2` → `xl:grid-cols-3`. Tiles are content-height (`items-start`); nothing is clipped or truncated by the grid.
- **Per-widget width = a column span (1–3), stored in the layout entry's existing jsonb — no migration.** Each `{ widgetKey, settings? }` entry gains an optional `layout?: { w?: number }` (`w` = span; an older `{x,y,w,h}` is tolerated, only `w` read). `spanFor(size, layout)` falls back to a size default (full → 3, large → 2, medium/small → 1). The resolver passes `layout` through; `saveLayout`'s Zod entry schema accepts it (fields optional). Static responsive `col-span` classes (JIT-safe) apply the span at each breakpoint (a span clamps down where there are fewer columns).
- **Drag + width happen on the real grid, in Customize.** View mode is the grid as-is. Customize wraps each tile in a `@dnd-kit` sortable (`rectSortingStrategy`) — drag by the **grip** to reorder on the grid (not a flat list), set width with an inline **1·2·3** control, plus remove / per-widget settings / custom-widget config (the body stays interactive; only the grip starts a drag). `onDragEnd` rewrites the draft order; Save persists `{widgetKey, settings?, layout?}[]`; Cancel/Reset unchanged.
- **Why a span control, not corner-drag resize:** a click target is reliable + accessible; RGL's corner-drag is exactly what misbehaved. Order is the array order (drag-reorder), so there's no separate x/y to store — the data stays tiny and there are no fixed heights to clip content.
- **What's retired:** the masonry CSS (`columns-*`) and the flat `SortableList` edit mode. The Add-widget palette, settings gear, custom widgets, workspace-default, and the resolver/precedence all carry over — a custom widget is just another grid item.
- **Lock-in:** none new — the grid uses `@dnd-kit` (already inventoried) + plain CSS. **Why not keep the flat-list edit:** the owner explicitly rejected it ("not a flat list") — editing is on the actual grid.
