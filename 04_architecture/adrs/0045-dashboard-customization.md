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
