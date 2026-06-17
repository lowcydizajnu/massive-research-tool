# QA audit — 2026-06-18 — V1.15.0-a18 — Quality money-resolve + meaningful flags (P5+/P6)

## Overview

- **Auditor:** Claude (agent), at the owner's direction. The owner, looking at a Quality flag row ("Suspiciously fast — Completed in 7s vs study median 34s"), asked: *"Can we make it more meaningful? I have no data, no link to preview what was there, so how can I make a decision?"* plus *"the in-app approve/reject/bonus surface — money is processed by Prolific not us — we can make an additional modal for confirmation action. Then P6, all in one move."*
- **Verdict:** **done — no blockers, migration-free.** The Quality queue now shows the participant's actual answers + timing inline, and approve/reject/bonus trigger the provider's money operation behind a confirmation modal (Prolific charges; we never touch money rails). This closes the P4/P5 money-resolve deferral and finishes V1.15 Stream P (Participants/Prolific).
- **553 vitest green** (+6); tsc + lint + build + manifest validator (164) clean.

## Gate (phase order honored)

- **ADR-0052** — *In-app provider compensation actions (approve/reject/bonus)* — written and accepted **before** the code, per CLAUDE.md ("no code without an ADR for any new architectural concept"). Records the decision to expose money operations behind a confirm modal via the `RecruitmentAdapter`, with append-only `payout_record` audit and verbatim provider-error surfacing. References ADR-0048 (payout_record), ADR-0049 (quality flags), ADR-0047 (adapter), ADR-0014 (PII).
- No new data model — reuses existing `payout_record` (P4, migration 0020) + `provider_submission` decided fields (migration 0018) + `quality_flag` (P5, migration 0021, already on prod). **Migration-free.**

## What shipped

### (A) Meaningful flags — inline answer preview

- New `recruitment.quality.responsePreview({flagId})` loads the flagged response's status, server-computed `durationSec` (no Date over the wire), and its `responseItem` answers ordered by block position. Empty-safe when a flag has no linked response.
- Quality UI: each open flag row gets a **"View answers"** toggle that lazy-loads the preview (status · duration · N answers + a `moduleKey → answer` list). The researcher can now see *what the participant actually did* before deciding — directly answering the "I have no data to preview" complaint.

### (B) In-app money-resolve behind a confirmation modal (ADR-0052)

- `resolve({flagId, resolution, note})` enhanced: when the flag is linked to a `provider_submission` **and** the workspace has an active Prolific connection —
  - **approve** → `adapter.approveSubmission` → append a `reward` `payout_record` (idempotent via the partial-unique) + stamp `provider_submission.status='approved'`, `decidedAt`, `decidedByUserId`.
  - **reject** → **requires a reason** (BAD_REQUEST without one; Prolific notifies the participant) → `adapter.rejectSubmission({reason})` + stamp `status='rejected'`. No payout.
  - returns `{ok, appliedOnProvider}`; without a linked submission or connection the decision is recorded **audit-only** and the UI says so.
- New `bonus({flagId, amountMajor, reason})` → `adapter.sendBonus` + a `bonus` `payout_record`. PRECONDITION_FAILED when there's no linked submission or no connection.
- **dismiss** stays audit-only (no provider call) — unchanged.
- UI: a per-row confirmation panel states the money effect in plain language ("Approve … this pays the participant their reward", "Reject … the participant is not paid and Prolific notifies them with your reason", "Send a bonus …"), with the reason field (reject) / amount + reason (bonus) inline, Confirm/Cancel, and verbatim provider-error display. Write-member gated (viewer sees disabled actions with the read-only title).

## Money + PII boundary (held)

- We never process money. Every money action only *triggers* Prolific's operation under the researcher's own connected, encrypted token; provider 4xx/5xx surface verbatim and nothing is marked resolved/paid locally if the provider call throws.
- No PII crosses the boundary: the preview shows research answers + the opaque `external_pid` only (ADR-0014); no names/emails/IPs.

## Tests (6 new, in `server/trpc/__tests__/quality.test.ts`)

Adapter mocked (`getRecruitmentAdapter` → hoisted spies) over a real migrated PGlite DB:
- approve → provider called once + a `reward` payout written with the submission's amount/currency + submission stamped `approved` with `decidedByUserId`.
- reject → throws without a reason (provider not called); with a reason, provider called with it + submission `rejected` + **no** payout.
- approve with no connection → `appliedOnProvider:false`, provider not called, audit-only resolve recorded.
- bonus → provider called with `{amount, reason}` + a `bonus` payout in cents (major→minor).
- bonus with no linked submission → throws, provider not called.
- responsePreview → returns the response id, duration, and ordered answers.

## Verification

- **553 vitest green (59 files)**; `tsc --noEmit`, `next lint`, `next build` all clean (exit-code-gated, per the deploy-gating rule); `validate.py` clean at 164 instances; dashboard JSON re-validated (`json.loads`).
- Migration-free — nothing new for prod's schema. The live money path can't be exercised by automated tests without spending real money (same posture as create-study); covered by adapter-mocked tests + the confirm-gate + owner click-through on the next deploy.

## Deferred (with WHY — not oversights)

- **Auto-approval policy** (ADR-0049/0052) — would approve without a per-item modal; needs its own explicit opt-in + audit. Deliberately out of a surface whose whole point is review-then-act.
- **Bulk approve/reject** — when added, still confirms a *total* per ADR-0052; needs batched provider rate-limit handling.
- **Extra detection rules** (slow-completion, spam-text, attention-check) + a background detection job — P5 deferral, unchanged; current rules are fast/straight-lining/duplicate-PID on demand via Re-scan.
- **Full Playwright e2e** for the participants money flow — can't safely cover a live charge; the adapter-mocked unit tests are the determinism-safe equivalent.

## Bottom line

V1.15 Stream P (Participants / Prolific) is **complete**: connect → recruit → reconcile → compensation tracking → quality review **and act** (approve/reject/bonus) in one place, with answers visible at the point of decision. Money and PII boundaries held. Safe to deploy (tag `v1.15.0-a18`, migration-free) on the owner's go.
