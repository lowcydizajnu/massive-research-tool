# Wireframe spec — Participants · Compensation

- **Serves user flow:** [Run and read results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Answer "how much have I spent recruiting participants, broken down how?" — a unified spend view across studies, months, and currencies, mirrored from the provider (ADR-0048). We never process money; this is read-only visibility + an optional budget alert.

## Layout

Participants destination shell (sub-nav: Connections · Open recruitment · Panels · **Compensation** · Quality), Compensation active. Stacked:

1. **KPI strip** — per currency: total spend (all-time) + a "last 30 days" figure, participants paid, average cost per participant. If a workspace budget is set: this month's spend vs the monthly limit + a remaining/over indicator.
2. **By study** — table: study title · provider · participants paid · reward spend · bonus spend · total (per its currency).
3. **By month** — last 6 months, simple bars per currency (spend over time).
4. **Recent payouts** — last 50 spend events: when · study · kind (reward/bonus) · amount · decided-by (a workspace user, or "on provider" when reconciled from a provider-side approval).
5. **Budget (owner-only)** — set/clear a monthly limit (amount + currency) + an alert threshold %.

## Content inventory

- **KPI cards** — computed from `recruitment.compensation.summary` (per-currency aggregates; never a cross-currency blended total).
- **By-study rows** — `compensation.byStudy` (study title from server; reward/bonus/total in minor units, formatted to currency).
- **By-month bars** — `compensation.byMonth` (6 buckets by decided-at, per currency).
- **Recent payouts** — `compensation.recentPayouts` (50 newest; amount + currency + kind + study + decided-by display name or "on provider").
- **Budget form** — `compensation.getBudget` / `setBudget` (owner-only): monthly limit (major units → cents), currency, alert threshold %.

## States

- **Default** — KPI strip + breakdowns populated.
- **Loading** — server-rendered; mutations (budget) use `PendingButton`.
- **Empty (no spend yet)** — "No participant spend recorded yet. Approve submissions on your provider and it'll appear here." + (owner) a prompt to set a budget.
- **Partial** — a study still recruiting: spend reflects approvals reconciled so far; copy notes it grows as approvals land.
- **Over budget** — when this-month spend ≥ limit (or ≥ threshold%): an in-app warning banner on the KPI strip (and an Activity event — deferred to P6).
- **Error** — inline alert on budget save; reads are best-effort (a provider-unreachable reconcile just shows the last-known totals).

## Interactions

- **Set / update budget** (owner) — `compensation.setBudget`; on success the KPI strip recomputes remaining. Write-gated to owner/admin; viewers + editors don't see the form.
- **Clear budget** (owner) — `setBudget` with null limit.
- **Row → study** — by-study rows link to the study's Run stage.
- No money actions here (approve/reject/bonus live on the provider; out of P4 scope, ADR-0048).

## Edge cases

- **Multiple currencies** — everything groups by currency; no blended totals, no FX conversion (V1).
- **0 / many** — empty state; large by-study lists scroll; recent payouts capped at 50 with a "showing latest 50" note (no silent truncation).
- **Reconciled-on-provider approvals** — decided-by shows "on provider" (we didn't make the decision, so there's no workspace user).
- **Reward changed after approvals** — historical payout rows keep the amount recorded at approval time (append-only); they don't retro-update.
- **Permissions** — spend is visible to any member; budget settings are owner-only (mirrors the dashboard owner-only pattern).

## Accessibility notes

- KPI cards and the over-budget banner are not color-only (icon/label + text); the banner is an `aria-live` region.
- By-month bars have text labels + values (not a chart-only representation); the by-study + payouts tables are real `<table>`s with captions.
- Budget form inputs are labelled; the threshold is a labelled number input with min/max.

## Open questions

- **Bonuses** — the `payout_record` shape supports `kind='bonus'`, but rows only appear once an in-app bonus action exists (out of P4 scope). Until then bonus spend reads 0. Acceptable for V1?
- **"Last 30 days" vs calendar month** — KPI uses rolling 30 days; budget uses calendar month. Confirm that split reads clearly, or unify.
- **Avg cost per participant across currencies** — shown per currency; a single blended average is intentionally omitted (no FX).
