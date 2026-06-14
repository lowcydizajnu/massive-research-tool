# QA audit — 2026-06-14 — V1.43.0 Study-lifecycle audit fixes (5 steps)

## Overview

- **Auditor:** Claude (agent).
- **Scope:** the owner asked six lifecycle questions ("how do I amend a preregistration? why does so little reach OSF? which version runs after I edit? why is a preregistered study still editable? why can a draft be replicated? how do I stop a study?") plus "scan for other gaps, check the UI delivers what we promise, envision use cases, suggest UX." A grounded multi-agent audit (`study-lifecycle-audit` workflow — 8 parallel investigators → synthesis → adversarial re-verification of each high-severity claim against the code) produced the findings; the owner selected all five fixes, built smallest-safest first.
- **Verdict:** ✅ cleared for the owner's review. **No DB migration** in any of the five. Ships as one release (v1.43.0).

## What shipped (5 steps)

1. **Stop/Pause/Resume recruitment** — `studies.setRecruitmentStatus(open|paused|closed)` + runtime helper; Run-panel `Recruiting`/`Paused`/`Closed` branches with Pause + Stop (inline confirm) + Resume/Reopen. Pausing/closing gates the public link immediately (`resolveOpenRecruitment` requires `open`); resume reuses the same session so data isn't split. Gate: `run-stage.md`. *(Audit: there was NO way to halt collection except Archive/Delete.)*
2. **Drift visibility** — `getRunInfo` gains `liveVersionNumber` + `divergedFromLive` (tip blocks vs the frozen live version's); a top-bar `StudyStateBadge` (shown on every stage) + a Build banner make the frozen-vs-draft state explicit. *(Audit: post-freeze edits silently never reached participants, with no signal.)*
3. **OSF metadata** — `buildOpenEndedBody` pushes the real abstract + numbered hypotheses + protocol above the machine JSON; the OSF node gets a description + permalink (`NEXT_PUBLIC_SITE_URL`) + study tags. *(Audit: the default push sent only title + boilerplate + a JSON dump.)* **Deferred:** the contributors POST — its OSF write-shape must be verified live before shipping (the adapter's verify-don't-guess rule).
4. **Amendment flow** — `studies.amend` freezes the tip as a superseding `preregistered` version (writes the previously-dead ADR-0004 `supersedes_version_id`/`change_summary`/`amendment_classification` and exercises the consistency CHECK), re-files on OSF as an amendment carrying the stated reason; "File an amendment" inline form on the receipt + a lineage line; `getPreregistration` returns `changeSummary` + `amends`. *(Audit: the capability was ~90% built but had no creator — `preregister` hard-coded `isAmendment:false`.)*
5. **Replication freeze-gate** — `loadForkSource` keeps the draft (tip) fallback only for a same-workspace member (own-work duplication); `setForkable` refuses public/link-only until a frozen version exists; the Builder toggle is disabled until frozen. *(Audit: drafts were publicly replicable.)* Gate: ADR-0018 amendment. **Carve-out kept** (same-workspace duplication of an unfrozen draft) — flagged for owner confirmation.

## Answers recorded (the owner's six questions)

- **Run-version semantics:** participants get the **frozen** version, never the draft; post-freeze edits reach zero participants (now surfaced by step 2). Re-freeze-while-recruiting still orphans the link / splits data — **deferred** (audit step 6, the largest/riskiest; safe sequence today is Stop → freeze → Open).
- **Edit-after-preregister:** correct by design (frozen version is a separate immutable copy); the fix was the missing signal (step 2) + the amend path (step 4), not a hard lock.

## Verification

- **Unit/integration:** **394 vitest green (45 files)**. New: recruitment lifecycle (pause→link null, resume→live, close→null; refuse-when-never-opened); `getRunInfo.divergedFromLive` (false post-preregister, true after a post-freeze edit); `buildOpenEndedBody` (abstract/hypotheses/protocol; omits empties); replication gate (own-draft duplication OK; setForkable-public rejects then succeeds after preregister; cross-workspace needs frozen; browse-exclusion updated); amend (supersedes with summary+classification+amends; rejects empty; can't amend before preregister).
- **Static:** `tsc`/`lint`/`build` clean (exit-code-gated, per the deploy rule). Manifest `validate.py` clean. Dashboard `dashboard-state` JSON validated to parse (per the `validate-dashboard-json` rule).
- **Not click-tested by the agent:** interactive surfaces (Run controls, the amend form, the drift banner/badge, the disabled fork toggle) verified via tsc/build + the server tests, shipped for the owner's live click-through. Recommended prod smokes: Stop a recruiting study → link reads closed; edit a preregistered study → top-bar shows "draft ahead" + Build banner; File an amendment → new version + lineage line + OSF re-push; try to make a draft public → blocked.

## Gates

- **Architecture:** ADR-0003 amendment (already shipped — media auth), ADR-0004 implementation note (amend), ADR-0018 amendment (replication freeze-gate), ADR-0043 (prior). ADR-0042 amendment (embedded-data fix, prior).
- **Design:** new `run-stage.md`; `preregister-stage.md` amended (amendment affordance). Tokens-only throughout (badge, banner, run controls, amend form, fork toggle compose existing v0.6 primitives).

## Carry-forwards / deferred (owner-facing)

- **Re-freeze-while-recruiting carry-over** + explicit run-pinning + cross-version results aggregation (audit step 6) — the largest item; deferred. Until then, Stop → freeze/amend → Open is the safe sequence.
- **OSF contributors POST** — deferred pending live OSF API-shape verification.
- **Replication own-private-draft carve-out** — kept; confirm with the owner if even own drafts should be gated.
- **Polish (audit step 7):** stage-tab gating, Versions-tab "recruiting" pill, full bidirectional amendment lineage + PDF amendment header, `link-only`/`withdraw` dead-plumbing cleanup, destructive-edit confirms on a live study.
