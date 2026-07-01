# ADR 0052 — In-app provider compensation actions (approve/reject/bonus)

- **Status:** accepted
- **Date:** 2026-06-17
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** recruitment, money, runtime

## Context

P4 (ADR-0048) and P5 (ADR-0049) both deferred the actual money operations — approving/rejecting a submission and sending a bonus — keeping our surfaces tracking/audit-only. The owner has now asked to wire these into the app, with the reasoning that **Prolific processes the money; our button only triggers their action**, gated by a confirmation step. The Quality queue's review decision (P5) and the spend log (P4) are far more useful if the researcher can act in place instead of bouncing to Prolific.

The adapter already exposes the operations (`approveSubmission`, `rejectSubmission`, `sendBonus`) and they're verified-shape against Prolific. What was missing was the decision to expose them and the guardrails. This ADR records that decision.

## Options considered

### Option A — Keep money operations out of the app (status quo)

- Researchers act in Prolific's dashboard; we only mirror outcomes on reconcile.
- **Pros:** zero money-operation risk in our code.
- **Cons:** constant context-switching; the Quality queue can't be acted on; the "decide here, act there" split is clumsy.

### Option B — Wire the operations behind a confirmation modal, with audit (chosen)

- Approve / Reject / Bonus call the provider adapter; a confirmation modal states the money effect before firing; each action writes an append-only `payout_record` (approve/bonus) and stamps `provider_submission.decidedAt/decidedByUserId/status`. Errors surface verbatim (the provider is the source of truth).
- **Pros:** one place to review + act; honest audit (who decided, when, how much); idempotent approve (partial-unique reward payout); consistent with the reconcile mirror.
- **Cons:** our UI now initiates real charges on the researcher's Prolific account — needs the confirm gate + clear copy; can't be fully exercised without spending.

## Decision

**We will expose approve / reject / bonus in-app, each behind an explicit confirmation modal, executed via the `RecruitmentAdapter` (Prolific processes the charge — we never touch money rails), and recorded in our audit trail.** We still hold no card/bank details; this only *triggers* the provider's own action under the researcher's connected token.

Mechanics:
- **Approve** → `adapter.approveSubmission` → write a `reward` `payout_record` (decidedByUserId = the acting user; idempotent via the partial-unique) + set `provider_submission.status='approved'`, `decidedAt`, `decidedByUserId`.
- **Reject** → requires a reason → `adapter.rejectSubmission({reason})` (Prolific notifies the participant) → set status `rejected` + decided fields. No payout.
- **Bonus** → amount + reason → `adapter.sendBonus` → write a `bonus` `payout_record` (decidedBy). Additive; doesn't change the submission's approve/reject state.
- Resolving a **quality flag** with approve/reject performs the matching provider action when the flag is linked to a submission and the workspace has a connection; **dismiss** stays audit-only. Without a linked submission or connection, the decision is recorded audit-only and the UI says so.
- Provider errors (4xx/5xx) are surfaced verbatim (`call()` already throws the body); nothing is marked resolved/paid locally if the provider call fails.

Confirmation modal copy names the money effect ("Approve — pays the participant £X on Prolific", "Reject — the participant is not paid; Prolific notifies them with your reason", "Send a £Y bonus on Prolific"). Write-member gated (mirrors the existing write rule).

## Consequences

- **Easier:** review-and-act in one place; full audit of who paid what, when.
- **Harder:** our UI initiates real charges — confirm gate + copy + error-surfacing are load-bearing; e2e can't safely cover the live charge (covered by adapter-mocked tests + manual verification, like create-study).
- **Committed to:** never processing money ourselves (provider only); append-only payout audit; confirmation before any charge; idempotent approve.
- **Precluded:** silent/bulk auto-charging without confirmation (bulk approve, if added later, still confirms a total); storing researcher financial PII.

## Amendment 1 (2026-06-18) — bulk approve/reject/dismiss

The "bulk approve/reject at scale" revisit trigger is now built. `quality.bulkResolve({flagIds, resolution, note})` reuses the same per-flag `applyResolution` path (provider call → reward payout / status stamp → flag record); it runs **sequentially** (Prolific rate-limits) and is **fault-tolerant** — one flag's provider failure is collected into a `failed[]` summary rather than aborting the batch, and a failed flag is never marked resolved. The UI confirms the **total** before firing ("Approve N on Prolific — each linked submission is paid"); reject takes one shared reason. Same money + write-member guardrails as the single path.

## Revisit triggers

- Bulk approve/reject at scale → ~~design a batched confirm + provider rate-limit handling~~ (shipped, amendment 1; revisit only if Prolific adds a true batch endpoint).
- A second provider with different money semantics → re-check the adapter contract.
- Auto-approval policy (ADR-0049 deferred) → that path would approve without a per-item modal; needs its own explicit opt-in + audit.

## References

- ADR-0048 (compensation tracking — `payout_record`), ADR-0049 (quality flags — resolution), ADR-0047 (RecruitmentAdapter), ADR-0014 (PII boundary).
- Code: `05_app/server/trpc/routers/quality.ts` (resolve + bonus), `05_app/server/adapters/recruitment.prolific.ts` (approve/reject/sendBonus), `05_app/components/feature/participants/quality-view.tsx` (confirm modal).
