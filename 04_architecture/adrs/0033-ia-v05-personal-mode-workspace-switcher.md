# ADR 0033 — IA v0.5 — personal mode + workspace switcher

- **Status:** proposed
- **Date:** 2026-06-15
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** ia, chrome, navigation, multi-workspace

## Context

ADR-0032 (IA v0.4) established a **two-mode chrome** selected by the URL via route groups: `(workspace)` (TopBar + LeftRail destinations) and `(study)` (slim focused top bar). V1.13.0 introduces a **User dashboard** at `/home` that is inherently **cross-workspace** — it summarizes activity across every workspace the user belongs to. That content does not fit workspace-mode chrome (whose TopBar names one workspace and whose LeftRail lists that workspace's destinations).

A second gap surfaced while grounding this work: the **workspace switcher does not exist**. `components/chrome/top-bar.tsx` renders it as a *disabled* button ("Switch workspace — coming soon"), and `workspaceRouter` exposes only `active()` / `members()` — there is no `list()` and no `switch()`. The active workspace is resolved server-side (`workspace.active()`), but the user has no way to change it. The entire three-dashboard navigation model the owner described (pick **Home** → personal mode; pick a workspace → its dashboard) depends on a real switcher. So this ADR covers both: the new mode **and** the switcher that moves between modes/workspaces.

This refines ADR-0032; it does not replace it. Two-mode becomes three-mode.

## Options considered

### Option A — `/home` in workspace-mode chrome

Render the cross-workspace dashboard inside the existing workspace chrome.

- **Pros:** no new layout; least code.
- **Cons:** actively confusing — the LeftRail says "Studies / Library …" of workspace X while the main area shows data from X + Y + Z; the TopBar names one workspace for a page that is about all of them. **Rejected.**

### Option B — Personal mode as a third route group (chosen)

Add `app/(app)/(personal)/` with a slim layout: a TopBar variant (avatar + name + **workspace switcher** + ⌘K + user menu) and **no LeftRail**. `/home` (and later `/me`, `/notifications`) live here.

- **Pros:** clean mental model (no false workspace context); reuses the URL-as-mode pattern from ADR-0032; small additive layout; the switcher in this top bar is the natural way back into a workspace.
- **Cons:** a third chrome variant to maintain; requires building the switcher.

## Decision

**We will adopt Option B: a third chrome mode, "personal mode", as the route group `(app)/(personal)/`, and build the workspace switcher that moves between Home (personal mode) and each workspace (workspace mode).**

### The three modes (IA v0.5)

| Mode | Route group | Chrome | URLs |
| --- | --- | --- | --- |
| **Personal** | `(personal)` | slim TopBar (avatar + switcher + ⌘K + menu), no LeftRail | `/home` (and future `/me`, `/notifications`) |
| **Workspace** | `(workspace)` | TopBar (workspace switcher + breadcrumb) + LeftRail | `/dashboard`, `/studies`, `/browse`, `/activity`, `/frameworks`, `/library`, `/settings` |
| **Focused study** | `(study)` | slim focused top bar | `/studies/[id]/*` |

Mode is the URL (no client branching), consistent with ADR-0032.

### The workspace switcher

A popover anchored on the TopBar workspace button (both personal and workspace modes). Contents, top to bottom:

```
▸ Home — All my workspaces        ← enters personal mode (/home)
──────────────────────────────────
★ <Active workspace> (current)
  <other workspaces…>             ← each: name + role; picking it switches + lands on /dashboard
──────────────────────────────────
+ Create workspace
```

New `workspaceRouter` procedures:
- `workspace.list()` — the caller's active memberships (id, name, role, lastActivity, studyCount) for the switcher + the Home Workspaces card. Read over `member ⨝ workspace`.
- `workspace.switch({ workspaceId })` — sets the active workspace (writes `lastWorkspaceId` to the auth adapter's user metadata — the same mechanism onboarding already uses; no new column). Validates the caller is an active member. Returns `{ ok }`; the client then navigates to `/dashboard`.

`workspace.active()` already resolves the active workspace from `lastWorkspaceId` (falling back to the sole/owner membership), so `switch()` just updates that pointer — no schema change.

### Entry + redirect

- **Root redirect** (`app/page.tsx`): authenticated → **stays `/studies` for now**, flips to `/home` in a follow-up once Home is proven in production (avoids changing every user's entry point in the same release that introduces it). The switcher's **Home** entry is the primary way in meanwhile.
- Picking a workspace from the switcher → `/dashboard` (workspace dashboard, ADR-0034/N2). Until `/dashboard` ships, picking a workspace lands on `/studies` (the current landing) — the switcher is forward-compatible.

### What this does NOT change

- Workspace-mode and focused-study chrome are untouched.
- `studyRouter` / Studies destination unchanged.
- No DB migration (active workspace stays in auth metadata).

## Consequences

- **Easier:** a coherent cross-workspace home; real multi-workspace switching (the connective tissue all three V1.13 dashboards need); a clean place for future personal surfaces (`/me`, `/notifications`).
- **Harder:** a third chrome variant to keep consistent; the switcher popover + its two procedures are net-new surface.
- **Committed to:** URL-as-mode for personal mode; `workspace.list()` / `workspace.switch()`; the switcher living in both personal and workspace top bars.
- **Precluded from:** rendering cross-workspace content inside workspace chrome; switching the active workspace without a membership check.

## Revisit triggers

- Single-workspace users find Home redundant → consider skipping them straight to their workspace dashboard.
- The root redirect flip to `/home` (planned follow-up) — revisit once Home is validated.
- A workspace count large enough that the switcher needs search/sections.

## References

- ADR-0032 — IA v0.4 two-mode chrome (this extends it to three).
- `02_product/user-flows/navigate-home-and-workspaces.md` — the flow this serves.
- `03_design/wireframes/personal-mode-topbar.md`, `03_design/wireframes/user-dashboard.md`.
- `03_design/ia/information-architecture.md` — bumped to v0.5 when this lands.
- `05_app/components/chrome/top-bar.tsx` (switcher stub today), `05_app/server/trpc/routers/workspace.ts` (`active`/`members` today), `05_app/app/(app)/layout.tsx` (mode route groups).
- V1.13.0 handoff (Sections N1 + N2); owner direction 2026-06-15 (three-dashboard model + "Home" in the switcher).
