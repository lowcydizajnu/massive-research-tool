# ADR 0048 — Compensation tracking + financial-data sensitivity

- **Status:** accepted
- **Date:** 2026-06-17
- **Deciders:** project owner, Claude
- **Tags:** data-model, recruitment, privacy, money

## Context

V1.15 Stream P4 ("Compensation") answers one researcher question: *"How much have I spent on participants, broken down how?"* Researchers running studies on Prolific pay participants a reward per completion (and sometimes bonuses); today that spend is only visible inside Prolific, per study, with no cross-study/cross-month view.

The hard boundary: **we never process money.** Prolific charges the researcher's own Prolific account directly; we hold no card/bank details and initiate no transfers. P4 is a *mirror* — it records spend *events* (a reward when a submission is approved, a bonus when one is sent) for unified visibility and budgeting. This is the financial-data analogue of the ADR-0014 participant-PII boundary, now applied to the researcher: provider-side financial PII (payment methods, billing addresses, invoices) stays on the provider.

We already reconcile `provider_submission` rows (ADR-0050) carrying `status` + the opaque `external_pid`; the study's reward `{amount, currency}` is stored on the session's `provider` metadata. So the spend of an approved submission is derivable without any new money call.

## Options considered

### Option A — Compute spend on the fly from submissions (no spend table)

- Each read: `approved count × study reward`, grouped by study/currency.
- **Pros:** no new table.
- **Cons:** can't represent **bonuses** (variable, per-submission, not derivable from a study reward); no stable "recent payouts" event log; "spend in month M" needs a decision timestamp we'd have to recompute; loses history if a study's reward later changes.

### Option B — Append-only `payout_record` event log, populated on reconcile (chosen)

- One immutable row per spend event: `kind: 'reward' | 'bonus'`, `amount_cents`, `currency`, the deciding user (if it was us) + decided-at, and a link to the `provider_submission`. Reward rows are written idempotently when reconcile first sees a submission as `approved`; bonus rows are written when a bonus is sent (a future action — the column shape is ready, populated as 0 rows until then).
- **Pros:** honest event history; handles bonuses; "recent payouts" + "by month" are trivial reads; survives later reward changes; one obvious place spend lives.
- **Cons:** a table + a reconcile write; idempotency to get right (unique on `(provider_submission_id, kind)`).

### Option C — Trust a provider "transactions/payments" API as the source

- Pull spend straight from Prolific's billing endpoints.
- **Cons:** that's exactly the financial-PII surface we're refusing to touch; couples spend visibility to one vendor's billing API; against the provider-plurality goal (ADR-0047).

## Decision

**We mirror spend as an append-only `payout_record` event log, populated from reconciliation (Option B), and never process money.** Rewards are recorded idempotently when a submission is first reconciled as `approved` (amount = the study's stored reward); bonuses use the same table with `kind='bonus'` once a bonus action exists. An optional, **owner-set** workspace budget (`monthly_limit_cents`, `currency`, `alert_threshold_pct`) drives in-app alerts; it never blocks anything. The Compensation sub-view reads aggregates (`summary` / `byStudy` / `byMonth` / `recentPayouts`) — spend records are visible to any workspace member; budget settings are owner-only.

**Currencies are never summed across.** All totals are grouped by currency (a researcher running USD + GBP studies sees two lines, never a meaningless blended number).

**Out of scope for P4 (explicit):** approving/rejecting submissions and sending bonuses from inside our app. Those are real money operations; the adapter has the methods, but P4 is *tracking*, and researchers perform those actions in Prolific's dashboard today. Wiring them is a separate, money-sensitive decision.

## Consequences

- **Easier:** unified spend view across studies/months/currencies; honest event history; budgeting; provider-agnostic (spend is ours, derived from our reconcile).
- **Harder:** reconcile gains an idempotent payout write; we carry a small money-shaped table (no PII, but treat with care).
- **Committed to:** never processing money; never storing researcher financial PII; per-currency (never blended) totals; budgets advisory-only.
- **Precluded:** pulling from provider billing APIs; cross-currency conversion (no FX in V1).

## Revisit triggers

- Researchers ask to approve/reject/bonus in-app → separate ADR for the money-operation surface (confirmations, audit, idempotency, error handling).
- Multi-currency studies become common and users want a converted total → decide on an FX source + as-of-date semantics (don't guess rates).
- A provider exposes authoritative spend we'd rather trust than derive → weigh against the financial-PII boundary.

## References

- ADR-0050 (recruitment reconciliation — source of `provider_submission` + study reward), ADR-0047 (RecruitmentAdapter), ADR-0014 (PII boundary; this is its financial analogue).
- Wireframe: `03_design/wireframes/participants-compensation.md`.
- Handoff: `04_architecture/handoffs/code-tab-v1150-participants.md` §P4.
- Code (on build): `05_app/server/db/schema.ts` (`payout_record`, `workspace_payout_budget`), `05_app/server/recruitment/reconcile.ts` (reward recording), `05_app/server/trpc/routers/recruitment.ts` (`compensation.*`), `05_app/app/(app)/(workspace)/participants/compensation/`.
