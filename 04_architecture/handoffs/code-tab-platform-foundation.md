# Code tab handoff — Platform foundation (drafted 2026-06-22 — owner brainstorm-locked)

> **Platform foundation = the table-stakes platform-maturity work an indie-solo SaaS needs before serious researcher adoption: error monitoring + dependency security + public security disclosure + in-app feedback collection + first-time onboarding + empty-state copy across every destination + in-app announcement widget.** Estimated **~5 to 6 weeks Code-tab time** across 4 PR streams. Smallest-leverage-per-day on this list is the security baseline (~1 day, big credibility win); biggest-impact-per-day is the onboarding + empty-states pass (first-impression failures kill SaaS more than feature gaps).
>
> **Owner-locked defaults** (indie-solo MVP framing):
> 1. ✅ **Sentry** for error monitoring (free tier; standard); **Dependabot** (built into GitHub, free) for dependency updates; **security.txt** at the conventional RFC 9116 path.
> 2. ✅ **Custom-built in-app feedback widget** (no Intercom / Crisp / Pylon — overkill at indie scale). Floating button bottom-right; modal with text + screenshot capture (html2canvas) + auto-context (URL/userAgent/workspace_id/study_id).
> 3. ✅ **react-joyride** for the first-time onboarding tour (MIT, mature; small bundle).
> 4. ✅ **Custom in-app announcement widget** (no Headway / LaunchNotes — small enough to build).
> 5. ✅ Per the indie-solo legal-baseline handoff: feedback collection respects `cookie_consent === 'necessary'` (data still saved, but screenshot capture is opt-in if researcher hasn't accepted-all).

This handoff is **non-controversial polish + safety net** work. No new ADRs argue for major architecture; all PRs are additive.

---

## What's in place today

| Component | What's there | Where |
|---|---|---|
| `/signup` magic-link flow | Production-shipped; no first-time tour or onboarding screen after signup. | `app/(app)/(auth)/signup/page.tsx` |
| Empty states (partial) | Some destinations have empty-state copy; many don't (Activity / Library Templates [once it lands] / Participants / Comments / Whiteboard). | scattered across `components/feature/*` |
| LeftRail + TopBar chrome | Stable; no "what's new" surface yet; no feedback button. | `components/chrome/` |
| Comments + activity events (V1.7) | Will be a place where in-app announcements could surface as system-events; or build a standalone widget. | `server/events/` |
| `cookie_consent` table (Legal-baseline handoff) | Required for the feedback widget's "include screenshot?" toggle to respect consent. | (Legal-baseline) |
| ADR-0014 PII boundary | Feedback widget context must NOT capture raw IP or full UA — only hashed. | ADR-0014 |
| `r2-storage` adapter | Feedback screenshots go to `ws/<workspace>/feedback/<feedback_id>.png`. | `server/adapters/storage.r2.ts` |
| Error handling today | Errors logged to Vercel logs; no aggregation / alerting / fingerprinting. | (no central error monitor) |
| Dependency updates today | Manual npm-update when someone notices; no automation. | (none) |
| Security disclosure | No `security.txt`; no public security posture page. | (none) |

## What's missing (the Platform-foundation build)

- Sentry SDK wired into Next.js (server + client); errors aggregated, fingerprinted, alertable
- Dependabot config in `.github/dependabot.yml`
- `security.txt` at `/.well-known/security.txt` + a public `/security` page
- Incident-response 1-pager (owner-private; lives in `06_qa/runbooks/`)
- In-app feedback widget (floating button + modal + screenshot + R2 + `feedback` table + admin queue surface)
- First-time onboarding tour (react-joyride; 4-5 steps; triggered on first login after signup)
- Empty-state copy pass across every destination + per-state component pattern
- Feature-discovery tooltips (5-7 features; capped to avoid annoyance)
- In-app announcement widget (TopBar entry + slide-out panel + `release_announcement` table)

---

## Section PF1 — Safety baseline: Sentry + Dependabot + security.txt + Security page (~2 days)

### PF1.1 Sentry (~1 day)

- Install `@sentry/nextjs` (their official Next.js SDK)
- Wire server-side + client-side error capture (the SDK auto-instruments most code paths)
- Set up release-tagging in Vercel (so Sentry knows which commit each error belongs to)
- Configure source map upload (Sentry SDK has a Vercel plugin)
- Free tier covers ~5k errors/month — plenty for V1
- Sensitive-data scrubbing: configure `beforeSend` hook to drop `Authorization` headers + redact `Bearer ` tokens + redact `password=` patterns (Sentry has built-in defaults; extend per ADR-0014)
- Per ADR-0014: NO participant data in error context. Add an explicit allowlist of which user/workspace fields can be attached to errors (`workspace_id` + `user_id` are OK; PII like email is not unless we whitelist for support-debugging purposes).

### PF1.2 Dependabot (~half day)

- Create `.github/dependabot.yml`:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/05_app"
      schedule:
        interval: "weekly"
      open-pull-requests-limit: 5
      groups:
        minor-and-patch:
          update-types: ["minor", "patch"]
    - package-ecosystem: "github-actions"
      directory: "/"
      schedule:
        interval: "weekly"
  ```
- Optional: add Renovate later if Dependabot's grouping feels limiting.

### PF1.3 security.txt + /security page (~half day)

- Create `app/.well-known/security.txt/route.ts` returning the RFC 9116-formatted plaintext:
  ```
  Contact: mailto:security@myresearchlab.app
  Expires: 2027-06-22T00:00:00.000Z
  Preferred-Languages: en
  Canonical: https://myresearchlab.app/.well-known/security.txt
  Policy: https://myresearchlab.app/security
  ```
- Create `/security` page (Markdown-rendered, same pipeline as `/legal/*` from the legal-baseline handoff) explaining:
  - Encryption (`TOKEN_ENCRYPTION_KEY` + Neon-at-rest + HTTPS)
  - Authentication (Clerk)
  - Workspace isolation (ADR-0014)
  - Rate limiting (Upstash)
  - Sub-processor list (link to legal-baseline's source-of-truth)
  - Disclosure policy (90 days; coordinated)
  - PGP key (optional — skip for V1)
- Update `Expires:` date yearly in a quick PR.

### PF1.4 Incident-response 1-pager (~1 hour, owner-private)

Not Code tab work; create `06_qa/runbooks/incident-response.md` (owner-private; gitignored OR encrypted via git-crypt if you want it in the repo). Lives in your password manager / OneDrive / wherever — not Code tab's problem.

What it covers:
- Who to notify (Anthropic / Clerk / Vercel support; affected researchers; data protection authorities)
- How to put the app in maintenance mode (Vercel deployment swap)
- How to revoke leaked keys (vendor playbooks per provider)
- How to roll back a bad deploy (Vercel one-click + `db:migrate:rollback`)
- Communications template (statuspage post + email to affected researchers)
- Post-mortem template

### Tests for PF1

- Unit: Sentry captures a thrown error in a tRPC procedure + scrubs sensitive headers
- Unit: `security.txt` route returns the correct content-type + RFC 9116 format
- Build-time: Dependabot config is valid YAML (GitHub validates this)

---

## Section PF2 — In-app feedback widget (~1 week)

Floating button + modal + screenshot + R2 + admin queue surface.

### Floating button

- `<FeedbackButton />` component rendered in the authenticated app shell (NOT participant runtime per ADR-0014)
- Position: fixed bottom-right, ~24px from edges, above floating chat-style affordances
- Visual: round button with a 💬 icon (or paper-airplane); ~48px; warm parchment background with brand-color border; hover state lifts slightly
- z-index: above content but below modals
- Click → opens modal

### Modal

- Title: "Send feedback"
- Field 1: free-text textarea (~6 rows; placeholder "What's on your mind? Bugs, ideas, confusion — anything.")
- Field 2: a kind selector (radio chips): `Bug` / `Idea` / `Question` / `Other` (defaults to `Bug`)
- Field 3 (optional): "Include screenshot of this page" checkbox (default: ON; respects `cookie_consent` — if `'necessary'` only, default OFF + helper copy "screenshots disabled by your cookie preferences")
- Field 4 (optional, expandable): "Include browser context" — auto-captures URL / userAgent (hashed) / workspace_id / study_id / route name. Visible JSON preview in the modal so researcher sees what's being sent.
- Buttons: `Cancel` / `Send feedback`

### Screenshot capture

- Use `html2canvas` library (MIT)
- On submit, if checkbox is ON: canvas-render the entire current page → PNG blob → upload to signed R2 URL `ws/<workspace>/feedback/<feedback_id>.png`
- DO capture the modal area too (researcher might point at something in the modal); the modal closes before capture starts, then re-opens for the submission progress

### Data model

```sql
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID REFERENCES workspace(id) ON DELETE SET NULL,
  user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'idea', 'question', 'other')),
  body TEXT NOT NULL,
  url TEXT,                                 -- the page they submitted from
  route_name TEXT,                          -- Next.js pathname pattern
  user_agent_hash TEXT,                     -- one-way hash per ADR-0014
  ip_country TEXT,                          -- coarse cf-ipcountry only
  screenshot_r2_key TEXT,                   -- nullable
  study_id UUID REFERENCES experiment(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate')) DEFAULT 'new',
  admin_notes TEXT,                         -- owner-private triage notes
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feedback_status_created ON feedback (status, created_at DESC);
```

### tRPC procedures

- `feedback.submit({ kind, body, url, routeName, includeScreenshot, contextJson })` — `protectedProcedure`; writes the row; returns `{ feedbackId, screenshotUploadUrl? }` if screenshot included
- `feedback.confirmScreenshot({ feedbackId, r2Key })` — `protectedProcedure`; sets `screenshot_r2_key` after client-side upload completes (decouples DB write from R2 upload)

### Admin queue surface

Lives in the Admin destination (deferred to the Analytics + Admin handoff). For now: PR PF2.4 ships a minimal owner-only `/admin/feedback` page hidden behind `user.is_admin = TRUE` (gate to be added in Analytics + Admin handoff — for now, hardcode an env-var-controlled `ADMIN_USER_IDS` list).

### Wireframe gates

- `03_design/wireframes/feedback-button-floating.md`
- `03_design/wireframes/feedback-modal.md`
- `03_design/wireframes/admin-feedback-queue.md`

### Tests

- Unit: `feedback.submit` writes row; `confirmScreenshot` updates row
- Unit: respects `cookie_consent === 'necessary'` (default-OFF screenshot checkbox)
- Unit: scrubs raw IP / raw UA per ADR-0014
- e2e: open modal → fill text → submit → see toast → admin queue shows new row

---

## Section PF3 — First-time onboarding + empty states + feature discovery (~3 weeks)

### PF3.1 First-time onboarding tour (~1 week)

- Install `react-joyride` (MIT)
- Trigger: first login after signup OR researcher manually re-triggers from Settings · Account → "Replay onboarding"
- 4-5 step tour:
  1. Welcome — "Hi {name}. Quick 30-second tour?"
  2. LeftRail — "Your destinations: Studies / Library / Activity / Participants / Team. Click anything to dive in."
  3. Builder — "Create your first study from scratch or start from a template."
  4. Templates (Library-completion handoff) — "Browse starter templates here. Misinformation, persuasion, attention — pick one and fork."
  5. Done — "You can re-take this tour anytime from Settings · Account."
- Researcher's tour-completion stored in `user.has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE`
- Persisted in `user` table so it survives device changes
- Tour-skip and tour-completion both flip `has_completed_onboarding` to TRUE

### PF3.2 Empty-state copy pass (~1 week)

Build a reusable `<EmptyState />` component with consistent design (warm parchment card + illustrative icon + heading + body + CTA) and apply across every destination that has a "no content yet" state:

| Surface | Empty-state copy |
|---|---|
| `/studies` (new researcher) | "No studies yet. Start from a template or build from scratch." [Browse templates] [New study] |
| `/library/templates` (Library-completion) | "No templates yet. Save any study as a template from its Builder Details panel." [Browse starter templates] |
| `/library/materials` (Library-completion) | "No materials yet. Upload media directly here, or save assets from studies and Playground cards." [Upload media] |
| `/library/themes` (Library-completion) | "No themes yet. Create a theme from any study's Builder Design panel." |
| `/library/imports` (Library-completion) | "No imports yet. Bring in a study from a JSON export, OSF preregistration, or Qualtrics .qsf file." [Import a study] |
| `/activity` (no Follows) | "Follow authors, studies, tags, or frameworks to see updates here." [Browse studies] |
| `/participants` (no Connections) | "Connect Prolific to start recruiting participants." [Connect Prolific] |
| `/team` (single member) | "You're the only person here. Invite teammates to start collaborating." [Invite member] |
| `/playground` (empty board) | "No cards yet. Drop a link, jot a note, sketch an idea." [Add a card] |
| Comments thread (empty) | "No comments yet. @mention teammates to get a discussion going." |
| Whiteboard (no blocks) | "Add blocks from the picker; arrange visually. Connect them to define participant flow." |
| Conditions (no conditions) | "Conditions let you randomize participants into experimental groups." [Add condition] |
| Variants (no variants) | "Variants run A/B factorial designs within one study. Define factors and levels." [Add factor] |
| Versions tab (only draft) | "You haven't saved a named version yet. Save when you reach a milestone you want to refer back to." [Save as named] |
| Results page (no responses yet) | "No responses yet. Open recruitment to start collecting." [Open recruitment] |
| OSF (not connected) | "Connect OSF to preregister studies and push registrations." [Connect OSF] |
| Replications tab (no replications) | "Make this study replicable, and forks from other workspaces will appear here." [Make replicable] |

Pattern: every empty state has a CTA that takes the researcher to the obvious next step.

### PF3.3 Feature-discovery tooltips (~3 days)

A small framework for one-time tooltips that appear when a researcher encounters a feature they haven't used yet. Cap at **5-7 tooltips total** to avoid annoyance:

- "Save as named version" on Builder TopBar (first time researcher reaches the Run stage)
- "Add a condition" in Builder Conditions panel (first time researcher creates a 2nd study)
- "Save as template" in Builder Details (after first preregister)
- "Open Whiteboard" toggle (first time researcher has >3 blocks)
- "Pick from Materials" affordance (Library-completion; first time researcher creates a 2nd study that needs media)
- "+ Invite teammate" in `/team` (after first 5 sessions)
- "Connect OSF" in Settings · Account (after first 3 studies created)

Each tooltip:
- Dismisses on click OR after 8 seconds OR if researcher interacts with the highlighted element
- Once dismissed, never re-appears (stored in `user.dismissed_feature_tips TEXT[]`)

### Wireframe gates

- `03_design/wireframes/onboarding-tour-step-1-welcome.md`
- `03_design/wireframes/onboarding-tour-step-2-leftrail.md`
- `03_design/wireframes/onboarding-tour-step-3-builder.md`
- `03_design/wireframes/onboarding-tour-step-4-templates.md`
- `03_design/wireframes/onboarding-tour-step-5-done.md`
- `03_design/wireframes/empty-state-component.md` (shared design)
- `03_design/wireframes/feature-discovery-tooltip.md` (shared design)

### Tests

- Unit: tour completion flips `has_completed_onboarding`
- Unit: tour skip flips it too
- Unit: dismissed tooltip never re-appears
- e2e: new researcher signs up → tour appears → completes → tour does not appear on next login

---

## Section PF4 — In-app announcement widget (~3 days)

A small widget in TopBar for "what's new" updates from the dev team (Code tab + owner).

### Widget UI

- Icon: sparkle ✨ (or party-popper 🎉) in TopBar, between existing affordances
- Unread badge (small dot) if researcher has unread announcements
- Click → opens slide-out panel from right showing announcement entries in reverse-chronological order
- Each entry: title + short description (1-2 sentences) + optional image/gif + optional "Learn more" link → docs (later) or feature page
- "Mark all as read" button at top

### Data shape

```sql
CREATE TABLE release_announcement (
  id TEXT PRIMARY KEY,                       -- ulid
  title TEXT NOT NULL,
  body TEXT NOT NULL,                        -- short markdown (allowlisted)
  image_r2_key TEXT,                         -- optional preview image (ws-public bucket)
  learn_more_url TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by_user_id UUID NOT NULL REFERENCES "user"(id)
);

-- per-user read tracking; user.last_seen_announcement_at column also acceptable
-- (single timestamp; if user.last_seen >= announcement.published_at, considered read)
ALTER TABLE "user" ADD COLUMN last_seen_announcement_at TIMESTAMPTZ;
```

### Authoring flow

- Admin-only `/admin/announcements` page (lives in Admin destination once it ships; for now, env-var-controlled `ADMIN_USER_IDS` allowlist)
- Form: title + body (Markdown) + image upload + learn-more URL + publish button
- Publishing inserts the row + emits an `announcement_published` event (V1.7 emit() — but with `recipientUserId: null` / system event so it surfaces in everyone's widget, not per-user notifications)

### tRPC procedures

- `announcements.list({ cursor? })` — `protectedProcedure`; returns ordered list
- `announcements.unreadCount()` — `protectedProcedure`; returns count where `published_at > user.last_seen_announcement_at`
- `announcements.markAllRead()` — `protectedProcedure`; sets `user.last_seen_announcement_at = NOW()`
- `announcements.create({ title, body, imageR2Key?, learnMoreUrl? })` — admin-gated `protectedProcedure`

### Wireframe gates

- `03_design/wireframes/announcement-widget-topbar.md`
- `03_design/wireframes/announcement-panel-slideout.md`
- `03_design/wireframes/admin-announcement-authoring.md`

### Tests

- Unit: unread count correctly reflects timestamp comparison
- Unit: `markAllRead` updates user row
- e2e: admin publishes → all researchers see badge → opening panel marks read

---

## ADRs needed

- **ADR-00XX — Platform foundation scope.** Locks: Sentry as error monitor (free tier; behind no adapter — error monitors are vendor-natural and switching is rare); Dependabot for dependency updates; in-app feedback widget design + `feedback` table; first-time tour via react-joyride; `release_announcement` table + per-user `last_seen_announcement_at` tracking; empty-state component pattern + cap of 5-7 feature-discovery tooltips.
- **ADR-00XX (optional) — Sentry adapter discipline exception.** Sentry SDK auto-instruments many code paths via the Next.js plugin; full isolation behind an adapter is impractical for error monitors (the whole point is auto-capture). Document this as an explicit exception to ADR-0007 + record what we'd swap to (PostHog error tracking? Datadog? — defer until cost or scale forces a switch).

2 ADRs (1 substantive + 1 short discipline-exception note).

---

## Wireframes needed

- 5 onboarding-tour-step wireframes
- 1 empty-state component wireframe
- 1 feature-discovery-tooltip wireframe
- 2 feedback wireframes (button + modal)
- 1 admin feedback-queue wireframe
- 3 announcement wireframes (TopBar + slide-out + admin authoring)

13 wireframes total. All small.

---

## Sequencing PRs (~5.5 weeks total)

**Stream PF1 — Safety baseline (~2 days):**
- PR PF1.1: `@sentry/nextjs` install + config + redactor + ADR exception (~1 day)
- PR PF1.2: `.github/dependabot.yml` (~half day)
- PR PF1.3: `security.txt` route + `/security` page (Markdown rendering reused from Legal-baseline handoff) (~half day)

**Stream PF2 — Feedback widget (~1 week):**
- PR PF2.1: `feedback` schema + `feedback.submit` + `feedback.confirmScreenshot` + R2 upload signing (~2 days)
- PR PF2.2: `<FeedbackButton />` + `<FeedbackModal />` + html2canvas integration + cookie-consent respect (~3 days)
- PR PF2.3: minimal `/admin/feedback` page (env-var allowlist) + triage actions (~2 days)

**Stream PF3 — Onboarding + empty states (~3 weeks):**
- PR PF3.1: react-joyride integration + tour content + `user.has_completed_onboarding` migration (~5 days)
- PR PF3.2: `<EmptyState />` component + design tokens + first 8 destinations (Studies / Library tabs / Activity / Participants / Team / Playground / Comments / Whiteboard) (~5 days)
- PR PF3.3: remaining empty states (Conditions / Variants / Versions / Results / OSF / Replications) (~3 days)
- PR PF3.4: feature-discovery tooltip framework + first 5 tooltips + dismiss tracking (~3 days)

**Stream PF4 — Announcement widget (~3 days):**
- PR PF4.1: `release_announcement` schema + `user.last_seen_announcement_at` + tRPC router + TopBar widget + slide-out panel (~3 days)
- PR PF4.2: admin authoring UI under `/admin/announcements` (~1 day)

**Dependency:** Stream PF1 runs alongside everything else (independent). PF2's `/admin/feedback` and PF4's `/admin/announcements` are stub pages that get rolled into the proper Admin destination in the Analytics + Admin handoff.

---

## Open questions

None. All defaults locked from the brainstorm.

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/handoffs/code-tab-legal-baseline.md` — cookie_consent table this handoff respects.
3. `04_architecture/adrs/0014-pii-boundary.md` — feedback widget context capture constraints.
4. `04_architecture/adrs/0007-path-a-vs-b.md` — adapter discipline (Sentry is an exception per ADR-00XX).
5. `04_architecture/adrs/0015-notifications-comments-activity.md` — Markdown allowlist reused for announcement bodies.
6. https://docs.sentry.io/platforms/javascript/guides/nextjs/ — Sentry Next.js SDK reference.
7. https://docs.github.com/en/code-security/dependabot — Dependabot config reference.
8. https://www.rfc-editor.org/rfc/rfc9116 — security.txt spec.
9. https://github.com/niklasvh/html2canvas — screenshot library reference.
10. https://docs.react-joyride.com/ — tour library docs.

---

## What's NOT in this scope (deferred)

- **Full PostHog product analytics** — separate Analytics + Admin handoff.
- **Real admin destination** — separate Analytics + Admin handoff (this handoff stubs `/admin/feedback` and `/admin/announcements` with env-var allowlist).
- **Session replay** — folds into PostHog work in Analytics + Admin handoff.
- **In-app chat / live support** — out of scope; defer until support volume justifies.
- **Email digest / weekly summary** — separate Explore + Engagement handoff.
- **Status page (status.myresearchlab.app)** — defer until you have non-trivial uptime story to communicate; statuspage.io / Better Stack / Instatus options ~$30/mo when needed.
- **SOC 2 / formal pen test** — defer to enterprise-sales era.
- **Bug bounty program** — defer.
- **Granular feedback categorization** beyond the 4 kinds — defer; researcher behavior will tell you if you need more.
- **Feedback ↔ Linear/Jira sync** — defer; manual triage is fine at indie scale.
- **Localized tour copy** — English only for V1.
- **Per-role onboarding variants** (PI vs RA vs solo) — defer; the single tour is generic enough for V1.

When green: ping owner. Owner runs a smoke test (new throwaway signup → tour appears → completes → opens feedback widget → submits with screenshot → admin queue shows row + screenshot; opens announcement panel; verifies security.txt at /.well-known/); signs the audit log; tags the release.
