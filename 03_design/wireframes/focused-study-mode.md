# Wireframe spec — Focused study mode

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture v0.4 — two-mode model](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

When a researcher opens a study, the workspace chrome gets out of the way — they are in "study mode" until they explicitly close it, so the work surface (Builder, Whiteboard, Design, Results…) gets the full page.

## Layout

Two chrome modes, switched automatically by URL path (no manual toggle):

- **Workspace mode** (`/studies`, `/browse`, `/activity`, `/frameworks`, `/settings/*`) — unchanged IA v0.3 chrome: top bar + left-rail destinations + work-surface card. See [workspace-mode-topbar](workspace-mode-topbar.md).
- **Focused study mode** (`/studies/[id]/*`) — this spec:

```
┌────────────────────────────────────────────────────────────────────┐
│ WorkspaceName · Studies / Study Title     autosave   ⋯   ✕         │  ← flat strip, border-bottom only
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   [stage tabs + work surface + right context panel]                │  ← full width; NO left rail
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The top bar is a flat flush strip (no boxed card — per owner: "make nav part of top of page, not a box"). The left rail is fully hidden in focused mode; cross-study navigation moves to the breadcrumb's `Studies` link, ✕ Close, and the ⌘K palette.

## Content inventory

- **Workspace name** — left edge, muted small text; from server (`workspace.active`). Orientation only — the switcher popover stays deferred (single-workspace reality).
- **Breadcrumb `Studies / [Study Title]`** — `Studies` is a real link back to `/studies`; the title is the studies.get cache read (Plex Serif, primary color, truncated ~220px). Inline title editing stays on the Details panel (already shipped V1.8.2) — not duplicated here.
- **Autosave indicator** — existing `AutosaveIndicator` component, unchanged.
- **⋯ More menu** — per-study actions that already have backends: Export summary (PDF) → `/studies/[id]/export-pdf`; Export data (CSV) → `/studies/[id]/results/export`; Archive study → `studies.archive` (new mutation; sets `archived_at`, returns to `/studies`). Duplicate / Delete are deferred to the Wave 6 bulk-operations slice (no backend yet — why-not: inventing them here would bypass that spec).
- **✕ Close** — returns to `/studies`. Static `aria-label="Close study"`.
- **Stage tabs + work surface + right panel** — unchanged from the build-stage wireframes; they simply gain the rail's width. The work-surface ↔ context-panel divider is draggable (220–480px, default 250, double-click reset, per-device persistence — same handle pattern as the rail; works on either panel side).

## States

- **Default** — chrome as drawn; all menu items enabled.
- **Loading** — title shows "Study" placeholder until the studies.get cache fills (existing breadcrumb behavior).
- **Empty** — n/a (the route only exists for an existing study).
- **Partial** — viewer-role user: Archive visible but server-rejected (writeProcedure), matching every other Builder write surface — the client doesn't role-gate visually anywhere yet.
- **Error** — Archive failure surfaces the standard mutation toast; menu stays open-able.
- **Success / optimistic** — Archive navigates to `/studies` after the mutation resolves (no optimistic redirect — the study disappears from the default list, so a failed archive must not strand the user).

## Interactions

- Click `Studies` in the breadcrumb or ✕ → `/studies` (plain navigation; unsaved state is impossible — autosave).
- ⋯ opens a small menu (same pattern as UserMenu): Export summary (PDF), Export data, divider, Archive study. Archive asks for confirmation via the existing ConfirmDialog ("Archive this study? It moves to the Archived filter — nothing is deleted.").
- ⌘K opens the command palette anywhere; in focused mode, study stage jumps (Overview / Build / Design / Preview / Share / Preregister / Run / Results) rank first.
- Mode switch is purely route-driven: navigating to `/studies/[id]/build` renders this chrome server-side (route group layout) — no flash, no client toggle.

## Edge cases

- Direct deep link into a study (no `/studies` visit first): breadcrumb still links back; ✕ goes to `/studies` (not browser-back, which could leave the app).
- Archived study opened from the Archived filter: chrome identical; Archive menu item reads "Unarchive" if/when an unarchive mutation lands (deferred with bulk ops).
- Public `/browse/[studyId]` detail is NOT focused mode — it is a workspace-mode destination (reading someone else's study is browsing, not working).
- The participant `/take/*` and `/preview/*` surfaces are unaffected (separate route trees, no app chrome).

## Accessibility notes

- The top bar is a `<header>` landmark; ⋯ menu is a `menu`-pattern popover with arrow-key navigation (mirror UserMenu's implementation).
- ✕ is a real `<button>` with `aria-label="Close study"`; breadcrumb links are plain anchors.
- Focus order: workspace name → breadcrumb link → autosave (inert) → ⋯ → ✕ → page content.
- Axe spec covers the focused-mode chrome (gated like the existing axe pass).

## Open questions

- None blocking. The rail-collapse icon (slim icon-strip variant) from the handoff sketch is deferred — focused mode ships rail-hidden only; reopen if the owner misses in-study access to destinations after living with ⌘K.
