# Wireframe spec — Dashboard customize mode

- **Serves user flow:** [Navigate Home and switch workspaces](../../02_product/user-flows/navigate-home-and-workspaces.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Multi-site coordinator](../../02_product/personas/multi-site-coordinator.md)
- **Status:** draft

## Purpose

Let a researcher tailor a dashboard to their own work — reorder widgets, add ones they want, remove ones they don't — so the at-a-glance view matches how *they* run studies. Applies to the personal `/home` and the per-workspace `/dashboard` (ADR-0045). The Studies·Running tab is excluded (operational, fixed). A workspace admin can additionally set a "house default" the team inherits.

## Layout

The dashboard surface is unchanged in **view mode** — the masonry widget grid (`user-dashboard.md` / `workspace-dashboard.md`). The only addition is a **"Customize" button** in the top-right of the dashboard header, beside a quiet **"Reset to default"** link.

Entering **edit mode** keeps the same grid but overlays affordances:

- **Edit toolbar** (replaces the header actions): **Save**, **Cancel**, and a live "Editing layout" label. For the workspace dashboard, an admin also sees **"Set as workspace default"**.
- **Each widget** gains a **drag handle** (grip icon, top-left of the card) and an **✕ remove** button (top-right). Widgets with settings show a small **gear** icon.
- **Add-widget bar** — a horizontal, scrollable strip pinned at the bottom in edit mode, listing every registry widget the user hasn't added yet (each as a chip: name + category badge). Empty when all available widgets are placed.

## Content inventory

- **Customize button** — enters edit mode. Static label; always present in view mode.
- **Reset-to-default link** — static; opens a confirm dialog.
- **Drag handle (per widget)** — affordance only; `aria-label` "Reorder {widget name}".
- **Remove button (per widget)** — `aria-label` "Remove {widget name}".
- **Gear / settings (per widget, optional)** — opens an inline popover; only on widgets whose registry entry declares a `settings` schema (e.g. "Show N items"). Source: the widget's stored `settings` (jsonb) or its default.
- **Add-widget chips** — computed: registry widgets valid for this dashboard (`dashboard: user|workspace|both`, `ownerOnly` filtered) minus the ones already in the layout. Each chip: widget name + category badge.
- **Edit toolbar** — Save / Cancel / (admin) Set-as-workspace-default.
- **"Editing layout" status** — `aria-live` announcement when entering/leaving edit mode.

## States

- **View mode (default)** — widgets render normally; no handles, no remove, no add bar. Identical to today plus the Customize button.
- **Edit mode** — handles + remove + add bar visible; drag reorders with a drop-placeholder shadow (dnd-kit default); changes are staged client-side.
- **Loading** — the dashboard's normal per-widget loading (unchanged); the layout itself resolves server-side at page load, so edit affordances appear instantly once the page is interactive.
- **Empty layout** — every widget removed: show a muted "No widgets — add some from the bar below, or Reset to default." The add bar lists everything.
- **Partial / error (save)** — a failed `saveLayout` keeps edit mode open, restores the toolbar to idle, and shows an inline error ("Couldn't save your layout — try again."); the staged changes are preserved so the user can retry.
- **Success / optimistic** — reorder/add/remove apply instantly client-side; Save persists (`saveLayout`) and drops back to view mode; a brief "Layout saved" confirmation.

## Interactions

- **Customize** — click → enters edit mode (handles/remove/add bar appear; toolbar swaps to Save/Cancel). No server call.
- **Drag a widget** (handle) — reorders within the grid; drop-placeholder shows the target slot; on drop the staged order updates. Keyboard: focus the handle, arrow keys move the widget, Space/Enter drops.
- **Remove (✕)** — animates the widget out and returns its chip to the add bar. Staged only until Save.
- **Add (chip)** — click (or Enter when focused) appends the widget to the end of the layout; the chip leaves the bar. Staged.
- **Gear / settings** — opens an inline popover (e.g. a radio for "Show 5 / 10 / 20 items"); choosing updates that widget's staged `settings`.
- **Save** — `dashboard.saveLayout({ kind, workspaceId?, widgets })` → persists the per-user override → view mode. Error path: inline error, stay in edit mode.
- **Cancel** — discards staged changes, reverts to the last-saved (resolved) layout, returns to view mode. No server call.
- **Reset to default** — confirm dialog ("This replaces your current layout with the default. Continue?") → `dashboard.resetLayout` deletes the user override → the dashboard falls back to the workspace default (if any) or the code default.
- **Set as workspace default** (admin only, workspace dashboard) — `workspace.setDashboardDefault({ widgets })` writes the current layout as the team's house default; non-admins never see the control (and the mutation is role-gated server-side).

## Edge cases

- **Very long widget names** in the add bar / handles — truncate with ellipsis; full name in `title` + `aria-label`.
- **Zero widgets** — handled by the empty-layout state.
- **All widgets added** — the add bar shows a muted "All widgets added."
- **A stored widget key no longer exists** (widget retired) — the resolver drops it silently before render (forward-compat, ADR-0045); the user never sees a broken card.
- **`ownerOnly` widget, non-owner viewer** — never offered in the add bar and filtered from any inherited layout that contains it.
- **Slow network on Save** — Save shows a pending state (PendingButton); edit mode stays until it resolves.
- **Two tabs editing the same dashboard** — last Save wins (single per-user row, `UNIQUE (user_id, dashboard_kind, workspace_id)`); no merge in V1.13.0.
- **Admin sets a workspace default that includes a widget a member can't see** — filtered per-viewer at resolve time.

## Accessibility notes

- Drag handles are focusable buttons with `aria-label`s; reorder is fully keyboard-operable (arrow keys + Space/Enter) via dnd-kit's keyboard sensor — not mouse-only.
- Entering/leaving edit mode is announced via an `aria-live="polite"` region ("Editing layout" / "Layout saved").
- Remove/add controls have descriptive accessible names that include the widget name.
- The add-widget bar is a horizontally-scrollable list with arrow-key navigation between chips; chips are buttons, activatable by Enter/Space.
- Respect `prefers-reduced-motion`: the remove/add animations and the drag placeholder collapse to instant transitions.
- Edit-mode affordances meet the same contrast tokens as the rest of the surface (no color-only signalling — the handle/remove are icons with labels, not color states).

## Open questions

- Per-widget settings schema is intentionally minimal in V1.13.0 (itemCount / sort / window). Richer settings (date ranges, saved filters) would warrant promoting `settings` out of the jsonb blob — deferred.
- Mute/snooze and announcement-widget authoring are out of scope (those belong to the deferred widget-catalog work, not the customization mechanics).
- Multi-breakpoint layouts (different order on mobile) are out of scope — one ordered list per (user, dashboard). Revisit per ADR-0045 triggers.
