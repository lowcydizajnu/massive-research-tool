# Code tab handoff — Behavior analytics + Admin destination (drafted 2026-06-22 — owner brainstorm-locked)

> **Behavior analytics + Admin = a measurement layer (PostHog) + an owner-facing administrative destination that surfaces the things only the platform owner can compute (cost rollups, workspace census, feedback queue, failed background jobs, top studies).** Estimated **~4 weeks Code-tab time** across 3 PR streams. Pairs with the Platform foundation handoff (which stubs `/admin/feedback` + `/admin/announcements` for env-var-controlled admins; this handoff promotes them into a real Admin destination behind `user.is_admin`).
>
> **Owner-locked defaults** (indie-solo MVP framing):
> 1. ✅ **PostHog** for product analytics + session replay + feature flags (open-source; self-hostable later; generous free tier — 1M events/mo).
> 2. ✅ **Consent-aware analytics:** every event respects `cookie_consent === 'necessary'` (PostHog adapter no-ops if researcher hasn't accepted-all). Per ADR-0014, participant runtime stays clean of analytics (no PostHog on `/take/*` regardless of consent).
> 3. ✅ **Hybrid admin surface:** PostHog dashboards for behavior/funnels/retention (free); MRT-internal Admin destination for things only we can compute (cost rollups, feedback queue, workspace census, failed jobs).
> 4. ✅ **`user.is_admin` boolean** as the simple gate (no role hierarchy beyond admin/non-admin; that's V2.x if multiple admins are needed). Owner flips their own row to TRUE via direct DB query at deploy time.
> 5. ✅ **Workspace-level cost attribution only** (mirrors V2.1 Hume answer #7); no per-researcher cost split.
> 6. ✅ **View-as researcher (read-only)** for support debugging; **NO act-as researcher** (writing on behalf of a researcher is too dangerous; document explicitly).

---

## What's in place today

| Component | What's there | Where |
|---|---|---|
| `ai_invocation` table | Per-call AI usage rows with `cost_usd`; ADR-0006 substrate; populated by Anthropic + (V2.1) Hume + (future) other AI providers. The data source for cost rollups. | `server/db/schema.ts` |
| `cookie_consent` table (Legal-baseline) | Required for analytics opt-out semantics. | (Legal-baseline) |
| `feedback` table (Platform foundation) | Stubbed `/admin/feedback` page; this handoff promotes it into the Admin destination. | (Platform foundation) |
| `release_announcement` table (Platform foundation) | Stubbed `/admin/announcements` page; promoted similarly. | (Platform foundation) |
| Inngest background jobs | Failed jobs visible only in Inngest Cloud dashboard today; this handoff surfaces a curated failed-jobs view in MRT. | `server/inngest/` |
| Activity events (ADR-0015) | A subset surfaces in the Admin destination (signups stream, study-created stream, etc.). | `server/events/` |
| Sentry (Platform foundation) | Error stream; the Admin destination links out to Sentry for individual errors but rolls up "error rate this week" inline. | (Platform foundation) |
| Existing tRPC routers | All have `protectedProcedure` middleware checking workspace membership; admin routes need a NEW middleware `adminProcedure` that checks `user.is_admin`. | `server/trpc/utils/procedures.ts` |
| ADR-0007 adapter discipline | Analytics goes behind a new `AnalyticsAdapter` interface; PostHog is one implementation. | ADR-0007 |
| ADR-0014 PII boundary | Participant runtime stays unobserved by analytics. | ADR-0014 |

## What's missing (the Analytics + Admin build)

- `AnalyticsAdapter` interface + PostHog implementation + consent-aware no-op + sensitivity routing
- Event taxonomy: a curated list of ~20 events the app fires (signup, workspace_created, study_created, study_first_block_added, study_published, ...)
- `user.is_admin BOOLEAN NOT NULL DEFAULT FALSE` migration
- `adminProcedure` tRPC middleware
- `/admin` destination + sub-routes (overview, workspaces, users, feedback, announcements, failed-jobs, signups)
- Cost rollup queries against `ai_invocation` (per-workspace per-month)
- View-as researcher (read-only impersonation) with audit log
- PostHog dashboards configured (not Code-tab work; owner sets up dashboards in PostHog UI)

---

## Section AA1 — AnalyticsAdapter + PostHog + event taxonomy (~2 weeks)

### AA1.1 AnalyticsAdapter interface (~2 days)

```ts
// server/adapters/analytics.ts
import type { CookieConsentChoice } from '@/lib/legal/cookie-consent';

export type SensitivityTag = 'researcher_behavior' | 'researcher_content' | 'admin_action';
// participant_data and pii NEVER tagged — those routes never call analytics

export interface AnalyticsAdapter {
  identify(opts: {
    userId: string;
    workspaceId?: string;
    consent: CookieConsentChoice;
    properties?: Record<string, string | number | boolean>;
  }): void;

  track(opts: {
    userId?: string;
    workspaceId?: string;
    event: AnalyticsEvent;
    sensitivity: SensitivityTag;
    consent: CookieConsentChoice;
    properties?: Record<string, string | number | boolean>;
  }): void;

  pageView(opts: {
    userId?: string;
    workspaceId?: string;
    pathname: string;
    consent: CookieConsentChoice;
  }): void;
}

// strict taxonomy — adding events requires updating this union + an ADR amendment
export type AnalyticsEvent =
  | 'signup_completed'
  | 'workspace_created'
  | 'study_created'
  | 'study_first_block_added'
  | 'study_preview_opened'
  | 'study_preregistered'
  | 'study_published'
  | 'study_first_participant'
  | 'recruitment_opened'
  | 'recruitment_closed'
  | 'osf_connected'
  | 'osf_preregistration_pushed'
  | 'prolific_connected'
  | 'ai_connection_added'              // per provider (anthropic / hume / ...)
  | 'ai_feature_used'                  // per provider + modality
  | 'template_saved'
  | 'template_used'
  | 'material_uploaded'
  | 'material_used_in_study'
  | 'theme_saved_to_library'
  | 'theme_applied_to_study'
  | 'import_completed'                 // per source (json / osf / qualtrics)
  | 'feedback_submitted'
  | 'announcement_viewed'
  | 'whiteboard_opened'
  | 'team_member_invited'
  | 'team_member_joined'
  | 'study_forked'
  | 'study_replicated'
  | 'condition_added'
  | 'variant_factor_added';

// ~28 events. Cap at ~50 lifetime for V1; over-eventing destroys signal.
```

### AA1.2 PostHog implementation (~3 days)

- `server/adapters/analytics.posthog.ts` — the only file allowed to import `posthog-node` (and on the client side: `posthog-js`)
- Server-side init from `POSTHOG_API_KEY` env (NOT BYO — PostHog is an app-level analytics vendor, not per-workspace)
- Consent-aware: if `consent === 'necessary'`, `track()` / `identify()` / `pageView()` all no-op silently (PostHog allows opt-out at the SDK level; use `posthog.opt_out_capturing()`)
- Sensitivity routing: `participant_data` and `pii` sensitivity tags THROW — these should never be passed; if they are, it's a programming error that needs to surface loudly. Catch in CI via type-narrowing.
- Per-tenant rollup: PostHog supports group analytics (groups = workspaces in our model); set `group(workspace_id)` on every event so PostHog dashboards can group by workspace

### AA1.3 Event instrumentation (~5 days)

Touch every place an event from the taxonomy occurs:

- `signup_completed` → in `clerk.user.created` webhook handler
- `workspace_created` → in `workspace.create` mutation
- `study_created` → in `studies.create` mutation
- `study_first_block_added` → in `studies.writeBlocks` mutation (count blocks before/after; fire only on 0→N>0)
- `study_preview_opened` → in preview page mount
- `study_preregistered` → in `studies.preregister` mutation
- `study_published` → in `studies.publish` mutation
- `study_first_participant` → in `recordResponse` first time per study
- ... etc for all ~28 events
- Each `track()` call passes the workspace_id + user_id + the event-specific properties + the user's current `cookie_consent` (read from session)

### AA1.4 Consent integration (~1 day)

- `cookie_consent` table from Legal-baseline handoff provides the consent value
- A small `getConsent({ userId, sessionId })` helper that reads the latest row + falls back to `'necessary'` if no row exists (defensive default — never assume consent)
- Every analytics call threads consent through; adapter no-ops on `'necessary'`

### AA1.5 Session replay (~1 day)

- PostHog session replay is opt-in via PostHog config + respects opt-out
- Configure: only record session if `cookie_consent === 'all'`; mask all text in `<input>` / `<textarea>` (researchers paste sensitive content); never record `/take/*` (participant runtime)
- Storage cost: PostHog free tier includes some replay quota; once you exceed it, can upgrade or disable
- Big debugging win for non-developer founders ("why are researchers dropping off here?" — literally watch them)

### Wireframe gates

- `03_design/wireframes/analytics-event-taxonomy.md` (reference doc, not a UI wireframe)
- `03_design/wireframes/cookie-consent-banner.md` (already from Legal-baseline; ensure consent wording explicitly mentions "analytics tracking")

### Tests

- Unit: `track()` no-ops on `consent: 'necessary'`
- Unit: passing `sensitivity: 'pii'` to `track()` throws
- Unit: all ~28 events properly typed
- Integration: stub PostHog server fixture verifies events are formatted correctly (gated `RUN_POSTHOG_E2E=1`)

---

## Section AA2 — Admin destination + role gate (~1.5 weeks)

### AA2.1 `user.is_admin` + `adminProcedure` (~1 day)

Migration:
```sql
ALTER TABLE "user" ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
```

Owner manually runs `UPDATE "user" SET is_admin = TRUE WHERE id = '<owner-uuid>';` post-migration. (Don't auto-seed; explicit grant.)

`adminProcedure` middleware in `server/trpc/utils/procedures.ts`:
```ts
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx: { ...ctx, isAdmin: true } });
});
```

### AA2.2 `/admin` destination shell (~1 day)

- New top-level route `/admin` (NOT under `(workspace)` — admin is cross-workspace)
- LeftRail entry visible only if `user.is_admin = TRUE`
- Sub-nav: Overview / Workspaces / Users / Feedback / Announcements / Failed jobs / Costs
- Middleware: redirect non-admins to `/studies` (404 / 403 also acceptable; FORBIDDEN with friendly message)

### AA2.3 Admin Overview tab (~2 days)

Widgets:
- **Workspace census** — total workspaces; active in last 7/30/90 days (active = has any activity event)
- **Users census** — total users; active in last 7/30/90 days
- **Studies census** — total studies; published this week/month; preregistered this week/month
- **Responses census** — total response rows; this week/month
- **AI spend rollup** — sum of `ai_invocation.cost_usd` for this calendar month, split by provider
- **Open feedback** count — `feedback WHERE status IN ('new', 'triaged')`
- **Failed jobs** count — Inngest API call to count failed jobs in last 24h
- **Recent signups** — last 10 `signup_completed` events with workspace + timestamp

PostHog dashboards link out (don't embed — keep PostHog separately for funnels/retention)

### AA2.4 Workspaces sub-page (~2 days)

- Sortable table: name / owner email / created / member count / studies count / responses count / this-month-AI-spend / last-active-date
- Filter: by activity status (active/dormant)
- Row click → workspace detail (admin view): list of members; list of studies; list of AI connections; AI cost history chart; "View as" affordance (read-only impersonation; see AA2.7)
- Pagination + search

### AA2.5 Users sub-page (~1 day)

- Sortable table: email / display name / workspaces (member of) / signup date / last active / is_admin badge
- Search by email
- Row click → user detail (admin view): basic profile (no PII beyond what's visible to other workspace members); workspaces; recent activity timeline; "View as" affordance
- Admin promotion: a single "Make admin" toggle (writes to `is_admin`)

### AA2.6 Feedback queue, Announcements, Failed jobs (~2 days)

- **Feedback queue** — promotes the Platform-foundation `/admin/feedback` page; sortable by status/kind/created; per-row: triage actions (mark in_progress / resolved / wont_fix / duplicate); admin notes; screenshot preview
- **Announcements** — promotes the Platform-foundation `/admin/announcements` page; authoring UI + list of published; edit/unpublish
- **Failed jobs** — calls Inngest API for failed jobs in last 7 days; per-row: error message + run timestamp + retry button + link to Inngest cloud detail

### AA2.7 View-as researcher (read-only) (~2 days)

- On a workspace or user detail page: "View as {email}" button
- On click: sets a session-scoped `ctx.viewAsUserId` flag (server-side; encrypted JWT in a separate cookie; expires in 30 min); does NOT modify the actual session
- All tRPC procedures see `ctx.viewAsUserId` and:
  - For READ procedures: run as that user (researcher's data is what's returned)
  - For WRITE procedures: throw `FORBIDDEN` ("View-as is read-only")
- Visual indicator: a persistent banner at top of every page ("Viewing as {email} — read-only · Exit") with one-click exit
- Audit log: every view-as start + exit writes a row to `admin_audit_log` table

```sql
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES "user"(id),
  action TEXT NOT NULL CHECK (action IN ('view_as_start', 'view_as_exit', 'is_admin_granted', 'is_admin_revoked', 'announcement_published', 'feedback_triaged', 'workspace_inspected', 'user_inspected')),
  target_user_id UUID REFERENCES "user"(id),
  target_workspace_id UUID REFERENCES workspace(id),
  target_id TEXT,                          -- generic; e.g. feedback_id or announcement_id
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Audit log surfaces in Admin → Overview as "Recent admin activity" (last 50).

### Wireframe gates

- `03_design/wireframes/admin-destination-shell.md`
- `03_design/wireframes/admin-overview.md`
- `03_design/wireframes/admin-workspaces-list.md`
- `03_design/wireframes/admin-workspace-detail.md`
- `03_design/wireframes/admin-users-list.md`
- `03_design/wireframes/admin-user-detail.md`
- `03_design/wireframes/admin-feedback-queue.md` (extends Platform-foundation stub)
- `03_design/wireframes/admin-announcements-authoring.md` (extends Platform-foundation stub)
- `03_design/wireframes/admin-failed-jobs.md`
- `03_design/wireframes/view-as-banner.md`

### Tests

- Unit: `adminProcedure` throws FORBIDDEN for non-admin
- Unit: cost rollup correctly sums `ai_invocation.cost_usd` for current month per provider
- Unit: view-as start writes audit row; exit writes audit row; write procedure throws while viewing-as
- e2e: owner promotes self → admin destination appears in LeftRail → opens workspaces list → views one workspace's detail → "View as" → sees that researcher's studies → exits → audit log shows the trail

---

## Section AA3 — PostHog dashboards (owner work, not Code tab) (~3 hours)

Once PostHog is wired in PR AA1, owner configures dashboards in PostHog UI:

1. **Acquisition funnel**: signup → workspace_created → study_created → study_first_block_added → study_published
2. **Retention cohorts**: week-1 / week-4 / month-3 active rate
3. **Top events**: which events fire most (validates the taxonomy is useful)
4. **Per-workspace activity**: groups by workspace; shows MAU/WAU/DAU per workspace
5. **AI feature usage**: events filtered to `ai_feature_used`; broken down by provider + modality
6. **Drop-off heatmap**: where in the signup → first-publish funnel do researchers stall?

PostHog has visual dashboard builders — drag widgets, configure filters, no code. Owner can iterate based on what questions come up.

---

## ADRs needed

- **ADR-00XX — Analytics adapter + PostHog implementation + consent integration.** Locks: AnalyticsAdapter interface; PostHog as the V1 implementation; sensitivity-tag routing (no `participant_data` / `pii`); consent-aware no-op semantics; event taxonomy (the typed union); group analytics by workspace; session replay opt-in masking.
- **ADR-00XX — Admin destination + role model + view-as semantics.** Locks: `user.is_admin` boolean (no role hierarchy for V1); `adminProcedure` middleware; view-as is read-only (no act-as) + per-call FORBIDDEN on writes; `admin_audit_log` table; `/admin` cross-workspace destination.

2 ADRs.

---

## Wireframes needed

- Analytics taxonomy reference doc
- 10 admin destination wireframes (see Section AA2 list)
- View-as banner

12 wireframes; some are simple table layouts.

---

## Sequencing PRs (~4 weeks total)

**Stream AA1 — Analytics (~2 weeks):**
- PR AA1.1: `AnalyticsAdapter` interface + PostHog impl + consent integration + `posthog-node` + `posthog-js` install + lock-in inventory row (~3 days)
- PR AA1.2: Event taxonomy union + `getConsent` helper + first 10 events instrumented (signup / workspace_created / study_* basics) (~3 days)
- PR AA1.3: Remaining ~18 events instrumented (~3 days)
- PR AA1.4: Session replay config + opt-in masking + `/take/*` exclusion + ADR (~2 days)

**Stream AA2 — Admin destination (~1.5 weeks):**
- PR AA2.1: `user.is_admin` migration + `adminProcedure` + `/admin` shell + LeftRail gate (~1 day)
- PR AA2.2: Overview tab + 8 widgets (~2 days)
- PR AA2.3: Workspaces sub-page + Users sub-page (~2 days)
- PR AA2.4: Feedback queue + Announcements authoring promotion (~1 day)
- PR AA2.5: Failed jobs sub-page + Inngest API integration (~1 day)
- PR AA2.6: View-as banner + middleware + audit log table + ADR (~2 days)

**Stream AA3 — PostHog dashboards (~3 hours, owner work):**
- Owner configures 6 dashboards in PostHog UI (no Code tab work)

---

## Open questions

1. **PostHog cloud vs self-hosted?** Free tier on PostHog Cloud (US or EU region) covers ~1M events/month — more than enough for V1. Self-hosting deferrable; **recommend Cloud for V1**. Confirm?
2. **PostHog region?** US or EU? EU has lower latency for European researchers + better GDPR optics (data stays in EU). **Recommend EU**. Confirm?
3. **View-as default scope?** Workspace-only (admin can only view-as researchers within a chosen workspace) OR global (any researcher in any workspace)? Workspace-only is safer; global is more useful for support. **Recommend global with audit log** since the audit trail provides accountability. Confirm?

3 open questions; pinging owner if they care to override defaults.

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/handoffs/code-tab-platform-foundation.md` — sibling work that stubs feedback + announcements admin pages this handoff promotes.
3. `04_architecture/handoffs/code-tab-legal-baseline.md` — cookie_consent integration.
4. `04_architecture/adrs/0006-ai-plugin-architecture.md` — `ai_invocation` table queried for cost rollups.
5. `04_architecture/adrs/0007-path-a-vs-b.md` — adapter discipline this handoff applies to analytics.
6. `04_architecture/adrs/0014-pii-boundary.md` — what NEVER goes through analytics.
7. `04_architecture/adrs/0015-notifications-comments-activity.md` — `activity_event` table joined for signups stream.
8. `04_architecture/lock-in-inventory.md` — add PostHog row.
9. https://posthog.com/docs/libraries/node — PostHog Node SDK.
10. https://posthog.com/docs/libraries/next-js — PostHog Next.js integration.
11. https://posthog.com/docs/privacy/gdpr-compliance — GDPR posture for the privacy policy.

---

## What's NOT in this scope (deferred)

- **Per-researcher cost attribution.** Workspace-level rollup only per V2.1 Hume answer #7. V2.2+ if requested.
- **Custom event funnels in MRT** beyond the taxonomy. PostHog UI handles funnels; don't rebuild in-app.
- **A/B testing infrastructure / feature flags** beyond what PostHog ships. PostHog has feature flags built in; use them via the adapter when needed; no separate work.
- **Cohort + audience targeting for announcements.** All announcements broadcast to everyone in V1. Per-cohort targeting = V2.x.
- **Cost forecasting / budget projections.** Today's rollups are descriptive (this-month spend); predictive forecasting = V2.x.
- **Researcher-facing usage dashboard** (their own workspace's AI spend visible to them). Comes in V2.1 Hume H8c; not duplicated here.
- **Admin-bulk actions** (mass-update workspaces / users). Defer until specific use cases arise.
- **Admin-side support-ticket workflow** beyond the feedback queue's triage states. Defer; consider Pylon / Intercom integration when volume justifies.
- **Custom report builder** for admin (SQL-style querying). Defer; if needed, give admin direct DB access via Neon for one-off queries.
- **Real-time admin dashboards** (live updates via WebSocket). Defer; periodic poll (or refresh on demand) is fine for V1.

When green: ping owner. Owner runs a smoke test (logs in as admin → sees Overview widgets populated → opens a workspace detail → "View as" researcher → confirms read-only banner + writes blocked → exits → audit log shows trail; publishes a test announcement → confirms it appears in researcher widgets; submits test feedback → confirms it lands in queue); signs the audit log; tags the release.
