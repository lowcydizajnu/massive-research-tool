# Wireframe spec — Studies — Running tab

- **Serves user flow:** [Hanna runs and reads results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

A **Running** sub-tab inside the Studies destination — the operational view that answers "is my data collection going well *right now*, and does anything need attention?" Not strategic (that's the workspace dashboard); this is the live ops board for currently-recruiting studies. A tab, not a destination — recruitment management is a slice of Studies. Route: `/studies?tab=running`. Built on existing tables (`recruitment_session`, `response`, `condition`); no migration.

## Layout

The Studies destination shell, unchanged: the existing sub-nav (All / Mine / Drafts / Preregistered / Published / Replicating / Archived) gains **Running**. Selecting it replaces the study list with: a **KPI strip** on top, then a **recruitment table** (one row per recruiting study), then an **alert center** (rows needing attention). A row expands (or opens a right panel) into a per-study drill-down. Fixed layout (operational — not customizable; that's Stream F for the dashboards only).

## Content inventory

- **KPI strip** (`studies.runningOverview()`): recruiting studies / responses today / responses this week / studies needing attention (alert count).
- **Recruitment table** (`studies.runningList()`), one row per recruiting study:
  - title (+ condition count)
  - n / target (+ % bar)
  - last response time + a **stalled** flag ("no responses in 24h")
  - condition balance (smallest-condition n : largest-condition n) + an **imbalanced** flag (>20% skew)
  - status badge: **healthy / stalled / imbalanced / target reached**
  - quick actions: Pause / Resume / Stop (reuse `studies.setRecruitmentStatus`), View Run, View Results
- **Alert center**: the subset of rows in a non-healthy state, each phrased ("Study X: no responses in 24h"; "Study Y: condition imbalance — control 87 / treatment 34"; "Study Z: target reached — consider closing"). Derived from `runningList` (no separate query); client filters to alert rows. Mute/snooze deferred (no persistence yet — noted).
- **Per-study drill-down** (`studies.runningDetail({ studyId })`, deferred to a follow-up PR): per-block drop-off, per-condition distribution, est. time-to-target, recent anonymized completions. **Phase 1 ships the KPI strip + table + alerts; the drill-down is Phase 2.**

## States

- **Default** — KPI strip + table + alerts.
- **Loading** — skeleton rows; KPI strip placeholders.
- **Empty** — no recruiting studies: "Nothing recruiting right now — open recruitment from a study's Run stage." + link.
- **Partial / error** — a failed query shows an inline error + retry; the tab shell + sub-nav stay.
- **Refresh** — polls every 60s while the tab is visible (Page Visibility API pauses it in the background); cheap single aggregate. SSE push deferred.

## Interactions

- **Pause / Resume / Stop** (per row) — `studies.setRecruitmentStatus`; optimistic, `router.refresh()` after; the row's badge updates. Stop behind the existing inline confirm.
- **View Run / View Results** — navigate to that study's stage.
- **Tab switch** — `?tab=running` (URL-driven, server-rendered, shareable), matching the existing sub-nav filters.
- **Row expand** (Phase 2) — opens the drill-down.

## Edge cases

- **Many recruiting studies** — the table scrolls; KPIs summarize.
- **A study with one condition** — condition-balance column reads "—" (no imbalance possible).
- **Target not set** (`target_n` null) — show n only; no % bar; never flag "target reached".
- **Multiple versions live** — one row per study (dedupe by study, like `me.recruitingStudies`); counts pool across versions per ADR-0044 once that's wired into the list query (Phase 2; Phase 1 uses the open session's currentN).
- **Permissions** — workspace-scoped (`workspaceProcedure`); a viewer sees the table but the Pause/Stop actions are write-gated (hidden/disabled).

## Accessibility notes

- The table is a real `<table>` with header cells; status badges pair tone with text (not color-only); the % bar has its numeric value beside it.
- Polling updates use a polite live region for the KPI strip so screen-reader users hear "responses today: N" changes without a jarring full re-read.
- Row actions have accessible names ("Pause recruitment for {study}").

## Open questions

- Mute/snooze on alerts needs a small persistence store — deferred; Phase 1 shows alerts unmuted.
- Drop-off / completion-time / attention-check metrics (drill-down) need `response_item` analysis — Phase 2.
- Collection-rate (responses/day, 7d) + projected finish — include in `runningList` Phase 1 if cheap, else Phase 2. Leaning Phase 2 to keep the first query simple.
