# Code tab handoff — V1.15 Participants destination (updated 2026-06-15 round 2)

> **V1.15 = Participants destination + Prolific integration.** The 5-sub-view destination per IA v0.3 (Connections / Open recruitment / Panels / Compensation / Quality) + first `RecruitmentAdapter` for Prolific + country/language picker in our app + Sona Systems "Coming in V1.17" placeholder. Closes the loop opened by V1.5's manual-URL-copy workflow. Estimated **~6 weeks Code-tab time** across 7 PR streams. **Originally planned as V1.14; reordered 2026-06-15 to ship V1.14 = Team first** (smaller scope; unblocks lab-collaboration workflows). Lands after V1.14 Team ships.
>
> **2026-06-15 round 2 updates:** Section P1b added (country + language picker in our app; "More filters →" deeplink to Prolific dashboard for everything else; owner-confirmed scope). Sona Systems placeholder card added to Section P2 Connections sub-view (visible but disabled; visual signal we plan to support Polish university subject pools in V1.17+). Open question #4 (eligibility filters) resolved.

The Participants destination has been in IA v0.3 since 2026-05-28 + listed in the LeftRail since V1.7.0 but inert (no `href`). V1.5 shipped the participant runtime + `recruitment_session` table + manual URL copy workflow ("Hanna pastes the URL into Prolific by hand"); V1.6 shipped attention checks + demographics blocks; V1.7+ shipped the full review network. The piece that's been waiting since V1.5: real recruitment provider integrations + a researcher-facing destination to manage participants across studies.

---

## What's in place today (don't rebuild)

| Component | What's there | Where |
|---|---|---|
| `recruitment_session` table | Per-study recruitment-window with status (open / paused / closed), target_n, current_n | `server/db/schema.ts` |
| `response` table | One per participant attempt; `external_pid` field is the opaque key from a provider (Prolific PID, etc.); `client_metadata jsonb` field exists but per ADR-0014 is intentionally never populated | `server/db/schema.ts` |
| `/take/[studyId]/[sessionId]/[questionIndex]` runtime | Participant-facing per-question SSR routes per ADR-0013 | `app/(take)/` |
| Open / pause / close recruitment | `studies.openRecruitment` / `pauseRecruitment` / `closeRecruitment` tRPC | `server/trpc/routers/studies.ts` |
| Manual URL copy on Run stage | Researcher copies recruitment URL into Prolific manually | Run stage UI |
| Attention check + demographics blocks | V1.6 modules; per-response attention check pass/fail tracked | `server/modules/registry.ts` |
| Rate limiter on `/take/*` | Upstash; closes participant-runtime security review #9 | `server/adapters/ratelimit.upstash.ts` |
| `RegistryAdapter` pattern (for OSF) | ADR-0005; vendor-isolated; AES-256-GCM token encryption | `server/adapters/registry.osf.ts` |
| LeftRail "Participants" entry | Visible but inert (no `href` per `left-rail.tsx`) | `components/chrome/left-rail.tsx` |

## What's missing (the V1.14 build)

- The `/participants` route + 5 sub-view sub-nav
- `RecruitmentAdapter` interface generalizing the recruitment-provider concept (mirrors `RegistryAdapter` from ADR-0005)
- Prolific provider adapter (first real recruitment provider) — create-study / list-submissions / approve-reject / bonus-payments
- Webhook handler for Prolific events
- Background polling job (fallback for missed webhooks)
- New tables: `panel`, `panel_member`, `recruitment_provider_connection`, `provider_submission`, `payout_record`, `quality_flag`
- 5 sub-view UIs (Connections / Open recruitment / Panels / Compensation / Quality)
- Connect Prolific OAuth flow + per-researcher token storage (encrypted, same pattern as OSF)
- PII discipline preserved throughout — `external_pid` stays the only identifier; never persist names/emails/IPs/UA

---

## PII discipline (read this before designing anything)

Per ADR-0014 (response data model + minimum viable conditioning) and V1.5 owner-confirmed: **participant PII is server-blind in our database.** This is methodologically + legally important and the Participants destination must NOT regress it.

**What's safe to store + display:**

