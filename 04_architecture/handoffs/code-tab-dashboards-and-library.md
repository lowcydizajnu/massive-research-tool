# Code tab handoff — User dashboard + Workspace dashboard + Library (updated 2026-06-15 round 3)

> **V1.13.0 = Dashboards + Library shell.** Owner picked this scope + added dashboard customization on 2026-06-15. Three new dashboard layers + Library destination + IA v0.5 amendments + per-user dashboard customization (drag-reorder, add/remove widgets, workspace-default-settable-by-admin). Estimated ~6 weeks Code-tab time.

Owner asked for these three destinations together. They're independent surfaces with shared characteristics: all three are **read-heavy landing experiences** built on top of data that already mostly exists. Today's state:

| Surface | Route exists? | LeftRail link? | Backing data |
|---|---|---|---|
| **User dashboard** (cross-workspace personal) | ❌ no | ❌ not in nav | ✅ profileRouter + followsRouter + notificationsRouter all live |
| **Workspace dashboard** (workspace overview) | ❌ no (Studies IS the landing per IA v0.4) | n/a | ⚠️ workspace + studies + activity data live; no aggregate procedures yet |
| **Library** | ❌ no (404) | ✅ in nav but inert | ⚠️ Modules data live (moduleTable + moduleVersion); Themes / Materials / Templates / Imports need new schemas (most arriving via V1.12) |

This handoff covers all three. **Recommended versioning** at the bottom — could be V1.12 Section N (extending the polish bundle) OR V1.13.0 (new release) OR a parallel track. Owner picks.

