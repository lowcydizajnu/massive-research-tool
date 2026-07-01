# ADR 0053 — Auto-approval policy (clean + aged)

- **Status:** accepted
- **Date:** 2026-06-18
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** recruitment, money, runtime

## Context

ADR-0049 and ADR-0052 left auto-approval deferred: every approve was a human click. For high-volume studies that's busywork — most submissions are clean and just need approving after the review window. The owner asked to automate it. But auto-approval *pays participants with no human in the loop*, so it needs tight, money-safe guardrails, not a blanket "approve everything."

The pieces already exist: quality detection (ADR-0049, now with a background sweep), the per-flag `applyResolution` path (ADR-0052), `payout_record`, and the hourly Inngest cron pattern. What was missing was the *policy* — when is it safe to approve without a human — and the decision to expose it.

## Options considered

### Option A — Approve everything at awaiting-review
Maximally hands-off, but pays flagged participants too. Rejected — it defeats the Quality queue and risks paying bad data.

### Option B — Clean, immediately
Auto-approve any submission with no open flags as soon as it's awaiting-review. Faster, but no buffer for late-detected issues (the sweep is hourly; a fast/duplicate flag may land minutes later).

### Option C — Clean + aged (chosen)
Auto-approve a submission ONLY if: (1) it's awaiting review, (2) it has **no open quality flag** (for its response or pid), and (3) it has been awaiting review **≥ a configurable delay** (default 24h). Opt-in per workspace, owner/admin only. The delay guarantees the detection sweep has run and the researcher had time to act first.

## Decision

**We adopt Option C.** A `workspace_auto_approval_policy` row (workspace PK, `enabled` default false, `minAgeHours` default 24, `updatedByUserId`) holds the opt-in. An hourly Inngest cron (`recruitment-auto-approve`) runs AFTER the detection sweep and, per enabled workspace:

- Selects `provider_submission` rows still in a payable-but-undecided state (`submitted`), older than `minAgeHours`.
- Skips any with an **open** (unresolved) `quality_flag`.
- Resolves the rest via the same money path as a human approve: `adapter.approveSubmission` → idempotent `reward` `payout_record` → stamp `status='approved'`, `decidedAt`, **`decidedByUserId = null`** (null = system/auto, distinct from a human decision in the audit).
- Needs a provider token with no user context → reuses the existing "try each active workspace connection" fallback (same as the reconcile/poll cron). If no token, it no-ops for that workspace (nothing is marked approved locally without the provider call succeeding).

Disabled by default. Money automation is strictly opt-in, owner/admin-gated, and every auto-approval is in the append-only payout audit (filterable as system-decided).

## Consequences

- **Easier:** clean submissions clear themselves after the window; the queue shrinks to the cases that actually need judgment.
- **Harder:** a cron now initiates real charges — the "no open flag + aged" gate + the null-decider audit + idempotent payout are load-bearing; can't be exercised live without spending (adapter-mocked tests + the same posture as the manual approve path).
- **Committed to:** never auto-approving a flagged participant; opt-in only; provider-only money; system-decided rows are auditable.
- **Precluded:** approve-everything; auto-approval without the aging buffer; auto-*reject* (rejection is never automated — it withholds pay + notifies the participant, always a human call).

## Revisit triggers

- Researchers want per-study (not per-workspace) policy → extend the table with an experiment scope.
- A flag lands AFTER auto-approval (within the window race) → the window default (24h ≫ hourly sweep) makes this near-impossible; revisit only if shortened.
- Auto-bonus is requested → separate decision (bonuses are discretionary, unlike reward-on-approve).

## References

- ADR-0049 (quality flags + detection sweep), ADR-0052 (in-app approve/reject/bonus — shared `applyResolution`), ADR-0048 (`payout_record`), ADR-0050 (cron + token fallback), ADR-0014 (PII).
- Code: `05_app/server/db/schema.ts` (`workspace_auto_approval_policy`, migration 0022), `05_app/server/recruitment/auto-approve.ts`, `05_app/server/jobs/recruitment.ts` (`runAutoApprove`), `05_app/app/api/inngest/route.ts` (cron), `05_app/server/trpc/routers/compensation.ts` (get/set policy), `05_app/components/feature/participants/compensation-view.tsx` (policy card).