- `external_pid` (Prolific PID, CloudResearch ID, etc.) — opaque to us; we don't know whose Prolific account this is. Acceptable as the only identifier.
- Per-PID aggregates: did they complete? attention-check result? time to complete? condition assigned?
- Provider-facing actions: approve / reject submission, send bonus, exclude from future studies. All via `external_pid` only.

**What we MUST NOT store:**

- Real names. (If Prolific exposes a participant's display name on their side, we don't fetch + persist it.)
- Email addresses.
- IP addresses. The `/take/*` runtime never captures or persists IP per the V1.6 security review.
- User agents beyond a coarse one-way-hashed bucket already used for the IP-bucket rate-limiter — and even that lives only in Upstash key space, never in Postgres.
- Demographic responses joined to PIDs at the participant-PII level. The `demographics` block (V1.6) collects age/gender/country as response data, but THAT data lives keyed to `response.id` (server-minted ULID), NOT to a person. The Panels sub-view shows demographics ranges in aggregate, never per-person.
- Anything that could re-identify a participant by joining our data to Prolific's profile.

**Why this matters:** the value proposition of MRT is that researchers can confidently say "we have no participant PII" in their IRB protocols. Cross-workspace researchers, journal reviewers, and ethics boards all rely on this. Breaking it would be a methodological regression + would push us into GDPR-DSAR territory for every participant ever.

**ADR-0014 amendment** (small): formalize the Participants destination's PII boundary — the destination renders aggregate + per-PID-with-opaque-ID data only; provider-side PII (names, emails, demographics-Prolific-has-from-its-own-onboarding) stays on the provider's side. Researchers needing per-person PII contact Prolific directly via their dashboard; our destination doesn't surface it even if the provider API would technically return it.

---

## Section P1 — RecruitmentAdapter pattern + ADR-0037

Foundational. Everything downstream depends on this. Ship first.

### The pattern

Mirrors `RegistryAdapter` from ADR-0005 (OSF). Per-vendor adapter implementing a single typed interface; vendor SDK imports isolated to one file per ADR-0007.

```ts
// server/adapters/recruitment.ts
export interface RecruitmentAdapter {
  // Connection management
  getAuthorizeUrl(opts: { state: string; redirectUri: string }): string;
  completeConnection(opts: { code: string; redirectUri: string }):
    Promise<{ accessToken: string; refreshToken?: string;
              expiresAt?: Date; providerUserId?: string }>;
  refreshConnection?(refreshToken: string):
    Promise<{ accessToken: string; refreshToken?: string;
              expiresAt?: Date }>;
  disconnect(accessToken: string): Promise<void>;

  // Study lifecycle on the provider side
  createStudy(opts: {
    accessToken: string;
    title: string;
    description: string;
    recruitmentUrl: string;   // our /take URL
    targetN: number;
    reward: { amount: number; currency: 'USD' | 'EUR' | 'GBP' };
    eligibility?: { country?: string[]; language?: string[]; /* … */ };
  }): Promise<{ providerStudyId: string; providerStudyUrl: string }>;

  publishStudy(opts: { accessToken: string;
                       providerStudyId: string }): Promise<void>;
  pauseStudy(opts: { accessToken: string;
                     providerStudyId: string }): Promise<void>;
  closeStudy(opts: { accessToken: string;
                     providerStudyId: string }): Promise<void>;

  // Submissions (per-participant attempts on the provider's side)
  listSubmissions(opts: { accessToken: string;
                          providerStudyId: string }):
    Promise<ProviderSubmission[]>;
  approveSubmission(opts: { accessToken: string;
                            submissionId: string }): Promise<void>;
  rejectSubmission(opts: { accessToken: string;
                           submissionId: string;
                           reason: string }): Promise<void>;
  sendBonus(opts: { accessToken: string;
                    submissionId: string;
                    amount: number;
                    reason: string }): Promise<void>;

  // Webhook signature verification (provider-side push)
  verifyWebhookSignature(opts: { rawBody: string;
                                  signature: string }): boolean;
}

export type ProviderSubmission = {
  submissionId: string;       // provider's ID for this attempt
  externalPid: string;        // the participant's opaque ID on the provider
  status: 'started' | 'submitted' | 'approved' | 'rejected' | 'timed-out';
  startedAt: Date;
  completedAt?: Date;
  // NO names, emails, IPs — provider-side PII stays on provider
};
```