**Total estimate: ~4 weeks Code-tab time** if all three ship together, less if sub-sections defer (e.g., Library · Themes can't ship until V1.12 Section F lands; Library · Materials needs V1.12 Section C1 R2 work first).

---

## The three-level dashboard model (owner-clarified 2026-06-15)

Owner introduced a clean conceptual model worth stating upfront, because it shapes everything below:

**Three dashboards exist; each serves a different question:**

| Dashboard | Question it answers | Entered via | Route |
|---|---|---|---|
| **User dashboard** | "What's happening across ALL my workspaces?" | Top-nav workspace dropdown → pick **"Home"** (new option above the workspace list) | `/home` (Personal mode chrome) |
| **Workspace dashboard** | "What's happening in THIS workspace?" | Top-nav workspace dropdown → pick a workspace | `/dashboard` (Workspace mode; becomes the default landing on workspace switch) |
| **Studies · Running tab** | "How are my currently-recruiting studies doing right now?" | Studies destination → new "Running" sub-tab alongside the existing All/Mine/Drafts/etc. | `/studies?tab=running` (workspace mode; operational view) |

**Critical clarification: Studies destination stays as-is.** Owner's "studies are as they are actually" means the existing Studies list + sub-nav filters (All / Mine / Drafts / Preregistered / Published / Replicating / Archived) all stay. The Workspace dashboard is a SIBLING destination, not a replacement. The Running tab is a NEW sub-tab inside the existing Studies destination.

**Workspace switcher gets the "Home" affordance:**

```
┌─ Workspace selector dropdown ────┐
│  ▸ Home — All my workspaces      │ ← NEW: enters Personal mode
│  ─────────────────────────────── │
│  ★ Misinformation Lab (current)  │ ← workspaces
│    Design Team                   │
│    Personal                      │
│  ─────────────────────────────── │
│  + Create workspace              │
└──────────────────────────────────┘
```

Picking "Home" switches to Personal mode (the new third chrome variant per ADR-0033 IA v0.5). Picking a workspace switches to Workspace mode + lands you on `/dashboard` (the workspace dashboard).

## Section N1 — User dashboard (cross-workspace personal landing)

**Route:** `/home` under a new `(personal)` route group. Single page, no sub-nav. Entered via "Home" in the workspace switcher dropdown. `/` → `/home` for authenticated users with workspace memberships (was `/` → `/studies`).

### What it shows

A personal dashboard that summarizes the user's activity ACROSS all workspaces they belong to. Researchers who work in multiple labs / consortia / personal-vs-collaborator workspaces want one place to see what's pending without switching contexts.

**Widget layout (above-the-fold first; below as scroll):**

1. **Welcome block** — "Good morning, {firstName}." + a one-line context ("3 studies in flight; 2 review requests pending; last activity 2 hours ago"). Time-of-day-aware greeting.
2. **Workspaces card** — list of every workspace the user belongs to with: workspace name + role + their study count + their last activity timestamp + a "Switch to" link. Sortable; default by last-activity-desc. The current active workspace is highlighted. Quick-create-workspace at the bottom.
3. **Mentions & review requests waiting on me** — cross-workspace inbox of "Maya needs your review on Study X", "Hanna mentioned you in Study Y comment". Distinct from generic notifications; these need ACTION from the user. Counter badge in TopBar mirrors this.
4. **Activity · My follows** — feed from `followsRouter.feed` (already shipped). Cross-workspace; shows the items the researcher follows (tags, authors, frameworks, studies) doing things. Reuses the Activity destination's `ActivityFeed` component scoped to the user.
5. **Notifications inbox** — `notificationsRouter.list` already shipped. Mention notifications, comment-on-your-study, fork notifications, OSF-push-complete events. Mark-read affordance. Empty state.
6. **Your recruiting studies — across workspaces** — currently-running studies the user authored, regardless of workspace. Per row: study + workspace + n_responses / target_n + days remaining. Owner-noted: "running studies" is the operational view that matters most. Reuses the new Running-tab procedure (`studies.runningOverview()`).
7. **Your drafts — across workspaces** — top N studies the user authored with unsaved-or-recent changes, across all workspaces. Cards link to that study in its workspace (auto-switches workspace context). New tRPC procedure: `me.recentStudies({ limit, kind: 'draft' })`.
8. **Upcoming deadlines** — recruitment-window close dates within 14 days; preregistration approval reminders (OSF pending); review-request deadlines if any. Calendar-style mini-timeline. Helps researchers prioritize.
9. **OSF activity** — across all workspaces: pending owner-approval registrations + recent DOIs minted + any push errors. Pairs with V1.5's OSF integration (ADR-0005).
10. **Your stats** — small KPI strip: studies authored / replications received / followers count / total participants across all your studies. Sourced from existing tables; ~1 lightweight aggregate query.
11. **Saved searches / followed tags activity** — recent studies in this user's followed-tag set (cross-workspace public + private-with-membership). Pairs with V1.7 tags + follows.
12. **Quick actions** — "+ New study in [workspace dropdown]" + "Import a paper" (V2.0 Sandbox link when shipped) + "Open a recent study" (recents list).

### Data layer

Mostly already shipped. New items:

| Need | What exists | Gap |
|---|---|---|
| Workspaces card | `member` table + `workspace` table | New tRPC `me.workspaces()` listing memberships with role + computed lastActivity + studyCount |
| Activity feed | `followsRouter.feed` | ✅ already shipped |
| Notifications | `notificationsRouter.list` + `.unreadCount` | ✅ already shipped |
| Recent drafts | `experiment` + `experimentVersion` | New tRPC `me.recentStudies({ limit })` joining over user's memberships |
| Your stats | `experiment` + `response` + `follow` (already-shipped tables) | New tRPC `me.stats()` returning the 4 counts |

Three new tRPC procedures + a new top-level `meRouter` (or extend `profileRouter`). None require schema changes; all are reads over existing tables.

### IA — workspace-mode question

**Subtle but important:** User dashboard is INHERENTLY cross-workspace. Today the chrome (TopBar + LeftRail) is workspace-scoped (workspace name + the workspace's destinations).

Two paths:

- **(a) `/home` stays in workspace mode chrome.** The user sees the LeftRail with the current workspace's destinations + the User dashboard renders cross-workspace content in the main area. Mildly confusing (the LeftRail says "Studies / Library / Frameworks" of workspace X but the dashboard shows data from workspaces X + Y + Z).
- **(b) `/home` gets a third chrome mode — "personal mode."** No workspace context in the chrome. TopBar shows the user's avatar + name; LeftRail collapses or hides. The Workspaces card on the dashboard becomes the way to enter a workspace. Cleaner mental model but adds a third chrome variant (V1.12 already shipped workspace + focused-study modes per ADR-0032).

**Recommendation: (b) personal mode.** It's a small additional layout component (~3 days) and the conceptual clarity is worth it. Adds Personal as a third route group: `app/(app)/(personal)/`.

ADR-0033 — IA v0.5: Personal mode. Extends ADR-0032's two-mode model (Workspace + Focused study) to three: Workspace + Focused study + Personal. URL-driven switch: `/home`, `/me`, `/notifications` use personal mode; everything under `/studies/[id]/*` uses focused study mode; the rest use workspace mode.

### UI

- `app/(app)/(personal)/layout.tsx` — slim TopBar (avatar + name + workspace switcher + ⌘K + user menu); NO LeftRail
- `app/(app)/(personal)/home/page.tsx` — RSC fetching the 5 widgets server-side via the new `meRouter` procedures
- `components/feature/dashboard/personal/` — one component per widget (WorkspacesCard / RecentStudiesCard / StatsStrip / NotificationsCard / FollowsFeedCard)
- Mobile responsive (single column stack)

### Wireframe gate

`03_design/wireframes/user-dashboard.md` — Code tab writes before UI work.

### Estimated work

~1.5 weeks (data layer ~3 days; personal-mode chrome ~3 days; widget composition + RSC + tests ~4 days; wireframe + ADR ~2 days).

---

## Section N2 — Workspace dashboard (team-shared workspace overview)

**Route:** new route `/dashboard` under `(workspace)`. Becomes the **default landing** when a user picks a workspace from the top-nav switcher. Studies destination **stays unchanged** as a sibling destination — owner-confirmed 2026-06-15: "studies are as they are actually."

### IA changes (owner-confirmed)

- Picking a workspace from the top-nav dropdown lands you on `/dashboard` (not `/studies`).
- Studies destination remains in the LeftRail with its existing sub-nav (All / Mine / Drafts / Preregistered / Published / Replicating / Archived) + NEW Running tab (see Section N4 below).
- The workspace dashboard is read-mostly + team-shared; Studies is the canonical operational list.
- Workspace-mode `/` redirects to `/dashboard` (was `/studies`).

### What it shows

A dense overview of the workspace's recent state. Designed for "I just opened the tool — what's going on here?"

**Widget layout:**

1. **Workspace header** — workspace name + member count + study count + small "Settings" link for owners/admins + workspace switcher hint.
2. **Workspace announcement** (owner/admin can pin a note) — "Lab meeting Tuesday 3pm" / "Recruitment paused on Study X this week" / "New ethics requirements". Single pinned post; markdown; small avatar of pinner + timestamp. Optional + dismissible by individual viewers.
3. **At-a-glance stats** — KPI strip:
   - Total studies (by stage: draft / preregistered / published / archived)
   - Active recruitment count
   - Total responses this week + delta vs last week
   - Pending review requests
   - Open mentions across workspace
4. **Active recruitment** — currently-recruiting studies in this workspace + per-study: response count vs target / collection rate (responses per day, last 7d) / projected finish date / status badge (healthy / stalled / imbalanced). Click → jumps to study's Run stage. Helps spot stalled recruitment fast.
5. **Recent activity** — workspace-scoped activity feed (last ~15 events): comments, mentions, OSF pushes, recruitment opens, new versions saved. Sourced from `activity_event` table filtered to `workspace_id` (distinct from the user-scoped Activity destination via follows).
6. **Pending reviews** — studies in this workspace with open `review_request` events not yet resolved. Lists requestor + requestee + study + age + age-warning badge if >7d. Click to jump to Share stage.
7. **Recently edited studies** — top 5-8 studies updated in the last 7 days + editor's name + brief diff summary ("3 blocks added"). Reuses existing study cards.
8. **OSF status** — workspace's pending OSF registrations (awaiting owner approval at osf.io) + recent DOIs minted + push errors. Pairs with V1.5's OSF integration.
9. **Recent fork activity** — studies in this workspace that have been replicated FROM (downstream forks landed in last 30d). Good for owner-visibility into impact + replication interest.
10. **Top tags** — most-used tags in this workspace (last 30 days). Click to filter Studies list.
11. **Team activity** — members ranked by recent contribution count (comments + edits + reviews); humanizes the workspace.
12. **Storage + cost** (owners only — owner confirmed 2026-06-15) — R2 storage used / quota; Inngest invocations / quota; AI invocation count + spend month-over-month (per ADR-0006 + V2.0 when AI features exist); cost burn-rate forecast. Owners-only view; respects role.

### Data layer

| Widget | What exists | New tRPC |
|---|---|---|
| At-a-glance stats | `experiment` + `response` + `recruitment_session` tables | `workspace.dashboardStats()` returning the counts |
| Recent activity | `activity_event` table (live from V1.7) | `workspace.recentActivity({ limit })` workspace-scoped feed |
| Pending reviews | `activity_event` where `event_type = 'review_request'` + a "resolved" flag (small additive field) | `workspace.pendingReviews()` |
| Recently edited studies | `experiment.updatedAt` + `experimentVersion.updatedAt` | Probably extend existing `studies.list` with a new `sort: 'recent-7d'` mode |
| Top tags | `tag` + `experiment_tag` (live from V1.7 ADR-0017) | `workspace.topTags({ window: '30d' })` |
| Team activity | `member` + activity_event aggregates | `workspace.teamActivity()` |
| Storage + cost | not currently tracked per workspace | Defer — wire when ADR-0003 storage metering arrives; show "Coming soon" placeholder for V1.12 |

One new tRPC namespace: `workspace.dashboard.*` (or just add procedures to the existing `workspaceRouter`). All workspace-scoped; respect role for the storage widget.

### UI

- `app/(app)/(workspace)/dashboard/page.tsx` — RSC fetching widget data in parallel
- `components/feature/dashboard/workspace/` — per-widget components
- Each widget renders independently; failures don't cascade (a 500 on one widget shows a per-widget error state)

### IA v0.5 changes

If replacing /studies as the landing:

- Update root redirect: authenticated users → `/dashboard` (was `/studies`)
- Update onboarding-complete redirect: → `/dashboard`
- Update Studies destination icon order (Dashboard first, Studies second)
- The TopBar's workspace name in focused study mode still links back to workspace mode — should it land on `/dashboard` or `/studies`? Recommendation: `/dashboard` (consistent with the new landing).

ADR-0033 (or ADR-0034 if Personal mode took 0033) — IA v0.5: workspace dashboard as landing.

### Wireframe gate

`03_design/wireframes/workspace-dashboard.md`.

### Estimated work

~1.5 weeks (data layer ~4 days; widgets ~4 days; IA v0.5 + ADR + wireframe ~2 days).

---

## Section N5 — Dashboard customization (owner-added 2026-06-15)

Owner: "User should be able customise dashboard (drag and drop items — reordering, add new widgets, remove old)."

Both **User dashboard** (Section N1) and **Workspace dashboard** (Section N2) are customizable. Studies · Running tab (Section N4) is operational — researcher can hide/show columns but the layout is fixed (live data table doesn't benefit from drag-reorder).

### Customization model

Each dashboard has:

1. **A default widget set + order** (defined by us in the widget registry). New users see this on first visit.
2. **Per-user override** stored in a new `dashboard_layout` table. When a user customizes, their layout replaces the default for them only.
3. **Workspace default override** (admin-set; optional) — workspace admins can set a "house default" for the Workspace dashboard. New researchers in that workspace see the admin's default, not ours; they can still customize on top per-user.

### Customize affordance

Each dashboard has a **"Customize"** button in the top-right next to a "Reset to defaults" link.

- **View mode** (default): widgets render normally; drag handles hidden; no remove buttons.
- **Edit mode** (after clicking Customize): every widget shows a drag handle (grip icon top-left) + an ✕ remove button (top-right). A floating "+ Add widget" bar appears at the bottom showing all available widgets the user hasn't yet added; click → adds to the end of the layout.
- **Save** / **Cancel** in the top bar of edit mode; auto-save on drag-end + remove + add (with a "Reset" undo for the session).

### Implementation

**Drag-reorder library:** reuse `@dnd-kit/core` + `@dnd-kit/sortable` already in the repo from ADR-0022 (block reorder). Same `SortableList` primitive Code tab already built for block reorder. Zero new vendor.

**Data model — new table:**

```sql
CREATE TABLE dashboard_layout (
  id text PRIMARY KEY,                              -- ULID
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  dashboard_kind text NOT NULL,                     -- 'user' | 'workspace'
  workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE,
                                                    -- null for dashboard_kind='user'
  widgets jsonb NOT NULL,                           -- ordered [{ widget_key, settings? }]
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dashboard_kind, workspace_id)
);

-- Workspace-level default (admin-set; optional)
CREATE TABLE workspace_dashboard_default (
  workspace_id uuid PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL,
  set_by_user_id uuid NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Additive migration; nothing existing changes.

**Widget registry:**

```ts
// lib/dashboard/widget-registry.ts
export type WidgetKey = 'welcome' | 'workspaces-card' | 'mentions-inbox'
  | 'follows-feed' | 'notifications' | 'recruiting-studies'
  | 'recent-drafts' | 'upcoming-deadlines' | 'osf-activity'
  | 'your-stats' | 'saved-searches' | 'quick-actions'
  // workspace dashboard widgets
  | 'workspace-header' | 'workspace-announcement' | 'at-a-glance-stats'
  | 'active-recruitment' | 'workspace-activity' | 'pending-reviews'
  | 'recently-edited' | 'workspace-osf-status' | 'recent-forks'
  | 'top-tags' | 'team-activity' | 'storage-cost';

export interface WidgetDef {
  key: WidgetKey;
  name: string;
  description: string;
  category: 'activity' | 'studies' | 'team' | 'osf' | 'admin' | 'personal';
  size: 'small' | 'medium' | 'large' | 'full';
  dashboard: 'user' | 'workspace' | 'both';
  ownerOnly?: boolean;           // 'storage-cost' = owners only
  defaultInLayout?: boolean;     // ships in default layout
  settings?: { /* per-widget config schema */ };
  Component: React.ComponentType<WidgetProps>;
  loader: (ctx) => Promise<WidgetData>;
}

export const USER_DASHBOARD_DEFAULT_LAYOUT: WidgetKey[] = [
  'welcome', 'workspaces-card', 'mentions-inbox',
  'follows-feed', 'notifications', 'recruiting-studies',
  'recent-drafts', 'upcoming-deadlines', 'osf-activity',
  'your-stats', 'saved-searches', 'quick-actions',
];

export const WORKSPACE_DASHBOARD_DEFAULT_LAYOUT: WidgetKey[] = [
  'workspace-header', 'workspace-announcement', 'at-a-glance-stats',
  'active-recruitment', 'workspace-activity', 'pending-reviews',
  'recently-edited', 'workspace-osf-status', 'recent-forks',
  'top-tags', 'team-activity', 'storage-cost',
];
```

**Layout resolution (server-side at page load):**

1. Look up `dashboard_layout` for `(user_id, dashboard_kind, workspace_id)`.
2. If exists: use that.
3. If not: for workspace dashboard, look up `workspace_dashboard_default`. If exists, use that; otherwise use the workspace default `WORKSPACE_DASHBOARD_DEFAULT_LAYOUT`.
4. For user dashboard, use `USER_DASHBOARD_DEFAULT_LAYOUT`.
5. Filter the resolved list against the widget registry — remove any keys that no longer exist (forward-compat for widget removal) + skip `ownerOnly` widgets the viewer isn't authorized for.

**Per-widget settings (optional, V1.13.0):**

A few widgets support inline settings via a small gear icon when in edit mode:

- `follows-feed` — "Show N items" (5 / 10 / 20)
- `recent-drafts` — "Show N items" (3 / 5 / 10)
- `workspace-activity` — "Show N items" + "Filter by event type"
- `active-recruitment` — "Sort by: response count / completion rate / projected finish"
- `top-tags` — "Window: 30d / 90d / all time"

Settings stored in the `widgets` jsonb per-entry: `[{ widget_key, settings: { itemCount: 10 } }]`. Other widgets have no settings (just key).

**tRPC procedures:**

- `dashboard.getLayout({ kind: 'user' | 'workspace', workspaceId? })` — resolves the layout per the rules above
- `dashboard.saveLayout({ kind, workspaceId?, widgets })` — writes user override
- `dashboard.resetLayout({ kind, workspaceId? })` — deletes user override; falls back to default
- `workspace.setDashboardDefault({ widgets })` — admin-only; writes `workspace_dashboard_default`

**UX micro-details:**

- Drag during edit mode shows a placeholder shadow at the target drop location (dnd-kit's default behavior).
- Removing a widget animates out; restoring it (Add widget palette) animates in.
- Add widget palette is a horizontal scroll bar at the bottom in edit mode; each available widget shows a small preview thumbnail + name + category badge.
- "Reset to defaults" prompts a confirmation modal — "This will replace your current layout with the workspace default. Continue?"
- Keyboard accessibility: drag handles are focusable; arrow keys reorder; Delete removes; Enter on palette item adds.

### ADR-0036 — Dashboard customization

Covers: dashboard_layout + workspace_dashboard_default tables; widget registry shape + contracts; per-widget settings schema; layout-resolution algorithm; admin-default precedence rules; reset semantics; ownerOnly filtering.

### Wireframe gate

`03_design/wireframes/dashboard-customize-mode.md`.

### Estimated work

~1 week (data layer + 2 migrations ~2 days; widget registry refactor + layout resolver ~2 days; edit-mode UI + drag/drop + add palette ~2 days; per-widget settings + wireframe + tests ~1 day).

Applies to both User dashboard and Workspace dashboard. Studies · Running tab (Section N4) stays fixed-layout for V1.13.0 (operational view; revisit if researchers ask for it).

---

## Section N4 — Studies · Running tab (operational dashboard inside Studies; owner-added 2026-06-15)

Owner: "Running studies should also have dedicated dashboard tab in studies view too." Third dashboard layer — operational, real-time, focused on currently-collecting studies.

**Where it lives:** Studies destination gains a new sub-tab **"Running"** alongside the existing All / Mine / Drafts / Preregistered / Published / Replicating / Archived. Route: `/studies?tab=running`.

**Why a tab, not a destination:** running-studies management is fundamentally a slice of Studies (a filter view + extra widgets). Keeps the IA flat. Researchers already think of recruitment as part of "Studies."

### What it shows

Operational view — not strategic. Answers "is my data collection going well right now?" + "do any studies need my attention?"

**Layout:**

1. **Recruitment overview KPI strip:** total recruiting studies / total responses today / total responses this week / studies needing attention (alerts triggered).
2. **Recruitment table** — one row per recruiting study with these columns:
   - Study title + condition count
   - n_responses / target_n + percentage bar
   - Collection rate (responses/day, last 7d) + trend arrow
   - Average completion time
   - Drop-off rate (% who start but don't complete)
   - Condition balance (smallest condition n / largest condition n, ratio) — flags imbalanced random assignment
   - Last response timestamp + "no responses in 24h" warning if stalled
   - Status badges: healthy / stalled (no responses 24h) / imbalanced (>20% condition skew) / target_reached / target_overrun
   - Quick action: Pause / Resume / Close recruitment / View live responses
3. **Per-study drill-down (modal or right panel)** — click a row to see:
   - Per-block drop-off chart (which question loses participants?)
   - Per-condition response distribution
   - Attention-check failure rate
   - Estimated time to target_n at current rate
   - Recent participant identifiers (anonymized) + completion timestamps
4. **Alert center** — list of all alert states needing attention across recruiting studies. Examples:
   - "Study X: no responses in 24 hours"
   - "Study Y: condition imbalance — control n=87, treatment n=34"
   - "Study Z: attention-check failure rate 22% (warning threshold 15%)"
   - "Study W: target_n reached — consider closing recruitment"
   - Each alert has Mute / Snooze / Address actions.

### Data layer

| Widget | What exists | New tRPC |
|---|---|---|
| KPI strip | counts from `recruitment_session` + `response` tables | `studies.runningOverview()` returning the 4 KPIs |
| Recruitment table | `recruitment_session` (V1.5) + `response` + `condition` | `studies.runningList()` returning per-row data (1 row per recruiting study with computed metrics) |
| Per-study drill-down | `response_item` + `response` already exist | `studies.runningDetail({ studyId })` returning per-block + per-condition aggregates |
| Alert center | derived from recruitmentList computed states | included in `runningList` response; client filters to alert-state rows |

All workspace-scoped (`workspaceProcedure`). One namespace under existing `studiesRouter`.

### Refresh strategy

- **Polling default** — every 60 seconds while the tab is visible. Cheap (single aggregate query); deterministic; no infrastructure.
- **Optional later** — SSE (Server-Sent Events) push when a new response lands. Defer; polling is fine for V1.13.0.
- **Visible-only** — pause polling when tab is in background per the Page Visibility API.

### Wireframe gate

`03_design/wireframes/studies-running-tab.md`.

### Estimated work

~1 week (data layer ~3 days; table + drill-down + alerts ~3 days; wireframe + tests ~1 day).

---

## Section N3 — Library destination (5 sub-sections)

**Route:** new top-level `/library` under `(workspace)`. Sub-nav as planned in IA v0.3: Modules / Themes / Materials / Templates / Imports.

### What's already there + what's blocking each sub-section

| Sub-section | Data exists today | Blocks on |
|---|---|---|
| Library · Modules | ✅ `moduleTable` + `moduleVersion` + `modules.list` router | Nothing — can ship immediately |
| Library · Themes | ❌ no themes table | V1.12 Section F (per-study theming creates themes; saved-themes feature builds on it) |
| Library · Materials | ❌ no asset table | V1.12 Section C1 (R2 + image/video/audio blocks) |
| Library · Templates | ⚠️ `experimentVersionKind` enum has 4 kinds; doesn't include `template` | Extend enum + add template-specific endpoints (lightweight) |
| Library · Imports | ❌ no imports table | V2.0 Sandbox (paste-back parser writes here) |

So Library can ship in waves as dependencies land:

- **Wave A — Modules + Templates (~1 week):** ship Library shell + Modules read-view + Templates (with experimentVersionKind enum extension). Ready independently.
- **Wave B — Materials (~3 days):** ships after V1.12 Section C1's R2 + asset upload code lands. Read view over assets table; researcher can preview their uploads + see which studies reference them; bulk-delete unused.
- **Wave C — Themes (~3 days):** ships after V1.12 Section F's theme storage. Read view over saved themes; researcher previews + reuses across studies.
- **Wave D — Imports (~3 days):** ships after V2.0 Sandbox builds its paste-back parser. Imports table records every paste-back-and-applied event; researcher reviews + re-applies.

### Sub-section detail

#### Library · Modules (~3 days, can ship immediately)

Read view over the module catalogue.

- Sub-nav: Modules / Themes / Materials / Templates / Imports → Modules selected
- Card grid: each module shown as a card with name + key + version + responseSchema preview + "Used in N studies" + Documentation link
- Filter: by category (likert / multiple-choice / stimulus / etc.) + by source (core / workspace / community when those exist) + search
- Click card → right-panel Details: full schema preview + "Insert into open study" if a study is selected elsewhere
- Data: `modules.list` already returns this; just need the destination page

#### Library · Templates (~4 days)

Templates = pre-made study skeletons. Different from Frameworks (which carry methodological conventions); templates are "starting points."

- Data model change: extend `experimentVersionKind` enum to add `template`. Per ADR-0002 + ADR-0012 immutability: a `template` kind version is immutable (you can't edit the template; you fork it into a new study with kind:autosave).
- New tRPC: `studies.listTemplates({ scope: 'workspace' | 'public' })` — returns templates the researcher can see (their workspace + public templates from any workspace).
- New tRPC: `studies.saveAsTemplate({ studyId, name, description, includes })` — creates a frozen kind:template version of an existing study. The `includes` parameter is the **owner-confirmed checkbox set** (2026-06-15) — researcher picks what to copy into the template:

  **Save-as-template dialog includes checkboxes for:**
  - ☑ Blocks + block configs (always on; can't be unchecked — the structural skeleton is the template)
  - ☑ Conditions + branching rules
  - ☐ Theme + layout (per-study visual identity per V1.12 §F)
  - ☐ Overview narrative (per V1.12 §B1)
  - ☐ Recruitment settings (target_n, sample_size_helper, etc.) — recruitment-runs aren't copied; just the intended config
  - ☐ Consent screen text + debrief copy (per V1.12 §G researcher-controlled copy)
  - ☐ Tags (per V1.7 ADR-0017)
  - ☐ OSF configuration (registry connections aren't copied; just the schema choice if preregistered)

  Owner-confirmed: defaults to blocks + conditions on; everything else off. Researcher checks what they want to include.

- Per IA v0.3 picks: 4 share scopes (Public-replicable / Workspace / Invite link / Submit to Framework).
- UI: card grid of templates with title + author + description + "Used N times" + "Includes: blocks, conditions, theme" subtitle showing what's bundled + Fork-to-new-study button.
- Fork-from-template flow: when researcher forks a template, every included element copies to the new draft; un-included elements get defaults from the workspace (e.g., default theme if no theme was bundled).
- Pairs with the V1.12 Section L question-group work — researcher can save a group as a template too (template-of-group; smaller scope than template-of-study). Defer template-of-group to a sub-PR if needed.

#### Library · Materials (~3 days, blocks on V1.12 Section C1)

Read view over `asset` table (created by V1.12 Section C1 R2 work).

- Card grid with thumbnail / preview / mp3 player / etc. per asset
- Filter: by type (image / video / audio / link) + by referenced-in (which studies use this asset) + by upload-date
- Actions: rename / move to folder / bulk-delete unused / download original
- Storage usage card at the top: total bytes used / R2 free-tier remaining
- ADR-0003 amendment may surface — auto-freeze semantics, content-hash dedup

#### Library · Themes (~3 days, blocks on V1.12 Section F)

Read view over saved themes (created by V1.12 Section F theme editor).

- Card grid: each saved theme rendered as a small visual preview using its tokens
- Action: "Apply to a study" → opens a picker; selecting a study applies the theme to its `experiment_version.theme` and bumps the autosave tip
- Distinction: workspace-saved themes (rebuilt from researcher edits) vs system platform presets (the 17 from V1.12 F1.5 — Academic / FB / X / etc.)
- The Themes sub-section is also where researchers download a theme as a JSON file or import one from another workspace (cross-workspace sharing)

#### Library · Imports (~5 days, ships now per owner 2026-06-15 — does NOT wait for V2.0 Sandbox)

Owner-confirmed 2026-06-15: ship Imports as a general-purpose "imported content" destination NOW; V2.0 Sandbox extends it later as one more source.

Read view + write surface over a new `imported_content` table (Drizzle migration):

```
imported_content
  id (text PK, ULID)
  workspace_id (FK, workspace-scoped)
  user_id (FK, who imported)
  source_kind (enum: 'paper-pdf', 'paper-doi', 'osf-registration',
                'csv', 'manual-paste', 'sandbox-ai' /* future */)
  source_url (text, nullable)
  source_label (text — researcher's free-text "what is this")
  payload (jsonb — the raw imported content)
  parsed (jsonb, nullable — structured extraction if parsing succeeded)
  applied_to_study_id (FK to experiment, nullable — set when import was used)
  created_at, updated_at
```

**V1.13.0 launch sources (no AI needed):**

- **Paper DOI** — researcher pastes a DOI; Crossref/OpenAlex API resolves to metadata (title, authors, abstract); stored as imported_content with `source_kind='paper-doi'`. Useful as "I want to remember which papers informed this study." Click an import → see its abstract + "Cite as background in Overview tab" button.
- **OSF Registration URL** — researcher pastes an OSF registration URL; the public OSF API returns the registration's structure; stored as imported_content with `source_kind='osf-registration'`. Useful for replication: "import the structure of this registration as a starting point for my replication."
- **Manual paste** — researcher pastes any text (a hypothesis, a method paragraph, a question wording) + labels it; stored as `source_kind='manual-paste'`. The simplest "I want to remember this for later" affordance.
- **CSV import** — researcher uploads a CSV of, e.g., stimuli (rows = trials, columns = stimulus + condition). Becomes a stimulus set referenceable from the Builder. Useful for migrating from other tools.
- **PDF import** (lightweight) — researcher uploads a paper PDF; we store + index with `source_kind='paper-pdf'`; no AI extraction at V1.13.0, just storage + "open PDF" link. V2.0 Sandbox can later run BYOAI extraction over the same PDF.

**Future sources V2.0 adds:**

- **Sandbox-AI** — V2.0 BYOAI paste-back results land here with `source_kind='sandbox-ai'`. Extends Imports with structured extraction.

**UI:**

- Card grid; each card: source kind icon + label + date + "applied to N studies" + view-detail action
- Filter by source_kind + by applied-or-unused
- Per-import detail: payload preview + parse status + "Apply to study" picker
- Bulk actions: archive + delete + tag

This makes Imports a useful destination even without AI — it's the researcher's "external context library" they can build over time.

### IA changes

- Library destination in the LeftRail moves from "inert (no href)" to a real link with sub-nav
- The Cmd+K palette (V1.12 / IA v0.4) gets Library sub-section search ("Find a template" / "Find a module")

### Wireframe gate

`03_design/wireframes/library-modules.md` + `03_design/wireframes/library-templates.md` + `03_design/wireframes/library-materials.md` + `03_design/wireframes/library-themes.md` + `03_design/wireframes/library-imports.md` — five wireframes, but they all share the same card-grid + sub-nav scaffold so they're cheap once the shell exists.

### Estimated work

~1 week total (Modules + Templates immediately) + ~3 days each as dependencies land for Materials / Themes / Imports = ~2 weeks total when everything ships.

---

## Section N4 — Dependencies + sequencing recommendation

These three surfaces have natural sequencing through V1.12's work:

```
V1.12 Waves 1-5 ship → V1.12 Sections A-K, L, M complete
  ↓
V1.12 Section N1 (User dashboard) — ships alongside any Wave; independent
  ↓
V1.12 Section N2 (Workspace dashboard) — ships alongside any Wave; independent  
  ↓
V1.12 Section N3 Library:
  - Wave A (Modules + Templates) — ships independently
  - Wave B (Materials) — after V1.12 Section C1 lands
  - Wave C (Themes) — after V1.12 Section F lands  
  - Wave D (Imports) — after V2.0 Sandbox lands
```

**Recommendation:** Add these as **V1.12 Section N** (extending the polish bundle) rather than splitting into V1.13. Reason: V1.12 is already the "make-it-functional" release; the three destinations belong with the same narrative. Numbering V1.13 = Participants + Prolific stays clean.

**Alternative if V1.12 feels too big:** split as **V1.13.0 = Dashboards + Library shell** + push Participants to V1.14. Same total work, cleaner per-release stories.

Code tab's choice based on PR queue.

---

## ADRs needed (Code tab drafts as each Stream nears)

- **ADR-0033 — IA v0.5: Three-mode chrome + workspace switcher "Home" + workspace dashboard as workspace landing.** Three-mode chrome model (Personal + Workspace + Focused study); URL-driven mode switch; workspace switcher dropdown gains "Home" option above the workspace list; root redirect goes to `/home` for authed users; picking a workspace lands on `/dashboard`. Bundles N1 + N2 IA changes.
- **ADR-0034 — Templates as `kind: template` + checkbox-based save flow.** Extends `experimentVersionKind` enum; template share scopes (4 per IA v0.3); save-as-template dialog includes 8 element checkboxes for what to bundle; fork-from-template applies bundled elements + defaults un-bundled.
- **ADR-0035 — Imports as a first-class destination.** `imported_content` table; 5 source_kind values for V1.13.0; extensibility for V2.0 sandbox-ai.
- **ADR-0036 — Dashboard customization.** `dashboard_layout` + `workspace_dashboard_default` tables; widget registry shape + per-widget settings schema; layout-resolution precedence (user override → workspace default → system default); ownerOnly filtering; reset semantics. Reuses dnd-kit from ADR-0022. No new vendor.

---

## Wireframes needed (phase-gate per CLAUDE.md)

- `user-dashboard.md` (Stream A)
- `workspace-dashboard.md` (Stream B)
- `studies-running-tab.md` (Stream C — NEW)
- `library-modules.md` (Stream D)
- `library-templates.md` (Stream D — includes the checkbox save-as dialog)
- `library-imports.md` (Stream D)
- `library-materials.md` (Stream E)
- `library-themes.md` (Stream E)
- `personal-mode-topbar.md` (the slim TopBar for personal mode + workspace switcher "Home" option)
- `dashboard-customize-mode.md` (Stream F — edit mode chrome + drag handles + add-widget palette + per-widget settings)

---

## Open questions — fully resolved 2026-06-15

1. ✅ **Workspace dashboard sits ALONGSIDE Studies** — Studies destination stays as-is per owner ("studies are as they are actually"). Workspace dashboard becomes the default landing when picking a workspace from the top-nav switcher. Section N2 updated.
2. ✅ **Three-level dashboard model** — owner introduced the cleanest framing: top-nav workspace dropdown gains a "Home" option that puts you in Personal mode (User dashboard); workspaces land you on their dashboard; Studies destination gains a "Running" sub-tab (Section N4 added). Personal mode is the third chrome variant per ADR-0033 IA v0.5.
3. ✅ **Template save-as-template flow** — checkbox set; researcher picks what to include (blocks always; conditions + theme + overview + recruitment-config + consent-copy + tags + OSF config all opt-in). Section N3 updated.
4. ✅ **Library · Imports ships now** as general-purpose imported-content surface (paper DOI / OSF registration URL / CSV / manual paste / PDF upload). V2.0 Sandbox extends with `source_kind='sandbox-ai'` later. Section N3 updated.
5. ✅ **Storage + cost widget — owners only.** Confirmed.
6. ✅ **Versioning: V1.13.0** = "Dashboards + Library shell" per Cowork pick. V1.14 = Participants + Prolific (was original V1.13).

Total estimate updated: **~5 weeks Code-tab time** (added ~1 week for the new Running tab + a bit for the expanded Imports + theme/overview-now-checkbox templates).

---

## Sequencing PRs (~6 weeks Code-tab time total = V1.13.0)

**Stream A — User dashboard + Personal mode (~1.5 weeks):**
- PR N1.1: `meRouter` with `workspaces` + `recentStudies` + `stats` procedures + mentions/reviews-waiting aggregate (~2 days)
- PR N1.2: personal mode chrome + route group split + ADR-0033 IA v0.5 + workspace switcher "Home" option (~3 days)
- PR N1.3: `/home` page + 12 widgets (registered in the widget registry from Stream F) + wireframe (~3 days)

**Stream B — Workspace dashboard (~1.5 weeks):**
- PR N2.1: `workspace.dashboard.*` aggregate procedures + tests (~3 days)
- PR N2.2: `/dashboard` page + 12 widgets (registered in the widget registry from Stream F) + role-respecting storage widget (owners only) + workspace-announcement editor (~4 days)
- PR N2.3: root redirect + landing change (workspace-mode `/` → `/dashboard`) (~2 days)

**Stream F — Dashboard customization (~1 week, NEW; gated on Streams A + B widget components existing):**
- PR N5.1: `dashboard_layout` + `workspace_dashboard_default` migrations + widget registry refactor + layout resolver + ADR-0036 (~2 days)
- PR N5.2: edit-mode UI + drag/drop via dnd-kit + add-widget palette + remove + per-widget settings (~3 days)
- PR N5.3: workspace-admin "set workspace default" affordance + wireframe + tests (~2 days)

**Stream C — Studies · Running tab (~1 week, NEW):**
- PR N4.1: `studies.runningOverview()` + `studies.runningList()` + `studies.runningDetail()` aggregate procedures (~3 days)
- PR N4.2: Running tab UI in Studies destination + per-study drill-down + alert center + polling refresh (~3 days)
- PR N4.3: wireframe + tests (~1 day)

**Stream D — Library shell + Modules + Templates + Imports (~1.5 weeks):**
- PR N3.1: `/library` route + sub-nav scaffold + ADR-0034 templates `kind: template` enum extension (~2 days)
- PR N3.2: Library · Modules page (read-view over existing modules.list) (~2 days)
- PR N3.3: Library · Templates page + save-as-template dialog with checkbox `includes` + fork-from-template (~3 days)
- PR N3.4: Library · Imports — `imported_content` table + 5 source ingestors (paper-doi via Crossref/OpenAlex / osf-registration via OSF API / manual-paste / csv / paper-pdf) + UI (~3 days)

**Stream E — Library Materials / Themes (~3 days each, gated on V1.12 Sections C1 / F):**
- Land in V1.13.x sub-releases as those V1.12 dependencies ship

Streams A + B + C + D largely independent; Code tab can land in parallel. Stream F (customization) gates on A + B widget components existing in the registry, so lands last in the bundle.

Streams A, B, C are independent — Code tab can land them in any order or in parallel.

---

## Files to read first

1. `04_architecture/handoffs/code-tab-v1120-functional-polish.md` — the bigger V1.12 picture this folds into
2. `03_design/ia/information-architecture.md` v0.4 — the current IA being amended to v0.5
3. `04_architecture/data-model/01-auth-tenancy-entities.md` — User/Workspace/Member shape
4. `05_app/server/trpc/routers/profile.ts` / `follows.ts` / `notifications.ts` — cross-workspace data already shipped
5. `05_app/components/chrome/left-rail.tsx` — current LeftRail listing destinations (Library is inert; this PR lights it up)
6. `05_app/server/db/schema.ts` — user (with V1.12 profile expansion), workspace, member, experiment, activity_event, follow, tag tables

When green: ping owner. Owner runs `npm run deploy:verify` against production after each Wave deploys; signs audit log; tags accordingly.
