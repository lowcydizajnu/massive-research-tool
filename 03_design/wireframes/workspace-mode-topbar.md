# Wireframe spec — Workspace mode top bar

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture v0.4 — two-mode model](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

The workspace-mode chrome (destinations: Studies, Browse, Activity, Frameworks, Settings) restyled per IA v0.4 — a flat strip merged with the page top instead of a floating boxed card, plus a live ⌘K and a resizable left rail.

## Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ WorkspaceName ▾  · Studies        autosave  ⌘K  [+ New study]  (ŁD)│  ← flat strip, border-bottom only
├──────────────┬┄────────────────────────────────────────────────────┤
│ Studies      ││                                                    │
│ Library      ││   work-surface card                                │
│ Frameworks   ‖│   (unchanged)                                      │
│ Browse       ││                                                    │
│ …            ││← drag handle (resizable rail)                      │
└──────────────┴┄────────────────────────────────────────────────────┘
```

Changes from the v0.3 chrome, all visual/behavioral — contents and order unchanged:

1. **Flat top bar** — the `<header>` loses its rounded-card border/box; it becomes a full-width strip flush with the viewport top, separated by `border-bottom` on `border.subtle` over `surface.panel`. (Owner: "Visually make nav also part of top of page, not as box as is now.")
2. **Resizable rail** — a thin drag handle between the LeftRail and the work surface; pointer-drag resizes the rail between ~120px and ~360px (default 155px, the current width). Double-click resets to default. Width persists per device (localStorage — see ADR-0032 for the why-not-Clerk-metadata).
3. **Live ⌘K** — the inert keycap chip becomes a button that opens the command palette (also bound to ⌘K/Ctrl+K globally). Palette spec: search studies by title, jump to destinations, and — when inside a study — stage jumps ranked first.

## Content inventory

- **Workspace name + ▾** — existing switcher affordance (popover still deferred).
- **Breadcrumb** — existing route-aware component, unchanged.
- **Autosave indicator** — unchanged.
- **⌘K button** — opens the palette; visually the same keycap, now interactive with `aria-label="Open command palette"`.
- **+ New study / user menu** — unchanged.
- **LeftRail destinations** — unchanged list (IA v0.3 set); the rail card itself is now resizable.
- **Drag handle** — 6px hit area, `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow` = current px, keyboard-resizable (arrow keys, 16px steps).
- **Command palette dialog** — input + grouped results (Stages [focused mode only] / Studies / Destinations); footer hint row (↑↓ navigate · ↵ open · esc close).

## States

- **Default** — as drawn.
- **Loading** — palette study results show a one-line "Searching…" while the studies query resolves; rail renders at the persisted width immediately (no flash — width read before paint).
- **Empty** — palette with no matches: "No matches — try a study title or a destination name."
- **Partial** — n/a.
- **Error** — palette study search failure falls back to destinations-only (still functional).
- **Success / optimistic** — selecting a palette result navigates and closes the palette.

## Interactions

- Drag the handle → rail width follows pointer, clamped 120–360px; release persists. Double-click → reset to 155px. Arrow keys when the handle is focused → ±16px.
- ⌘K / Ctrl+K anywhere (both modes) → palette opens with the input focused; typing filters; ↑↓ moves the active option; ↵ navigates; esc closes.
- Palette ranking: focused mode lists the current study's stages first, then studies, then destinations; workspace mode lists studies then destinations.

## Edge cases

- Very narrow viewports: below the `lg` breakpoint the handle hides and the rail keeps its responsive behavior (IA-level responsive rules unchanged).
- localStorage unavailable (private mode): resize works for the session, default width next visit — silent.
- Rail resized very narrow (<140px): destination labels truncate with ellipsis; icons keep the row scannable.

## Accessibility notes

- The handle is keyboard-operable (`role="separator"`, `tabIndex=0`, arrow keys) and invisible to screen readers otherwise harmless — it sits between two landmarks (nav and main).
- The palette is `role="dialog"` + `aria-modal`, input labeled, results a `listbox` with `aria-activedescendant`; focus returns to the trigger on close.
- The flat top bar keeps its `<header>` landmark; contrast of the border-bottom separator is decorative (the landmark carries the structure).

## Open questions

- None blocking. Workspace switcher popover remains deferred until multi-workspace is real.
