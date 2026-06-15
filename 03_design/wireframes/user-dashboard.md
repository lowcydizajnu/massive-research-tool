# Wireframe spec — User dashboard (personal Home)

- **Serves user flow:** [Navigate Home and switch workspaces](../../02_product/user-flows/navigate-home-and-workspaces.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Multi-site coordinator](../../02_product/personas/multi-site-coordinator.md)
- **Status:** draft

## Purpose

`/home` (personal mode) — one place to see what needs the researcher's attention **across all their workspaces**, and to jump into the right workspace or item. Read-heavy landing; built almost entirely on data that already exists (`followsRouter`, `notificationsRouter`, `member`/`workspace`/`experiment`/`response`).

## Layout

Personal-mode chrome (slim top bar, no LeftRail — see [personal-mode-topbar](personal-mode-topbar.md)). Below it, a single parchment column of **widget cards** (modular floating cards, matching the home/landing treatment). Default order ships as a fixed layout; per-user reorder/add/remove arrives via dashboard customization (ADR-0036, Stream F) — this spec defines the widgets + the default order, not the customize chrome. Above-the-fold first, scroll for the rest. Responsive: multi-column on wide, single-column stack on mobile.

## Content inventory

Widgets (default order — the registry keys in ADR-0036):

- **Welcome** (`welcome`) — time-of-day greeting + one-line context ("3 studies in flight · 2 reviews waiting · last activity 2h ago"). Computed.
- **Workspaces** (`workspaces-card`) — every membership: name + role + study count + last-activity + "Switch to". Active workspace highlighted; sort last-activity-desc; "+ Create workspace" at the foot. Source: `me.workspaces()` (new) / `workspace.list()`.
- **Waiting on you** (`mentions-inbox`) — cross-workspace review requests + @-mentions that need ACTION (distinct from generic notifications). Source: `me.waitingOnYou()` (new; aggregates `activity_event` review_request + mention rows across the user's memberships). TopBar counter mirrors this.
- **Your recruiting studies** (`recruiting-studies`) — currently-recruiting studies the user authored, any workspace: study + workspace + n/target + days left. Source: cross-workspace slice of the Running data (`me.recentStudies`/running overview).
- **Your drafts** (`recent-drafts`) — top N recently-edited drafts the user authored, any workspace; card → that study in its workspace. Source: `me.recentStudies({ kind: 'draft' })` (new).
- **Activity · follows** (`follows-feed`) — reuse the Activity destination's `ActivityFeed` scoped to the user (`followsRouter.feed`, shipped).
- **Notifications** (`notifications`) — `notificationsRouter.list` (shipped) + mark-read.
- **Upcoming deadlines** (`upcoming-deadlines`) — recruitment-window closes ≤14d + OSF approval reminders. Computed.
- **OSF activity** (`osf-activity`) — cross-workspace pending approvals / recent DOIs / push errors (ADR-0005).
- **Your stats** (`your-stats`) — KPI strip: studies authored / replications received / followers / total participants. Source: `me.stats()` (new; ~1 aggregate).
- **Quick actions** (`quick-actions`) — "+ New study in [workspace ▾]" + "Open recent".

## States

- **Default** — greeting + populated widgets.
- **Loading** — each widget renders its own skeleton; the page shell + greeting paint immediately (RSC streams widget data).
- **Empty (per widget)** — friendly empty copy + a CTA (e.g. Notifications: "You're all caught up." Drafts: "No drafts yet — + New study.").
- **Partial** — a widget that errors shows its OWN inline error + retry; siblings render normally (no full-page failure). This isolation is a hard requirement.
- **Error (page-level)** — only if `me`/auth itself fails → redirect to `/signup` (existing guard) or a single retry.

## Interactions

- **Switch to (Workspaces card)** — `workspace.switch` then navigate to that workspace's `/dashboard`.
- **A "waiting on you" / notification / study row** — navigates to that item in its workspace (switching the active workspace as a side effect).
- **Quick action "+ New study in {workspace}"** — workspace picker → existing new-study flow scoped to the chosen workspace.
- **Mark notification read** — existing `notifications.markRead`.

## Edge cases

- **Single-workspace user** — Workspaces card shows one row; the dashboard still renders (thin but coherent). (Flow Open question: maybe skip Home for them later.)
- **Many workspaces / many items** — each list caps at a sensible N with "view all" into the relevant destination; counts shown (0/1/10/1000 all legible).
- **Long names** (workspace, study) — truncate with title.
- **Permissions** — a widget only shows data the user may see; `osf-activity` aggregates only their workspaces.

## Accessibility notes

- Each widget is a labelled `<section>` with a heading (landmark navigation across the dashboard).
- KPI/stat strips pair numbers with text labels; status tones are not color-only.
- Live regions only where content updates without navigation (e.g. mark-read); otherwise static.

## Open questions

- Exact widget set in the *shipped* default vs. available-but-off (ADR-0036 registry's `defaultInLayout`). This spec lists the proposed default; trim during build if any widget's data isn't ready.
- "Waiting on you" needs a resolved/seen flag on review-request events to avoid showing addressed items — confirm the small additive field with the data-model pass (also flagged in N2 pending-reviews).
