# ADR 0081 — Engagement email — Resend adapter + admin-controlled digest & nudge

- **Status:** accepted
- **Date:** 2026-06-28
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** email, engagement, adapters, jobs, admin

## Context

EE3 of the Explore + Engagement + Docs handoff is the engagement email layer: a
**weekly digest** (workspace activity) and a **return-nudge** (re-engage dormant
researchers). The owner's direction (2026-06-28): build both, but ship them
**ready, not running** — *"I want them ready but probably not use from the get
go"* — with **full control from the admin panel**: per-feature on/off, schedule,
editable copy, and a **test-send**.

Email is greenfield (no EmailAdapter, no Resend). Inngest cron is already wired
(recruitment/OSF sweeps), and `RESEND_API_KEY` + `EMAIL_FROM` are now provisioned.
There is no global app-settings table yet (only per-workspace `workspace_ai_settings`).

Two constraints shape the design: (1) the features must not send anything until an
operator turns them on — a global kill switch defaulting OFF; (2) per ADR-0007 the
Resend SDK must not leak into feature code, and per ADR-0014 participant data is
never emailed (these are researcher-facing operator emails only).

## Options considered

### Option A — EmailAdapter (Resend HTTP) + a global `email_settings` singleton, default OFF; cron workers gated on it (chosen)

- `EmailAdapter` interface + `email.resend.ts` (Resend REST via `fetch`, no SDK
  dependency). A one-row `email_settings` table holds enable flags + schedule +
  copy, edited only via `adminProcedure`. Two Inngest cron functions
  (digest weekly, nudge daily) whose bodies **no-op when the global flag is off**.
  Admin `/admin/email` page drives it + a test-send.
- **Pros:** exactly the asked-for control; nothing sends until enabled; the cron
  can be registered now and harmlessly idle; adapter keeps Resend swappable; no new
  npm dependency (HTTP). Per-user opt-out + last-active tracking land as small
  additive columns.
- **Cons:** a new table + 4 user columns + migration; a hot-path write to track
  `last_active_at` (throttled to ≤1/12h, guarded in JS off the already-loaded row).

### Option B — Per-workspace email settings (like `workspace_ai_settings`)

- **Pros:** mirrors an existing pattern; teams self-serve.
- **Cons:** the owner asked for **admin** (platform) control, not per-workspace; a
  global kill switch is the requirement. Per-workspace tuning can come later.

### Option C — Use the Resend SDK + a feature-flag env var instead of a table

- **Pros:** simplest flag.
- **Cons:** env flags aren't editable from the admin panel (no copy/schedule
  editing, no test-send), and an SDK dependency is avoidable. Rejected.

## Decision

We will add an **`EmailAdapter`** (interface in `server/adapters/email.ts`,
Resend REST impl in `email.resend.ts` — no SDK, env-gated no-op without
`RESEND_API_KEY`), a **global one-row `email_settings`** table (enable flags +
schedule + editable subject/intro copy, default **disabled**), and **two Inngest
cron workers** (`email-weekly-digest`, `email-return-nudge`) whose bodies **return
early when their feature flag is off**. Operators control everything from a new
**`/admin/email`** page (`adminProcedure` get/update + **test-send to the
operator's own address**). Per-user `email_digest_opted_out` (Settings toggle) +
`last_active_at` / `digest_last_sent_at` / `nudge_last_sent_at` columns support
opt-out + dormancy + cooldown. `last_active_at` is updated in `protectedProcedure`,
throttled to at most once per 12h off the already-loaded `dbUser` row.

Digest content reuses the existing `notification` rows (last 7 days) — no
participant data leaves the system (ADR-0014); recipients with nothing new are
skipped. The crons are registered immediately but, with the flags off by default,
**send nothing until an operator flips them on**.

## Consequences

- **Easier:** turning engagement email on/off, retiming it, and rewording it is a
  no-deploy admin action; a test-send de-risks the first real send; swapping Resend
  for another ESP is one adapter file.
- **Harder:** a hot-path `last_active_at` write (mitigated by the 12h throttle); a
  new settings surface + cron bodies to maintain; copy lives in the DB (operator
  can break formatting — bounded by length limits + a Markdown render).
- **Committed to:** the global-flag-gates-the-worker contract (a cron that does
  nothing when off); the `EmailAdapter` boundary; env names `RESEND_API_KEY` +
  `EMAIL_FROM`; operator-only email (no participant addresses, ADR-0014).
- **Precluded from:** per-workspace email tuning (deferred); transactional email
  (this ADR is engagement only); a tokenized one-click unsubscribe route — for now
  opt-out is the Settings toggle + the email links there (a tokenized unsubscribe
  is a noted follow-up).

## Revisit triggers

- Engagement email graduates from "ready" to "always on" and needs per-workspace
  controls or segmentation → promote `email_settings` to per-workspace.
- We need transactional email (receipts, invites) → the same `EmailAdapter`
  carries it, but templating/deliverability get their own ADR.
- Resend deliverability/cost issues → swap the adapter impl (Sendgrid/SES/SMTP).
- A one-click unsubscribe becomes a compliance requirement → add the tokenized route.

## References

- EE3 of `04_architecture/handoffs/code-tab-explore-engagement-docs.md`.
- ADR-0007 (adapter discipline) · ADR-0014 (PII — operator email only) ·
  ADR-0015 (notifications / Inngest) · ADR-0075 (adminProcedure).
- Code: `server/adapters/email.ts` + `email.resend.ts`, `server/email/settings.ts`,
  `server/jobs/email-weekly-digest.ts` + `email-return-nudge.ts`,
  `app/api/inngest/route.ts` (crons), `server/trpc/routers/admin.ts` (email
  settings + test-send), `app/admin/email/page.tsx`, migration `0049_*`.
- Lock-in inventory: Resend (EmailAdapter) row. Adapters README: EmailAdapter row.
