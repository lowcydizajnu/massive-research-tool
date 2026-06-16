# Wireframe spec — Participants destination

- **Serves user flow:** [Run and read results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

The workspace-mode home for managing participants across studies and recruitment providers — the destination that closes the loop V1.5 left open (manual URL copy into Prolific). It is a thin shell + sub-nav; the five sub-views (Connections / Open recruitment / Panels / Compensation / Quality) do the work. This spec covers only the shell + sub-nav (Section P8); each sub-view has its own wireframe.

## Layout

Standard workspace chrome (TopBar + LeftRail + optional right panel), unchanged. The work surface holds:

- **Sub-nav strip** (top of the work surface): `Connections · Open recruitment · Panels · Compensation · Quality`. Same visual treatment as the Team destination's sub-nav (segmented control on the parchment panel). The active sub-view is highlighted; each is a child route under `/participants/<sub-view>`.
- **Child route outlet** below the sub-nav: the active sub-view renders here.

The LeftRail "Participants" entry (visible-but-inert since V1.7.0) gains a real `href: "/participants"`.

## Content inventory

- **Sub-nav tabs** — five labels, static; each links to its child route. Connections / Open recruitment / Panels / Compensation / Quality.
- **Active-tab indicator** — computed from the current pathname.
- **Sub-view outlet** — the rendered child route (server-rendered per sub-view).
- **(No page-level header beyond the sub-nav)** — each sub-view owns its own title, matching the Team destination pattern.

## States

- **Default** — sub-nav rendered; the requested sub-view below it.
- **Loading** — each sub-view owns its own loading state; the shell + sub-nav render instantly (static).
- **Empty** — `/participants` (no sub-view) **redirects**: to `Connections` if the workspace has no recruitment-provider connection yet; to `Open recruitment` if at least one connection exists. The bare destination is never a dead end.
- **Partial / Error** — owned by each sub-view.

## Interactions

- **Sub-nav tab** — click → navigate to that child route (`/participants/connections`, etc.); the strip re-highlights. Keyboard: tabs are links, focusable in order, Enter activates.
- **LeftRail "Participants"** — click → `/participants` → redirect per the Empty rule above.

## Edge cases

- **No connections** — `/participants` lands on Connections (the only actionable sub-view); the others render their own empty states ("Connect a provider to see …").
- **Deep link to a sub-view with no data** — renders that sub-view's empty state, not a redirect (only the bare `/participants` redirects).
- **Long workspace name in chrome** — unchanged from existing chrome truncation.
- **Viewer role** — read-only treatment per the T3.5 RBAC sweep: viewers view every sub-view but write actions (connect, approve, create panel, set budget, resolve flag) are disabled with the standard read-only tooltip/banner.

## Accessibility notes

- Sub-nav is a `nav` with the Team destination's tab semantics (links styled as tabs; `aria-current="page"` on the active one). Focus order: sub-nav left→right, then the sub-view.
- The redirect on bare `/participants` is a server redirect (no client flash), so screen-reader users land directly on the resolved sub-view.

## Open questions

- None blocking the shell. Sub-view-specific questions live in each sub-view's wireframe.
