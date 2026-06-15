# Code tab handoff — User dashboard + Workspace dashboard + Library

Owner asked for these three destinations together. They're independent surfaces with shared characteristics: all three are **read-heavy landing experiences** built on top of data that already mostly exists. Today's state:

| Surface | Route exists? | LeftRail link? | Backing data |
|---|---|---|---|
| **User dashboard** (cross-workspace personal) | ❌ no | ❌ not in nav | ✅ profileRouter + followsRouter + notificationsRouter all live |
| **Workspace dashboard** (workspace overview) | ❌ no (Studies IS the landing per IA v0.4) | n/a | ⚠️ workspace + studies + activity data live; no aggregate procedures yet |
| **Library** | ❌ no (404) | ✅ in nav but inert | ⚠️ Modules data live (moduleTable + moduleVersion); Themes / Materials / Templates / Imports need new schemas (most arriving via V1.12) |

This handoff covers all three. **Recommended versioning** at the bottom — could be V1.12 Section N (extending the polish bundle) OR V1.13.0 (new release) OR a parallel track. Owner picks.

**Total estimate: ~4 weeks Code-tab time** if all three ship together, less if sub-sections defer (e.g., Library · Themes can't ship until V1.12 Section F lands; Library · Materials needs V1.12 Section C1 R2 work first).

---

## Section N1 — User dashboard (cross-workspace personal landing)

**Route:** new route `/home` under the `(workspace)` group (or top-level — see "Mode question" below). Single page, no sub-nav. Replaces the current `/` → `/studies` redirect for authenticated users: `/` → `/home` instead.

### What it shows

A personal dashboard that summarizes the user's activity ACROSS all workspaces they belong to. Researchers who work in multiple labs / consortia / personal-vs-collaborator workspaces want one place to see what's pending without switching contexts.

**Widget layout (above-the-fold first; below as scroll):**

1. **Welcome block** — "Good morning, {firstName}." + a one-line context ("3 studies in flight; 2 review requests pending; last activity 2 hours ago"). Time-of-day-aware greeting.
2. **Workspaces card** — list of every workspace the user belongs to with: workspace name + role + their study count + their last activity timestamp + a "Switch to" link. Sortable; default by last-activity-desc. The current active workspace is highlighted. Quick-create-workspace at the bottom.
3. **Activity · My follows** — feed from `followsRouter.feed` (already shipped). Cross-workspace; shows the items the researcher follows (tags, authors, frameworks, studies) doing things. Reuses the Activity destination's `ActivityFeed` component scoped to the user.
4. **Notifications inbox** — `notificationsRouter.list` already shipped. Mention notifications, comment-on-your-study, fork notifications, OSF-push-complete events. Mark-read affordance. Empty state.
5. **Your studies — recent drafts across workspaces** — top N studies the user authored or has unsaved-changes in, across all workspaces. Cards link to that study in its workspace (auto-switches workspace context). New tRPC procedure needed: `studies.recentForUser({ limit })` over all workspaces the user is a member of.
6. **Your stats** — small KPI strip: studies authored / replications received / followers count / total participants across all your studies. Sourced from existing tables; ~1 lightweight aggregate query.
7. **Quick actions** — "+ New study in [workspace dropdown]" + "Import a paper" (V2.0 Sandbox link when shipped) + "Open a recent study" (recents list).

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

**Route:** new route `/dashboard` under `(workspace)`. OR `/` at workspace root. Becomes the new default landing in workspace mode (replacing today's `/studies`); `/studies` stays as the destination for the studies list.

### Background — this overrides IA v0.4

IA v0.4 explicitly said "Studies destination IS the workspace landing — no separate dashboard planned." Owner now wants something richer. This is a meaningful IA change.

**Two options:**

- **(a) Workspace dashboard REPLACES Studies as the landing.** Sign-in lands on `/dashboard`; Studies becomes a sibling destination in the LeftRail. The dashboard summarizes the workspace; Studies is the canonical list.
- **(b) Workspace dashboard sits ALONGSIDE Studies in the LeftRail.** Users still land on `/studies` by default; `/dashboard` is opt-in via the nav. Lower commitment; researchers who prefer the list view keep getting it.

**Recommendation: (a) replace.** A workspace landing should orient you to the workspace, not just list studies. Studies list is one click away in the LeftRail. Matches GitHub (repo lands on Code / Issues overview, not on a flat issue list), Linear (workspace lands on dashboard, not on the issue list).

### What it shows

A dense overview of the workspace's recent state. Designed for "I just opened the tool — what's going on here?"

**Widget layout:**

1. **Workspace header** — workspace name + member count + study count + a small "Settings" link for owners/admins.
2. **At-a-glance stats** — KPI strip: total studies (by stage badge: draft / preregistered / published / archived) + total responses this week + active recruitment count + pending review requests.
3. **Recent activity** — workspace-scoped activity feed (last ~15 events): comments, mentions, OSF pushes, recruitment opens, new versions saved. Sourced from `activity_event` table filtered to `workspace_id` (vs the current Activity destination which is user-scoped via follows).
4. **Pending reviews** — studies in this workspace with open `review_request` events not yet resolved. Lists requestor + requestee + study + age. Click to jump to Share stage.
5. **Recently edited studies** — top 5-8 studies updated in the last 7 days, with the editor's name + brief diff summary ("3 blocks added"). Reuses existing study cards.
6. **Top tags** — most-used tags in this workspace (last 30 days). Click to filter Studies list.
7. **Team activity** — members ranked by recent contribution count (comments + edits + reviews); humanizes the workspace.
8. **Storage + cost** (admins only) — R2 storage used / quota; Inngest invocations / quota; AI invocation count + cost (per ADR-0006 + V2.0 when AI features exist). Owner-only view; respects role.

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
- New tRPC: `studies.saveAsTemplate({ studyId, name, description })` — creates a frozen kind:template version of an existing study; copies blocks + conditions + (optionally) theme + (optionally) overview narrative. Per the IA v0.3 picks: 4 share scopes (Public-replicable / Workspace / Invite link / Submit to Framework).
- UI: card grid of templates with title + author + description + "Used N times" + Fork-to-new-study button.
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

#### Library · Imports (~3 days, blocks on V2.0 Sandbox)

Read view over the `imported_content` table created by V2.0 Sandbox (the BYOAI paste-back surface).

- Per-import row: source (Consensus / Elicit / Claude / etc.) + import date + what was imported (study structure, hypotheses, methods) + applied-to-study link + "Re-apply" button
- Useful for: re-running the same AI extraction with a fresh paste; auditing what AI-derived content went into a study (for preregistration honesty)
- The `imported_content` table also feeds the ADR-0006 `ai_invocation` audit log when an AI provider is configured

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

## ADRs needed (Code tab drafts as each Wave nears)

- **ADR-0033 (or whatever number is next) — IA v0.5: Personal mode + workspace dashboard as landing.** Three-mode chrome model (Personal + Workspace + Focused study); URL-driven mode switch; root redirect goes to `/home` for authed users → workspace switch from there to workspace's `/dashboard`. Bundles N1 + N2 IA changes.
- **ADR-0034 — Templates as `kind: template`.** Extends `experimentVersionKind` enum; template share scopes (4 per IA v0.3); save-as-template + fork-from-template flows.
- (Existing) **ADR-0003 amendment** for Materials storage metering surfaces (defer until materials volume is real).

---

## Wireframes needed (phase-gate per CLAUDE.md)

- `user-dashboard.md` (N1)
- `workspace-dashboard.md` (N2)
- `library-modules.md` (N3 Wave A)
- `library-templates.md` (N3 Wave A)
- `library-materials.md` (N3 Wave B)
- `library-themes.md` (N3 Wave C)
- `library-imports.md` (N3 Wave D)
- `personal-mode-topbar.md` (the slim TopBar for personal mode)

---

## Open questions for owner

1. **Workspace dashboard replaces /studies as landing, or sits alongside?** (Recommendation: replaces, per Section N2 option (a).)
2. **Personal mode as a third chrome variant?** (Recommendation: yes — cleaner mental model than cross-workspace data inside workspace chrome.)
3. **Templates: save-as-template flow — copy theme + overview narrative too, or just blocks?** (Recommendation: blocks + conditions are core; theme + overview are opt-in checkboxes in the save dialog.)
4. **Library · Imports: should it surface AI-derived content even before V2.0 Sandbox ships?** Could repurpose for any "imported from elsewhere" content (CSV imports, etc.). (Recommendation: defer; ship when Sandbox lands.)
5. **Storage + cost widget on workspace dashboard: visible to all members or owners only?** (Recommendation: owners + admins only; cost data is sensitive.)
6. **Versioning: V1.12 Section N, or V1.13.0?** (Recommendation: V1.12 Section N — keeps V1.13 clean for Participants + Prolific.)

---

## Sequencing PRs (~4 weeks Code-tab time total)

**Stream A — User dashboard (~1.5 weeks):**
- PR N1.1: `meRouter` with workspaces / recentStudies / stats procedures (~2 days)
- PR N1.2: personal mode chrome + route group split + ADR-0033 (~3 days)
- PR N1.3: `/home` page + widgets + wireframe (~3 days)

**Stream B — Workspace dashboard (~1.5 weeks):**
- PR N2.1: `workspace.dashboard.*` aggregate procedures + tests (~3 days)
- PR N2.2: `/dashboard` page + widgets + role-respecting storage widget (~4 days)
- PR N2.3: root redirect + landing change + IA v0.5 doc (~2 days)

**Stream C — Library shell + Modules + Templates (~1 week):**
- PR N3.1: `/library` route + sub-nav scaffold + ADR-0034 templates kind extension (~2 days)
- PR N3.2: Library · Modules page (~2 days)
- PR N3.3: Library · Templates page + save-as-template + fork-from-template (~3 days)

**Stream D — Library Materials / Themes / Imports (~1 week, gated on V1.12 Sections C1 / F / V2.0):**
- Land in V1.12.x sub-releases as dependencies ship

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