### Prolific implementation

File: `server/adapters/recruitment.prolific.ts`. The ONLY file importing Prolific SDK types. Lock-in inventory gets a Prolific row.

- Auth: Prolific uses OAuth 2.0 + personal access tokens. Per the OSF precedent (ADR-0005 PAT fallback), support BOTH OAuth flow AND PAT paste for cases where OAuth fails (localhost dev or Prolific OAuth flakiness).
- API base: `https://api.prolific.com/api/v1/`
- Headers: `Authorization: Bearer <token>`
- Endpoints used:
  - `POST /studies` — create
  - `POST /studies/{id}/transition` (action=publish/pause/stop) — lifecycle
  - `GET /studies/{id}/submissions` — list
  - `POST /submissions/{id}/transition` (action=approve/reject) — decisions
  - `POST /submissions/{id}/bonus-payments` — bonus
  - Webhook: Prolific posts to a configured URL when submissions complete

### CloudResearch as a future adapter (defer to V1.14.1)

Same interface; different vendor. Don't build for V1.14.0; just keep the adapter interface generic enough that a second implementation drops in without changes.

### Token storage

Reuse V1.5's `registry_connection` pattern (AES-256-GCM via `TOKEN_ENCRYPTION_KEY`) — extend OR mirror to a new `recruitment_provider_connection` table. Cleaner to mirror because the semantics differ (recruitment connections are per-researcher-per-workspace whereas OSF is per-researcher-globally).

### ADR-0037 — RecruitmentAdapter pattern

Locks: adapter interface; vendor file isolation; PII boundary (adapter promises NEVER to return names/emails/IPs); webhook signature verification contract; token rotation policy mirroring OSF's. References ADR-0005, ADR-0007, ADR-0014.

### Estimated work

~1 week (interface ~1 day; Prolific impl ~3 days; tests via MSW-mocked Prolific ~1 day).

---

## Section P1b — Country picker + basic eligibility filters in our UI (owner-confirmed 2026-06-15, ~2 days)

Owner clarification 2026-06-15: **the researcher must be able to pick which country participants come from in OUR app** (not punt entirely to Prolific dashboard). Country is the most common filter + cheap to surface in our flow; more advanced filters (age range, profession, demographics, employment status) stay punted to the Prolific dashboard.

**Where it lives in our UI:**

In the existing **Run stage** (V1.5 ships this) when a Prolific connection is selected as the recruitment source, the Run-stage form gains:

- **Country selector** — multi-select dropdown over ISO 3166-1 alpha-2 country codes. Defaults to "All Prolific-supported countries." Researcher picks 1 or more (`['PL']` for Polish-only, `['PL', 'CZ', 'SK']` for Central European, etc.). Searchable; flag icons; group by continent.
- **Primary language selector** — multi-select over ISO 639-1 language codes. Defaults to "Any." Useful when the study is in Polish only and you want to exclude non-Polish-speaking panelists.
- **"More eligibility filters →"** link — opens Prolific's eligibility editor in a new tab (deeplink to the Prolific dashboard's per-study eligibility page). For age range, profession, gender, employment status, etc. — Prolific has 100+ filters that change over time; we don't try to mirror them, but the link makes it one click to go set them.

When the researcher clicks "Open recruitment" (existing V1.5 mutation), the eligibility object is sent to Prolific via the adapter's `createStudy({ ..., eligibility: { country: ['PL'], language: ['pl'] } })`. The adapter maps our shape to Prolific's `eligibility_requirements` API field.

**Data:**

- New field on `recruitment_session.metadata jsonb` (existing column): `eligibility: { country: string[], language: string[] }`. No schema change needed; metadata is already jsonb per V1.5.
- The Prolific adapter's `createStudy` reads this and forwards to Prolific's API.

**ISO country list source:**

