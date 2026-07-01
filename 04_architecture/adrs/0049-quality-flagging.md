# ADR 0049 — Quality flagging semantics

- **Status:** accepted
- **Date:** 2026-06-17
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, recruitment, quality

## Context

V1.15 Stream P5 ("Quality") gives researchers a cross-study queue of participant submissions that may warrant review before they approve/pay — attention-check failures, suspicious timing, straight-lining, spam-looking open text, duplicate participants. Today a researcher would eyeball each study's responses by hand.

The signal is **ours, not the provider's**: Prolific's submission `status` is only `started|submitted|approved|rejected|timed-out` — no quality dimension. We already store the data to derive flags: `response` (startedAt/completedAt/status/externalPid) and `responseItem` (per-block `answer` jsonb). So quality detection is a heuristic pass over our own response data, plus optional manual flags.

This ADR locks the flag model, the detection rules, severity, who can resolve, the audit trail, and — critically — the boundary with money operations.

## Options considered

### Option A — Flags live on the submission row (columns on `provider_submission`)

- Add `flagged`, `flag_reason` to `provider_submission`.
- **Cons:** one submission can have *multiple* flags; no per-flag severity/resolution/audit; manual + auto flags don't coexist cleanly; resolution history lost.

### Option B — A dedicated append-only `quality_flag` table, one row per flag (chosen)

- `(workspace, experiment, provider_submission?, response?, flag_kind, severity, auto_detected, detected_at, resolved_at, resolved_by, resolution, resolution_note)`. Detection is idempotent (unique on `(provider_submission_id, flag_kind)` for auto flags); resolution is a state transition that never deletes the row.
- **Pros:** multi-flag per submission; per-flag severity + resolution + audit trail; manual and auto flags in one model; mirrors the P4 `payout_record` append-only pattern.
- **Cons:** a table + a detection pass; idempotency to get right.

### Option C — Detect live on read (no table)

- Recompute flags every time the queue loads.
- **Cons:** no resolution state (can't mark "reviewed"); no manual flags; recompute cost; no audit.

## Decision

**Quality is an append-only `quality_flag` table (Option B), populated by an idempotent heuristic scan over our own response data, plus manual flags; resolution is a state transition with a full audit trail.** Any workspace **write-member** may resolve (the recorded default; configurable-per-workspace is a later refinement). Resolutions are append-only — a flag is marked resolved (`approved|rejected|dismissed` + note + who + when), never deleted; re-scanning never resurrects a resolved flag.

**Detection rules (V1 subset — low false-positive, computable from data we have):**
- **Suspiciously fast** (`severity: medium`) — completion time < 40% of the study's median completion time, once ≥5 completed responses give a stable median.
- **Straight-lining** (`medium`) — a completed response whose choice/scale answers (≥3 of them) are all identical.
- **Duplicate participant** (`high`) — the same `external_pid` completed the study more than once.
- **Manual** (`medium`) — a researcher flags a session for review.

Deferred detection rules (shape ready, rules land later): attention-check failure (needs the V1.6 attention-check block result), suspiciously-slow, and open-text-spam (NLP-ish; high false-positive risk — needs care). Detection runs **on demand** (`quality.rescan`) for V1; the post-completion / recruitment-close background job is a follow-up.

**Money boundary (explicit).** Resolving a flag in V1 records the researcher's *decision* (audit) — it does **not** call the provider to approve/reject/bonus. That provider money-operation is the same deferred surface as the P4-deferred actions (ADR-0048); wiring resolve→pay is a separate, money-sensitive decision. Until then, researchers execute the actual approve/reject on Prolific; our queue tells them *what* to act on and remembers *what they decided*.

## Consequences

- **Easier:** one cross-study review queue; multi-flag + severity + audit; provider-agnostic (we derive flags ourselves); consistent with P4's money boundary.
- **Harder:** a detection pass to maintain; false-positive tuning over time; resolve-as-audit can drift from the provider's actual approve/reject state until the money-resolve lands (we show "decided here, act on provider").
- **Committed to:** append-only flags; opaque-PID-only (ADR-0014); write-member resolution by default; detection from our data, never provider quality signals (there are none).
- **Precluded (V1):** auto-executing approvals/rejections/bonuses on resolve; auto-resolution policies (deferred); spam-text auto-flagging.

## Revisit triggers

- The V1.6 attention-check block ships → add that flag rule.
- Researchers want resolve→provider-pay → the deferred money-resolve ADR (confirmations, idempotency, payout linkage).
- False positives annoy users → tune thresholds / add the auto-approval policy.
- Detection volume grows → move the scan to the Inngest post-completion / recruitment-close job.

## Amendment 1 (2026-06-18) — three deferred rules + the background sweep

The deferred rules now ship (the attention-check block + enough live data exist), and detection moves from on-demand-only to on-demand **plus** a background cron. All additive — the `quality_flag_kind` enum already carries every kind (migration 0021); no migration.

- **slow_completion** — > 3× the study median (≥5 sample). Severity **low** (often benign — a participant stepped away); surfaced so the researcher can judge, not as an accusation.
- **attention_check** — a response whose `attention-check` block answer (`{selected:[…]}`) ≠ the block's `config.correctAnswer`. The correct answer is read from the response's **own** `experiment_version.definition_snapshot` (the frozen blocks), so it stays correct across amendments. Severity **high**.
- **spam_text** — a `free-text` answer that is a pasted URL or a single character repeated ≥4×. Deliberately narrow (NLP-grade spam detection is high-FP and out of scope); severity **medium**.
- **Background sweep** — `detectFlagsAllWorkspaces()` runs hourly via an Inngest cron (`recruitment-detect-quality`), iterating workspaces with completed responses. Idempotent (the existing `onConflictDoNothing` on `(response, kind)`), so it never collides with a manual Re-scan and never resurrects a resolved flag. Re-scan stays for on-demand use.

Unchanged: the money boundary (resolve→pay is ADR-0052, now shipped), opaque-PID-only, write-member resolution. Auto-approval policy remains deferred (its own money-sensitive decision).

## References

- ADR-0050 (reconciliation — `provider_submission`), ADR-0048 (compensation; same money boundary), ADR-0052 (resolve→provider money actions), ADR-0014 (PII; opaque PID only), ADR-0051 (panels — exclude flagged PIDs later).
- Wireframe: `03_design/wireframes/participants-quality.md`.
- Handoff: `04_architecture/handoffs/code-tab-v1150-participants.md` §P5/§P6.
- Code (on build): `05_app/server/db/schema.ts` (`quality_flag`), `05_app/server/recruitment/quality.ts` (detection), `05_app/server/trpc/routers/quality.ts`, `05_app/app/(app)/(workspace)/participants/quality/`.
