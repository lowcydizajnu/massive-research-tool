# ADR 0050 — Recruitment state reconciliation (webhook + polling safety-net)

- **Status:** accepted
- **Date:** 2026-06-16
- **Deciders:** project owner, Claude
- **Tags:** runtime, recruitment, jobs

## Context

V1.15 Stream P2 created provider studies on Prolific and stored a coarse `metadata.provider.status` (`live`/`stopped`) that only ever changed when a researcher clicked **Stop** in our app. But a study's true state changes on the provider's side without us doing anything: Prolific auto-pauses a study at 100% recruitment, moves it to "awaiting review", or completes it. Likewise submissions arrive, get approved, time out. The Run-stage card (a7) reconciles on read (load / focus / 30s poll while live), which is correct but lazy — nobody sees an update unless a researcher happens to have the page open, and a study that finished overnight shows stale numbers until someone visits it.

We already have the pieces: `RecruitmentAdapter.getStudy` + `listSubmissions` (P2/a7), idempotent `provider_submission` upserts keyed on `(provider, submission_id)`, and a `BackgroundJobAdapter` (Inngest, ADR-0007) with a dev inline-fallback. The Prolific adapter also already implements `verifyWebhookSignature` (HMAC-SHA256 over the raw body, secret in `PROLIFIC_WEBHOOK_SECRET`). What's missing is a way to pull provider state without a human in the loop.

This ADR decides how recruitment state stays fresh server-side. It builds on ADR-0047 (RecruitmentAdapter), ADR-0014 (PII boundary — only the opaque `external_pid` is ever stored), and ADR-0007 (Inngest behind `BackgroundJobAdapter`; the serve handler is a boundary-only lock-in exception).

## Options considered

### Option A — Apply the webhook payload directly

- Trust the webhook body: parse the submission/status fields and write them straight to `provider_submission` / session metadata.
- **Pros:** one DB write, no extra provider API call.
- **Cons:** couples us to Prolific's exact payload shape (undocumented surface, varies by event type); a missed or out-of-order webhook leaves us permanently wrong; the payload may carry PII fields we'd have to be careful never to persist; hard to test against reality.

### Option B — Reconcile-by-refetch, triggered by webhook + a polling safety-net (chosen)

- The webhook is treated as a *cache-invalidation ping*, not a source of truth: verify its signature, extract the affected `providerStudyId`, and enqueue a job that **re-fetches** that study's submissions + status through the adapter (the same idempotent path the Run card uses). A cron job sweeps all still-recruiting studies every 10 minutes as a backstop for missed/duplicate/unsigned webhooks.
- **Pros:** the adapter is the single source of truth (one reconcile path, already tested); idempotent so duplicate/late webhooks are harmless; resilient to a webhook we never receive (polling catches it); zero new payload-shape coupling; PII boundary unchanged (we only ever call `listSubmissions`/`getStudy`, which already strip PII).
- **Cons:** one extra provider API round-trip per ping; polling spends a few API calls every 10 min while studies are live.

### Option C — Polling only (no webhook)

- Drop the webhook; rely solely on the 10-minute cron + on-read reconcile.
- **Pros:** simplest; no public ingress, no signature handling.
- **Cons:** up to a 10-minute lag on every state change even when the provider could have told us instantly; wastes API calls polling studies that didn't change.

## Decision

**We will reconcile recruitment state by re-fetching through the adapter, triggered by a signature-verified webhook ping and backed by a 10-minute polling sweep (Option B).** The webhook never mutates state itself — it verifies the HMAC signature, pulls the `providerStudyId` out of the payload, and enqueues `recruitment.reconcile-study`; the job (and the cron sweep) call the shared `reconcileProviderStudy` helper, which lists submissions + reads study status through the adapter and upserts idempotently. This keeps exactly one code path that can change our recruitment state, makes duplicate and missing webhooks both safe, and never widens the PII surface. The webhook is an optimization for latency; correctness rests on the idempotent reconcile + the polling backstop, so the feature is fully functional even before the owner registers the webhook in the Prolific dashboard.

Because background jobs and the webhook have no "current user", the reconcile helper selects a token by trying each active `recruitment_provider_connection` for the study's workspace until one succeeds (a Prolific PAT can only read studies its own account owns). The webhook route is public (signature is its auth) and lives at the route boundary, importing only `adapter.verifyWebhookSignature` + the job adapter — the same boundary-only exception pattern as Inngest's `serve()`.

> **Open item (confirm at registration):** the exact signature header name + signing scheme Prolific uses is provider-specific and must be confirmed against Prolific's webhook docs when the owner registers the endpoint. If it differs from HMAC-SHA256-over-raw-body, only `verifyWebhookSignature` changes — the reconcile path is unaffected, and polling keeps state fresh in the meantime.

## Consequences

- **Easier:** recruitment counts + status self-update without an open browser tab; one reconcile path to reason about and test; late/duplicate webhooks are no-ops.
- **Harder:** a small, steady stream of provider API calls from the cron sweep (bounded to still-recruiting studies); a public webhook endpoint to monitor.
- **Committed to:** the adapter remains the single source of truth for provider state; webhooks are advisory; Inngest (or its migration target) runs a recurring cron.
- **Precluded:** we will not write provider state from a webhook payload without a confirming refetch; we will not store provider-side PII (ADR-0014 holds — the reconcile path only ever touches `external_pid`).

## Revisit triggers

- Prolific's API rate limits make the 10-minute sweep too expensive → widen the interval or gate the sweep on "changed since last poll".
- A provider offers a reliable, signed, fully-specified webhook payload → consider applying it directly for the hot path (still keep polling).
- We add a provider whose token model is org-wide (not per-researcher) → simplify token selection.
- Job volume crosses the Inngest cost ceiling (lock-in-inventory.md) → migrate jobs to BullMQ; this design is vendor-agnostic behind `BackgroundJobAdapter`.

## References

- ADR-0047 (RecruitmentAdapter), ADR-0014 (participant PII boundary), ADR-0007 (vendor adapters; Inngest serve exception).
- Code: `05_app/server/recruitment/reconcile.ts` (shared reconcile), `05_app/app/api/recruitment/[provider]/webhook/route.ts` (ping), `05_app/app/api/inngest/route.ts` (`recruitment.reconcile-study` event fn + `recruitment.poll-provider-status` cron), `05_app/server/jobs/recruitment.ts` (job bodies), `05_app/server/adapters/recruitment.prolific.ts` (`verifyWebhookSignature`, `getStudy`, `listSubmissions`).
- `04_architecture/lock-in-inventory.md` — Prolific + Inngest rows.