- Bundled in `lib/iso-countries.ts` (curated list of ~200 country codes + display names + flag emojis). No vendor; static JSON.
- Filter to Prolific-supported countries when Prolific is the active provider (Prolific covers ~40 countries; we read this from a curated `prolific.supportedCountries` constant + refresh annually).

**Estimated work: ~2 days** (country/language picker components + Run-stage integration + adapter mapping + tests).

**Why this scope:** owner answer locked the question — country selection IS in our app; everything else stays on the provider side. Keeps the UI clean (10 fields not 100) while supporting the single most common filter researchers care about.

---

## Section P2 — Connections sub-view (provider OAuth, ~3 days)

The simplest sub-view. Mirrors `/settings/account/connections` (the OSF connect surface from V1.5).

**Route:** `/participants/connections` (or sub-route under `/participants`)

**UI:**

- One card per recruitment provider:
  - **Prolific** (V1.15.0) — fully integrated; OAuth + PAT-fallback flow
  - **CloudResearch** (deferred to V1.15.1 if owner picks; otherwise V1.16+)
  - **Sona Systems** (owner-added 2026-06-15) — **"Coming in V1.17" placeholder card.** Renders with the Sona logo, brief description ("Polish university subject pools — credit-based recruitment for psychology students at UJ, UW, SWPS, AGH, etc."), disabled connect button, "Tell us if you want this prioritized" feedback link (mailto: or to-be-added feedback form). NOT functional — pure visual signal that we plan to support it. Useful for researchers at Polish universities to know we're aware of Sona + intending to support it.
- For Prolific: dual path — "Connect with Prolific" (OAuth) + "Or paste a Personal Access Token" (per ADR-0005 PAT precedent). **Owner's V1.7.0 OSF setup verified Prolific is PAT-only** for third-party integrations; OAuth flow may be dropped during build if Prolific's API doesn't expose it.
- Per-connection metadata: connected at, provider user identifier, last sync timestamp
- Error state: if a connection's token is invalid/expired, show "Reconnect" with a clear error message

**Data:**

- New table: `recruitment_provider_connection (id, workspace_id, user_id, provider, access_token_encrypted, refresh_token_encrypted, expires_at, provider_user_id, status, created_at, updated_at)` — workspace-scoped per researcher; same token-encryption pattern as `registry_connection`.
- `provider` enum: `prolific` for V1.15.0; extends to `cloudresearch` / `sona` as those land.
- tRPC: `recruitment.connections.list()` / `connect()` / `disconnect()` / `reconnect()`

**Route handlers:**

- `app/api/recruitment/prolific/connect/route.ts` — OAuth initiation; sets CSRF cookie (OR PAT-paste flow if OAuth unavailable)
- `app/api/recruitment/prolific/callback/route.ts` — OAuth callback; exchanges code; encrypts + stores token

---

## Section P3 — Open recruitment sub-view (~1 week)

**Route:** `/participants/open-recruitment`

**Question it answers:** "Across all my studies right now, what's happening with recruitment on the provider side?"

Overlaps slightly with V1.13.0's Studies · Running tab — distinction:

- **Studies · Running tab** = workspace-scoped operational view of recruitment HEALTH (response rates, drop-off, condition balance, alerts). Focused on data collection.
- **Participants · Open recruitment** = provider-side view (Prolific submissions in flight, approval queue, payment status, provider-side errors). Focused on the provider integration.

Both are useful; they answer different questions. Researchers managing Prolific studies will live in Participants · Open recruitment.

**UI:**

