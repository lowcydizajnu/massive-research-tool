# Wireframe spec — Workspace dashboard

- **Serves user flow:** [Navigate Home and switch workspaces](../../02_product/user-flows/navigate-home-and-workspaces.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

`/dashboard` (workspace mode) — the team-shared overview a member sees on entering a workspace ("what's going on here?"). The **default landing** when you pick a workspace from the switcher (ADR-0033). Studies stays a sibling destination, unchanged (owner: "studies are as they are actually"). Read-mostly, built on data that already exists (`experiment`, `response`, `recruitment_session`, `activity_event`, `review_request` events, `tag`). No migration.

## Layout

Workspace-mode chrome (TopBar + LeftRail) — same as Studies. The work area is a single parchment column of widget cards (matching `/home`'s treatment, reusing the dashboard widget pattern). Default fixed order; per-user customization is Stream F (ADR-0036). Multi-column on wide, single-column on mobile.

## Content inventory

Widgets (default order; registry keys per ADR-0036, `dashboard: 'workspace'`):

- **Workspace header** (`workspace-header`) — name + member count + study count + a Settings link (owners/admins). Source: `workspace.active` + `workspace.dashboardStats`.
- **At-a-glance stats** (`at-a-glance-stats`) — KPI strip: studies by stage (draft / preregistered / published / archived); active-recruitment count; responses this week (+ Δ vs last week); pending reviews. Source: `workspace.dashboardStats()`.
- **Active recruitment** (`active-recruitment`) — currently-recruiting studies in this workspace + per-study n/target + last-response age; click → that study's Run stage. Source: a workspace-scoped slice of the recruiting query (shared with `me.recruitingStudies`).
- **Recent activity** (`workspace-activity`) — last ~15 `activity_event` rows scoped to this `workspace_id` (comments, mentions, OSF pushes, recruitment opens, versions saved). Distinct from the user-scoped Activity·Follows destination. Source: `workspace.recentActivity({ limit })`.
- **Pending reviews** (`pending-reviews`) — open `review_request` events in this workspace (requestor + requestee + study + age). Source: `workspace.pendingReviews()`. NOTE: needs a resolved/seen flag to drop addressed ones (small additive field — confirm with the data-model pass; until then show recent N).
- **Recently edited** (`recently-edited`) — studies updated in the last 7 days + editor + brief diff summary. Source: existing `studies.list` with a `recent-7d` sort (or a dedicated query).
- **Top tags** (`top-tags`) — most-used tags (last 30d); click → filter the Studies list. Source: `workspace.topTags({ window })`.
- **OSF status** (`workspace-osf-status`) — workspace's pending OSF registrations / recent DOIs / push errors (ADR-0005).
- **Storage + cost** (`storage-cost`, **owners only** — `ownerOnly`) — R2 / job / AI usage. **Deferred** to when metering exists; show a "Coming soon" placeholder gated to owners.

## States

- **Default** — populated widgets.
- **Loading** — per-widget skeletons; the page shell paints immediately (RSC streams).
- **Empty** — a new/quiet workspace: stats show 0s; activity shows "No activity yet"; recruitment shows "No studies recruiting".
- **Partial / error** — per-widget error isolation (one failed query shows its own error + retry; the rest render). Hard requirement, same as `/home`.
- **Role-gated** — `storage-cost` only renders for owners; non-owners don't see it (not a disabled shell).

## Interactions

- **A recruiting study / activity / review / recently-edited row** — navigates within the workspace (already the active one) to the relevant stage/destination.
- **Top tag** — navigates to `/studies` filtered by that tag.
- **Settings link** — `/settings` (owners/admins).
- **Landing** — picking this workspace in the switcher (ADR-0033) sets the active-workspace cookie and lands here; `switchWorkspaceAction` redirect target flips from `/studies` to `/dashboard` when this ships. Workspace-mode `/` also redirects here (was `/studies`).

## Edge cases

- **Brand-new workspace** — everything empty; copy guides to "+ New study".
- **Large workspace** — each list caps at N with "view all" into the relevant destination.
- **Viewer role** — sees the read widgets; no Settings link; no storage-cost.
- **A widget's underlying feature absent** (e.g. no OSF connection) — that widget shows its own "not connected" empty state, not an error.

## Accessibility notes

- Each widget is a labelled `<section>` with a heading (landmark nav).
- KPI strips pair numbers with text labels; status tones not color-only.
- Activity/review lists are real lists with accessible row actions.

## Open questions

- `pending-reviews` resolved/seen flag — confirm the additive field (shared with Home "waiting on you").
- "responses this week Δ vs last week" — confirm the windowing (rolling 7d vs calendar week).
- Whether `recently-edited` reuses `studies.list` (new sort) or a dedicated aggregate — decide in N2.1 to avoid overfetching.
