# Wireframe spec — Personal-mode top bar + workspace switcher

- **Serves user flow:** [Navigate Home and switch workspaces](../../02_product/user-flows/navigate-home-and-workspaces.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Multi-site coordinator](../../02_product/personas/multi-site-coordinator.md)
- **Status:** draft

## Purpose

Give personal mode (`/home`) a chrome that has **no false workspace context** and put the **workspace switcher** — the control that moves between Home and each workspace — into the top bar (shared with workspace mode). It replaces today's disabled "coming soon" switcher stub.

## Layout

A single floating top strip (reuses the workspace-mode TopBar shell + tokens, `surface.panel`, bottom hairline), left→right:

1. **Workspace switcher button** — same affordance in both modes. In personal mode it reads **"Home"**; in workspace mode it reads the active workspace name. Chevron opens the switcher popover.
2. **Brand/context label** — in personal mode, a quiet "Home · all workspaces" (no breadcrumb — there's no workspace path).
3. **Spacer** → **⌘K** command palette → **user menu** (avatar/initials).

**No LeftRail in personal mode** (the distinguishing feature from workspace mode). `+ New study` is NOT in the personal top bar (creating a study needs a workspace; it lives on the Home Quick-actions widget with a workspace picker instead).

## Content inventory

- **Switcher button label** — "Home" (personal) or `workspace.name` (workspace); truncates past ~200px with a title attr.
- **Switcher popover** — from `workspace.list()`:
  - **"Home — All my workspaces"** row (top; active-highlighted when in personal mode) → `/home`.
  - divider; one **workspace row** per membership: name + role chip; the active workspace shows a ★ + "current"; default sort last-activity-desc.
  - divider; **"+ Create workspace"** → the create-workspace flow.
- **User menu** — existing `UserMenu` (account, settings, sign out) — unchanged.

## States

- **Default (personal):** switcher reads "Home"; popover's Home row active.
- **Default (workspace):** switcher reads the workspace name; popover's matching workspace row active.
- **Loading (popover):** skeleton rows while `workspace.list()` resolves; the button label uses the already-known active name/"Home" so the bar never flickers.
- **Empty:** not reachable post-onboarding (≥1 workspace always); if `list()` returns one workspace, the popover still shows Home + that one + Create.
- **Switching:** the picked row shows a brief pending state; on success the app navigates (workspace → `/dashboard`; Home → `/home`). Error → inline "Couldn't switch — try again" in the popover; active workspace unchanged.

## Interactions

- **Open switcher** — click/Enter on the button → popover; focus moves to the first row; Esc closes; click-outside closes.
- **Pick "Home"** — navigate to `/home` (personal mode). No server write (Home is not a workspace).
- **Pick a workspace** — `workspace.switch({ workspaceId })` (sets `lastWorkspaceId` via the auth adapter), then navigate to `/dashboard`. Membership-checked server-side; a removed membership → that row disabled with "no longer a member".
- **Create workspace** — opens the existing create flow.

## Edge cases

- **Many workspaces (>8)** — popover scrolls; (search box deferred — Open question).
- **Long workspace names** — truncate in the row + button; full name via title.
- **Active workspace removed out from under the user** — `workspace.active()` falls back (sole/owner membership or Home); the switcher reflects the fallback.
- **Slow `switch()`** — pending state on the row; the rest of the bar stays interactive.

## Accessibility notes

- The switcher is a real menu button: `aria-haspopup="menu"`, `aria-expanded`, popover `role="menu"`, rows `role="menuitem"`; arrow-key navigation; Esc closes and returns focus to the button.
- Active row marked with `aria-current` (not color-only — also the ★/"current" text).
- Role chips pair text with tone (not color-only).

## Open questions

- Search box in the switcher — deferred until a user has enough workspaces to need it.
- Does personal mode ever show a minimal rail (e.g., Home / Notifications / Settings) instead of none? v1: none; revisit if personal mode gains siblings (`/me`, `/notifications`).
