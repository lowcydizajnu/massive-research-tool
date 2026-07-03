# Wireframe spec — Studies destination

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Hanna's home base. The list of studies in this workspace, filterable by stage and ownership, with the entry point for creating a new study.

## Layout

Modular floating panels on `color.surface.page` (parchment in Light, warm-dark in Dark). Per design-language brief v0.5.1:

- **Top bar (full width)** — workspace switcher chip (left), breadcrumb `Misinformation Lab · Studies`, ⌘K search chip, user menu (right). Sits as a floating cap with its own `color.surface.panel` background, `radius.lg` corners, `border.subtle` outline, 12-16px gutter to the page edge.
- **Left rail (card, ~155px)** — top-level destinations: Studies (active), Library, Frameworks, Participants, Activity, Team, Settings. Bottom: Help, What's new, user shortcut. Floating card on `surface.panel`.
- **Center work surface (card, fills remaining width)** — the Studies list itself. Floating card on `surface.canvas` (white in Light, warm-dark canvas in Dark). 12-16px gutters separate it from the rail card on the left and the page edge on the right.
- **Right context panel** — collapsed by default on the Studies destination (no object selected); a thin re-open affordance pinned to the right edge.

Sub-nav for Studies (All / Mine / Drafts / Preregistered / Published / Replicating / Archived) sits inside the work surface card as a horizontal tab strip just under the destination header.

## Content inventory

- **Top bar — workspace chip** — `Misinformation Lab ▾` with chevron. Source: current workspace from auth context. Max length ~24 chars before truncation.
- **Top bar — breadcrumb** — `Misinformation Lab · Studies`. Computed from current route.
- **Top bar — ⌘K search affordance** — small pill labelled `⌘K`. Static.
- **Top bar — `+ New study` button** — primary action. Static label.
- **Top bar — user avatar / menu** — initials circle or photo. Source: auth.
- **Left rail — destinations list** — 7 items, each icon + label + (optional) unread badge for Activity. Source: static IA.
- **Work surface header — destination name** — `Studies` in `text.display` Plex Serif 32-40px. Static label.
- **Work surface header — sub-nav tabs** — All / Mine / Drafts / Preregistered / Published / Replicating / Archived. State indicates current filter.
- **Work surface — study card (repeated)** — title (Plex Serif 17px 500), stage badge, last-edited timestamp, owner initials, optional `Replicating {parent author}` subtitle, optional tags. Source: workspace studies query.
- **Work surface — filter bar** — tag filter, sort dropdown (Last edited / Created / Title), view toggle (list / grid). Above the cards.
- **Work surface — empty-state copy** — "Your first study is one click away." Plus the `+ New study` button as the only CTA.

## States

- **Default** — workspace has at least one study; cards display in chosen sort order.
- **Loading** — skeleton cards (3-5) on `surface.canvas` with shimmer (`motion.fast` opacity loop). Sub-nav tabs visible, all disabled.
- **Empty (new workspace)** — single `surface.subtle` card centered with the copy + CTA above; sub-nav tabs visible but most show `(0)`.
- **Empty (filter returns nothing)** — small card with "Nothing matches this filter" + a reset-filter link.
- **Partial (some data, some pending)** — visible cards render; one at the bottom shows a skeleton row.
- **Error (workspace query fails)** — top-of-work-surface banner in `color.danger.subtle` with the error reason + a `Retry` button. Cards already loaded remain visible.
- **Offline** — top-bar offline indicator (warm amber dot + "Offline"); the list shows last-known cache; the `+ New study` button shows a tooltip "Reconnect to create".

## Interactions

- **`+ New study`** — opens the New study modal (separate wireframe spec). Keyboard shortcut `⌘N`.
- **⌘K search affordance** — opens the search modal with scope dropdown (per IA v0.3).
- **Workspace chip** — opens workspace switcher popover (Linear-style per IA v0.3).
- **Sub-nav tab** — filters the list; updates URL query; preserves sort.
- **Study card click** — navigates to the study at its current stage (usually Build for drafts; Run or Results for live studies).
- **Study card ⋯ actions menu** (2026-07-03) — a `MoreHorizontal` button in the card's top-right (always visible; above the card's full-surface overlay link so its clicks don't navigate) opens the shared `StudyActionsMenu` — the same menu as the focused study top bar: Export summary (PDF), Export data, **Duplicate study** (a clean same-workspace copy, "(copy)" title, lands on the copy's builder), **Archive / Unarchive**, and **Delete study…** (typed-title confirm). Owner-safety is server-enforced (delete needs the study author or a workspace owner/admin).
- **Tag filter** — multi-select; chips appear above the list when active.

## Edge cases

- **Very long study title** — truncate at card width with ellipsis; tooltip on hover.
- **0 studies** — empty state above.
- **1 study** — single card; sub-nav still visible.
- **1000 studies** — virtualized list; sub-nav remains.
- **Replicating subtitle long** — truncate parent author + study slug separately.
- **Stage badge for "Replicating" filter** — each card shows BOTH its own stage AND the "replicating" indicator subtitle.
- **Slow workspace query** — skeleton stays up to 800ms; after that switches to a `surface.subtle` "still loading…" line.

## Accessibility notes

- Sub-nav tabs are a proper `<nav role="tablist">` with `aria-selected` on the active tab; arrow-key navigation between tabs.
- Study cards are keyboard-focusable in DOM order matching visual order; `Enter` opens, `Space` opens, `Esc` does nothing.
- `+ New study` button has `aria-keyshortcuts="Command+N"`.
- The empty state's CTA is the first focusable element when the empty state renders.
- All color-coded stage badges have an accompanying text label per Color rules.

## Open questions

- **Sort default** — Last edited (assumed) vs Last opened (different signal). Probably Last edited but Hanna might value Last opened more.
- **Card density** — list mode shows ~12 per viewport at desktop; grid mode shows ~6. Default to list because Hanna's daily action is "find the study I was on yesterday" which list serves better.
- **Stage badge color encoding** — Drafts and Preregistered should look distinct at a glance. Probably `surface.subtle` for Drafts, `color.primary.subtle` for Preregistered, `color.success.subtle` for Published. Confirm in higher-fi.
