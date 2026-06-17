# Wireframe spec — Participants · Quality

- **Serves user flow:** [Run and read results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

A cross-study queue of participant submissions worth a second look before approval — surfaced by heuristic flags over our own response data (timing, straight-lining, duplicates) plus manual flags (ADR-0049). The researcher reviews + records a decision; the audit trail is append-only. (Executing the approve/reject on the provider is deferred — see ADR-0049 money boundary.)

## Layout

Participants destination shell (sub-nav: Connections · Open recruitment · Panels · Compensation · **Quality**), Quality active. Two sub-tabs:

1. **Needs review** (default) — the open-flag queue across all the workspace's studies.
2. **Resolved** — the audit archive of resolved flags (not deleted).

Above the queue: a **Re-scan** action (re-runs detection) + a count summary.

## Content inventory

- **Flag row** — study title · truncated opaque PID · flag reason(s) (a submission can carry several) · severity (low/med/high) · age (detected-at) · actions. Source: `recruitment.quality.list`.
- **Re-scan button** — `quality.rescan` (workspace or per-study); reports how many new flags were found.
- **Resolve actions** — per row: **Approve** / **Reject** / **Dismiss** + an optional note. (V1: records the decision in our audit trail; does NOT call the provider — researcher still actions it on Prolific. Copy says so.)
- **Manual flag** — from a submission, `quality.flag` adds a `manual` flag for later review.
- **Resolved row** — same fields + resolution (approved/rejected/dismissed) + who + when + note. Source: `quality.list({ resolved: true })`.

## States

- **Default (needs review)** — list of open flags, newest/highest-severity first.
- **Loading** — server-rendered; resolve/rescan use `PendingButton`.
- **Empty (no flags)** — "Nothing flagged. Re-scan after more submissions complete, or flag a session manually." + Re-scan.
- **Empty (all resolved)** — "All caught up — no submissions need review."
- **Partial** — a study still recruiting: flags grow as responses complete + you re-scan.
- **Error** — inline alert on resolve/rescan failure; the row stays open.
- **Resolved-here notice** — resolved rows show "Decided here — approve/reject on your provider to finalize payment" (until the money-resolve lands).

## Interactions

- **Re-scan** — `quality.rescan({ studyId? })`: runs detection (fast-completion, straight-lining, duplicate-PID), idempotently inserts new flags; reports `{ created }`.
- **Resolve** — `quality.resolve({ flagId, resolution, note })`: sets resolved-at/by/resolution/note; row moves to Resolved. Write-gated (any write-member; viewers read-only).
- **Manual flag** — `quality.flag({ providerSubmissionId, note })`.
- **Row → study** — links to the study's Run/Results stage.

## Edge cases

- **Multiple flags per submission** — grouped under one row (all reasons shown); resolving resolves the submission's open flags together.
- **Re-scan idempotency** — auto flags are unique on `(submission, kind)`; re-scan never duplicates and never resurrects a resolved flag.
- **Too few completions for a median** — fast-completion flag is skipped until ≥5 completed responses (no noisy early flags).
- **Long study titles / notes** — truncate with `title`.
- **0 / many** — empty states; large queues scroll; Resolved tab is the full archive.
- **Permissions** — any write-member resolves; viewers see the queue read-only.

## Accessibility notes

- Severity is not color-only (label + tone). The queue + resolved archive are real `<table>`s with captions; truncated PIDs carry the full opaque id in `title`.
- Resolve buttons use `aria-busy`; the re-scan result is announced via `aria-live`.
- Sub-tabs are a labelled tablist; the active tab carries `aria-selected`.

## Open questions

- **Auto-approval policy** — "auto-approve everything except attention-check fails" (workspace setting) is deferred (ADR-0049); confirm V1 is manual-resolve only.
- **Slow / open-text-spam / attention-check rules** — deferred (false-positive risk / V1.6 block dependency). Confirm the V1 rule set (fast, straight-line, duplicate, manual) is enough to ship.
- **Resolve→provider pay** — the money-moving resolution is deferred to pair with the P4 money actions; confirm the "decide here, action on provider" interim is acceptable.