- Per-study card (only studies with a provider connection — manually-recruited studies don't appear here):
  - Study title + provider badge (Prolific / CloudResearch)
  - Provider study status: drafted / published / paused / completed
  - Submissions: started / submitted-awaiting-approval / approved / rejected / timed-out (counts)
  - Approval queue size + age of oldest pending
  - Cost so far (sum of approved-submission rewards + bonuses)
  - Quick actions: Pause / Resume / Stop / "Approve all auto-eligible" / "Open Prolific dashboard" (deeplink)
- Filter: by provider / by status / by approval-queue-size
- Empty state: "No provider-connected studies yet. [Connect Prolific →]"

**Data:**

- `provider_submission` table — one row per Prolific submission we know about. Fed by webhooks + polling.
  - Columns: id, workspace_id, experiment_id, recruitment_session_id, provider, provider_study_id, submission_id, external_pid, status, started_at, completed_at, decided_at, decided_by_user_id, reward_amount_cents, currency, raw_payload jsonb
  - Indexes: (experiment_id, status); (workspace_id, status); (external_pid)
- tRPC: `recruitment.openRecruitment.list({ filters })` aggregates the live data

**Linking to our response data:**

When a Prolific submission completes, the participant has presumably also finished our `/take/*` flow → there's a row in our `response` table with `external_pid` matching the Prolific PID. The Open recruitment view joins these: per submission, show whether our response_item exists + attention-check passed + completion time on our side.

---

## Section P4 — Panels sub-view (~1 week)

**Route:** `/participants/panels`

**Question it answers:** "Who have I recruited in the past, and can I re-recruit (or exclude) them in a new study?"

A panel = a researcher-curated cohort of participants. Identified only by `external_pid` per the PII boundary. Useful for:

- **Excluding past participants** from a new study (don't re-recruit someone who's done a related study; avoid cross-contamination)
- **Re-recruiting** specific participants (longitudinal studies; follow-up surveys; high-quality participants for a new wave)
- **Building cohorts** based on attention-check pass rate, completion time, condition assigned

**UI:**

- Panel list: name + description + member count + last updated + per-panel actions (Edit / Delete / Use in new study)
- Click a panel → member list: PID (truncated for display) + first-recruited-in-study + completion status + attention-check pass rate + tags
- "Create panel" flow: name + description + initial members (from a completed study's responses, filtered by completion / attention-check / condition)
- "Use in new study" → opens the New Study modal with the panel pre-attached as either "include" (recruit only from this panel) OR "exclude" (don't recruit anyone in this panel)

**Data:**

- `panel (id, workspace_id, name, description, created_by_user_id, created_at, updated_at)` — workspace-scoped
- `panel_member (id, panel_id, external_pid, source_study_id, source_response_id, added_at)` — composite unique on (panel_id, external_pid)
- Provider-side eligibility: when creating a Prolific study with "exclude panel X", the provider study's `eligibility_requirements` gets the panel members' Prolific IDs. Prolific supports this directly via their API.

**Privacy note:**

Panels are workspace-scoped. Cross-workspace panel sharing is a future scope question (collaborative research consortia might want to share a "verified-attentive participants" panel). Per ADR-0014's privacy stance: cross-workspace panel sharing requires explicit per-participant consent — defer the full design to V1.14+ or V1.15.

---

## Section P5 — Compensation sub-view (~1 week)

**Route:** `/participants/compensation`

**Question it answers:** "How much have I spent on participants, broken down how?"

We don't handle the actual money flow — Prolific charges the researcher directly. We track spend metadata for the researcher's awareness + budgeting.

**UI:**

- KPI strip: total spend (last 30d / all time) + total participants paid + average cost per participant + remaining-budget (if workspace budget set)
- Per-study spend: study title + provider + N participants × reward + bonuses + total
- Per-month chart: spend over time (last 6 months)
- Per-currency breakdown (researchers running studies in multiple currencies)
- Recent payouts: scrolling list of last 50 approve-or-bonus events with timestamp + study + amount + decided-by user
- Optional: workspace-level monthly budget (owner-set; alerts when crossed)

**Data:**

- `payout_record (id, workspace_id, experiment_id, provider_submission_id, kind: 'reward' | 'bonus', amount_cents, currency, decided_by_user_id, decided_at, raw_payload jsonb)` — append-only; one per approval or bonus
- `workspace.payout_budget (workspace_id, monthly_limit_cents, currency, alert_threshold_pct)` — optional; owner-set
- tRPC: `recruitment.compensation.summary()` / `byStudy()` / `byMonth()` / `recentPayouts()`

**What we DON'T do:**

- We DON'T process payments. Prolific does that.
- We DON'T store credit card details, bank info, or any financial PII about the researcher.
- We DON'T expose payment-method details from the provider.
- Researchers manage their actual money in the Prolific dashboard; we mirror just the spend events for unified visibility.

**Owner-only widgets** (per the dashboards handoff pattern): workspace budget settings are owner-only. Spend records are viewable by any workspace member.

### ADR-0038 — Compensation tracking + financial-data sensitivity

Locks: we mirror provider spend events; we never process money; budgets are owner-set; financial PII (researcher's payment methods, billing addresses) stays on the provider side. Pairs with ADR-0014 PII boundary semantics applied to the researcher.

---

## Section P6 — Quality sub-view (~1 week)

**Route:** `/participants/quality`

**Question it answers:** "Which submissions need my decision before I pay (or reject)?"

Cross-study queue of flagged sessions. Researchers approve / reject / bonus from here without jumping between studies.

**UI:**

- Cross-study queue: per flagged session, show study + PID + flag reason(s) + age + response preview + Approve / Reject / Bonus / Snooze actions
- Flag reasons (multi-flag possible):
  - **Attention check failed** (V1.6 attention-check block result)
  - **Suspiciously fast completion** (< 30% of study median time)
  - **Suspiciously slow completion** (> 300% of study median time; might be afk → completed)
  - **All-same-response pattern** (likert / multiple-choice gave the same answer to every question)
  - **Open-ended response looks like spam** (very short / placeholder text / non-relevant)
  - **Duplicate PID** (rare; Prolific should prevent this but we double-check)
- Bulk actions: select multiple → bulk approve / bulk reject with shared reason
- Resolved sessions: archived to a "Resolved" sub-tab; not deleted (audit trail)
- Per-flag policy: which flag types auto-approve (researcher sets workspace policy) — e.g., "auto-approve everything except attention-check failures"

**Data:**

- `quality_flag (id, workspace_id, experiment_id, provider_submission_id, response_id, flag_kind, severity: 'low' | 'medium' | 'high', auto_detected: boolean, detected_at, resolved_at, resolved_by_user_id, resolution: 'approved' | 'rejected' | 'bonus' | null, resolution_note text, raw_payload jsonb)`
- Flag-detection runs as a background job after each `/take/*` completion + at recruitment-close time
- Researcher can ALSO manually flag a session for later review

**Resolution flow:**

1. Researcher resolves a flag → calls `recruitment.quality.resolve({ flagId, resolution, note })`
2. Server-side: marks the flag resolved + calls the provider adapter to approve/reject the corresponding submission
3. Approval triggers `payout_record` creation (Section P5)
4. Rejection sends a rejection notice to the participant via the provider (the researcher provides a reason; Prolific notifies the participant)

### ADR-0039 — Quality flagging semantics

Locks: flag detection rules; flag severity tiers; who can resolve (any workspace member with write role? owner-only? configurable per workspace); audit trail (resolutions are append-only); auto-resolution policy semantics.

---

## Section P7 — Webhooks + background jobs (~1 week)

Provider events arrive via two paths: real-time webhook + polling fallback.

### Webhook handler

- Route: `app/api/recruitment/[provider]/webhook/route.ts`
- For Prolific: receives `submission.started`, `submission.submitted`, `submission.timed_out`, etc.
- Verifies signature using `RecruitmentAdapter.verifyWebhookSignature` (per-vendor)
- Inserts/updates `provider_submission` rows
- Triggers downstream effects: enqueue quality-flag detection job; update workspace activity stream

### Polling fallback (Inngest job)

- Webhooks can fail or be delayed; polling guarantees eventual consistency.
- Inngest job `recruitment.poll-provider-status` runs every 5 minutes per active recruitment session.
- For each open `recruitment_session` with a provider study attached: call `RecruitmentAdapter.listSubmissions()`; reconcile with `provider_submission` rows.
- Idempotent: same submission seen twice doesn't duplicate; just updates status.

### Quality-flag detection job

- Inngest job `recruitment.detect-quality-flags` runs after each `/take/[studyId]/[sessionId]/complete` route hits + at recruitment-session close time.
- Computes the 6 flag types above against the response data; creates `quality_flag` rows where applicable.
- Researcher gets a workspace activity event "3 sessions flagged in Study X" (per ADR-0015 activity events).

---

## Section P8 — Participants destination shell (~3 days)

The thin destination wrapper everything else mounts inside.

**Route:** `app/(app)/(workspace)/participants/page.tsx` redirects to default sub-view (`/participants/connections` if no connections; `/participants/open-recruitment` if any active).

**Layout:**

- Same workspace-mode chrome (TopBar + LeftRail + right panel)
- Sub-nav strip at the top of the work surface: **Connections / Open recruitment / Panels / Compensation / Quality**
- Each sub-view is a child route
- LeftRail entry gets a real `href: "/participants" as Route` (replaces the inert one)

**Wireframe gate:** `03_design/wireframes/participants-destination.md` + one per sub-view.

---

## Sequencing PRs (~6.5 weeks total — V1.15)

**Stream P1 — Foundation (~1 week):**
- PR P1.1: `RecruitmentAdapter` interface + Prolific impl + ADR-0037 (~3 days)
- PR P1.2: `recruitment_provider_connection` table + token encryption + Connect/Callback routes (~2 days)
- PR P1.3: Participants destination shell + sub-nav + Connections sub-view (~2 days)

**Stream P2 — Open recruitment + provider submissions (~1.5 weeks):**
- PR P2.1: `provider_submission` table + webhook handler + signature verification (~2 days)
- PR P2.2: Inngest polling job + reconciliation (~2 days)
- PR P2.3: Open recruitment sub-view UI + per-study cards + quick actions (~3 days)

**Stream P3 — Panels (~1 week):**
- PR P3.1: `panel` + `panel_member` tables + tRPC CRUD (~2 days)
- PR P3.2: Panels sub-view UI + create-from-study-responses flow + use-in-new-study integration (~3 days)

**Stream P4 — Compensation (~1 week):**
- PR P4.1: `payout_record` + budget tables + tRPC procedures (~2 days)
- PR P4.2: Compensation sub-view UI + KPI strip + per-study + per-month + recent payouts + budget settings (~3 days)
- PR P4.3: ADR-0038 + wireframe + tests (~1 day)

**Stream P5 — Quality (~1 week):**
- PR P5.1: `quality_flag` table + 6 flag-detection rules + Inngest detect job (~3 days)
- PR P5.2: Quality sub-view UI + cross-study queue + resolve flow + bulk actions (~2 days)
- PR P5.3: ADR-0039 + wireframe + workspace-policy settings (~1 day)

**Stream P6 — Polish + close-out (~0.5 weeks):**
- PR P6.1: cross-sub-view tests + e2e (Hanna connects Prolific → creates study → fake submissions arrive → approves → payout recorded → quality flag resolved) (~2 days)
- PR P6.2: ADR-0014 amendment for Participants destination PII boundary; lock-in inventory updated with Prolific row (~1 day)

All streams largely independent except Stream P1 (Connections) which gates the rest (no connection = no Prolific calls). Code tab can land P3 (Panels) + P5 (Quality) in parallel with P2/P4.

---

## ADRs needed (Code tab drafts as each Stream nears)

- **ADR-0037 — RecruitmentAdapter pattern.** Per-vendor adapter interface; isolation; PII contract (adapter promises never to return names/emails/IPs); webhook signature verification; token rotation policy mirroring OSF.
- **ADR-0038 — Compensation tracking + financial-data sensitivity.** We mirror spend events; we never process money; workspace budgets are owner-set; financial PII stays on provider side.
- **ADR-0039 — Quality flagging semantics.** Flag detection rules + severity tiers; who can resolve; auto-resolution policy; audit trail append-only.
- **ADR-0014 amendment** — Participants destination PII boundary. Aggregate + opaque-PID only; never re-identify; provider-side PII stays on provider.

---

## Wireframes needed (phase-gate per CLAUDE.md)

- `participants-destination.md` (Section P8 — sub-nav scaffold)
- `participants-connections.md` (P2)
- `participants-open-recruitment.md` (P3)
- `participants-panels.md` (P4)
- `participants-compensation.md` (P5)
- `participants-quality.md` (P6)

---

## Open questions for owner

1. **CloudResearch as a second provider in V1.14.0, or defer to V1.14.1?** Cost = ~1 week additional. CloudResearch is more US-focused vs Prolific's UK/global. (Recommendation: Prolific only in V1.14.0; CloudResearch is a copy-paste of the adapter pattern in V1.14.1.)
2. **Quality-flag resolution: who can resolve?** Author only / any workspace write-member / configurable per workspace? (Recommendation: any write-member by default; configurable via Settings.)
3. **Cross-workspace panel sharing?** Researchers in consortia want to share "verified-attentive participants." Privacy-sensitive. (Recommendation: defer; V1.14 ships workspace-scoped only; cross-workspace is a future ADR.)
4. ✅ **Eligibility filters — RESOLVED 2026-06-15:** **country + language picker in our app** (most common filters; cheap to surface; researchers care about it); **all other filters punt to Prolific dashboard** via a "More eligibility filters →" deeplink. New Section P1b specs the country/language picker UI in the Run stage. Adds ~2 days.
5. **Workspace budget alerts: just an in-app alert or also email?** (Recommendation: in-app + Activity event for V1.14; email digest when V1.7 deferral lands.)
6. **Studies · Running tab vs Participants · Open recruitment overlap — both ship?** They answer different questions (recruitment health vs provider status) but might confuse researchers. (Recommendation: ship both; differentiate clearly in UI; tab labels lean into "Live data" vs "Provider sync.")
7. **Auto-approval threshold: what flag-types should auto-approve by default?** (Recommendation: nothing auto-approves by default; researcher explicitly opts into auto-approval policies per workspace.)

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/adrs/0005-osf-integration.md` — the precedent RegistryAdapter pattern.
3. `04_architecture/adrs/0014-response-data-model-and-conditioning.md` — the PII boundary you're maintaining.
4. `04_architecture/adrs/0007-path-a-vs-b.md` — vendor lock-in lens applied to Prolific.
5. `04_architecture/lock-in-inventory.md` — add Prolific row at Stream P1 build time.
6. `05_app/server/adapters/registry.osf.ts` — the implementation precedent for Prolific.
7. `05_app/server/db/schema.ts` — extend with the 6 new tables.
8. `05_app/server/trpc/routers/studies.ts` — see how recruitment_session + response are queried today; the new Participants tRPC procedures will join into these.

---

## What's NOT in V1.14 (still deferred)

- **CloudResearch + MTurk + Pavlovia** as providers (V1.14.1+).
- **Cross-workspace panel sharing** (V1.15+; needs explicit per-participant consent infrastructure).
- **Researcher payment-method management** (we never handle money).
- **Demographic eligibility filters beyond country + language** — country + language ARE in our app per Section P1b (owner-confirmed 2026-06-15); all other Prolific filters (age range, profession, gender, employment status, ~100 others) punt to Prolific dashboard via the "More filters →" deeplink.
- **Participant-side surfaces** — Prolific handles the participant's experience of finding + accepting studies; we only handle the experiment-run after the participant clicks our `/take` URL.
- **AI-assisted quality detection** — V2.0 AI features could enhance the spam/AI-generated detection on open-ended responses. V1.15 ships rule-based detection only.
- **Sona Systems real integration** — V1.15 ships a "Coming in V1.17" placeholder card only (visual signal in Connections sub-view). Real Sona adapter is V1.17+ if Polish university subject pools become an actual user request. The placeholder is intentionally aware-but-disabled — clicking the "Tell us if you want this prioritized" feedback link in the placeholder card is the user-research signal we'll use to decide whether to fast-track Sona.
- **Polish-specific managed-service panels** (Ariadna / TGM Research / Intra Research / Badanie-Opinii / Maison & Partners) — these are managed-service models without public APIs; not RecruitmentAdapter candidates. If owner needs them, V1.16+ could add a generic "Manual / external panel" connection type (researcher pastes `/take` URL into the panel's brief; we track responses with manually-assigned `external_pid`). Mirrors today's manual workflow with a small UI improvement.

When green: ping owner. Owner runs `npm run deploy:verify` after the V1.15 deploy + does a manual Prolific live test (create a tiny test study with N=2, recruit themselves + a colleague, walk through approval); signs the audit log; tags `v1.15.0`.
