# QA audit — 2026-06-15 — V1.44.0 "Make these edits live" + version-spanning results (ADR-0044)

## Overview

- **Auditor:** Claude (agent).
- **Trigger:** the owner, click-testing v1.43.0, reported: the drift banner *"broke layout"*, and — more importantly — *"how can I run a new version? I have no action in UI for it… should it be an amendment?… new action in the Run tab?… is Excel ready for it?"* This is the deferred audit **step 6** (re-freeze-while-recruiting + cross-version results), now built.
- **Method:** a grounded investigation workflow (5 parallel investigators → synthesis → adversarial re-verification of the two load-bearing claims) established the real mechanics; the owner chose **pool-all-versions + version column**, **inline amend on Run**, **bundle as one release**. Implementation followed the phase gate (ADR + wireframes before code), then a **3-lens adversarial review** before commit.
- **Verdict:** ✅ cleared for the owner's review. **No DB migration.** Ships as one release (v1.44.0) bundling the banner layout fix.

## What shipped

1. **Banner layout fix** (commit `8649b47`) — the v1.43.0 drift banner was mounted as a sibling of `BuilderWorkspace` inside an extra flex-col wrapper that was a direct child of the focused-study layout's flex *row*; `StageTabs` lives inside `BuilderWorkspace`'s `<main>`, so the banner stacked **above** the tabs and bled full-width across the work column + right aside. Fix (token-only): render `<BuildDriftBanner>` inside `<main>` right after `<StageTabs>`; it now occupies the work-column width as a rounded card.

2. **`studies.makeLive`** (commit `9135f89`) — one transaction: freeze the working tip into a new immutable version (**amend** if the live version is preregistered — requires `changeSummary`, writes ADR-0004 lineage, re-pushes to OSF; **publish** if published), **supersede** the old version's live session, and open a **new** session on the new version. The `studyId`-based public link is unchanged and instantly serves the new version; in-flight participants finish on their pinned version. Refused unless the study is runnable **and** the draft diverges.

3. **Version-spanning `getResults`** — pools **all** runnable versions by default (optional `version` filter); each respondent row carries `versionNumber`; conditions merge by slug, questions by `instanceId` (newest config labels merged cards). Fixes the **silent prior-version data loss** (the old query was hard-scoped to the single newest version — a v2 going live made all v1 completes vanish from results + every export).

4. **Export `version` column** (`dataset.ts`) — a `version` meta column flows into CSV/TSV/JSON/Excel + the data dictionary, so a pooled multi-version dataset is always disambiguable.

5. **UI** — Run-tab diverged-gated **"Make these edits live"** (inline change-summary for preregistered, one-step confirm for published; shown in recruiting **and** paused branches); Results **version filter** (All / per-version chips) + scope caption.

## Owner's four questions — answered

- **"How do I run a new version?"** There was no single action; now one transactional Run-tab action. The link is study-based, so it never changes.
- **"Amendment for a preregistered study?"** Yes — enforced: preregistered → amend (summary + OSF); published → publish. `makeLive` branches on the live version's kind.
- **"New action in the Run tab?"** Yes — and the panel already received all needed data (`divergedFromLive`, `versionKind`, `liveVersionNumber`); it just wasn't reading the drift flag.
- **"Is Excel ready?"** It was **not** — worse than co-mingling: it silently dropped prior-version data. Now pooled by default with a `version` column.

## Adversarial review (3 lenses, pre-commit) — findings actioned

- **MAJOR — silent re-open:** `makeLive` on a paused/closed study would have opened a fresh **open** session, silently re-activating recruitment the researcher had deliberately stopped. **Fixed:** the new session inherits the prior recruitment intent (open/paused/closed); test added.
- **MAJOR — block-only divergence:** the drift check (and `makeLive` guard) compared only blocks, so consent / theme / condition-weight edits could never be made live and showed no drift — the same silent-drift failure, narrower. **Fixed:** a shared `versionFingerprint` hashes the full snapshot + conditions (normalizing the implicit default control to avoid false drift); used by `getRunInfo` and `makeLive`; test added (condition-weight change).
- **MINOR — Run counter reset:** post-cutover the Run "responses collected" count read the new (empty) session. **Fixed:** `getRunInfo.currentN` is now pooled across the study's runnable versions.
- **Doc nits** (stale `getResults` JSDoc, `availableVersions` comment): fixed. **Accepted trade-offs** (noted, not fixed): a hot-spot **region-key rename** between versions drops that key from the pooled overlay totals (raw selection still in `regionKeys` + CSV; use the per-version filter) — documented in `results-stage.md` + ADR-0044 revisit-trigger #3; a hand-typed non-existent `?v=` falls back to pooled (unreachable via UI; safe).

## Verification

- **Unit/integration:** **404 vitest green (45 files)** — +10: makeLive (preregistered amend + reopen + closes old session; published no-OSF; refuse-not-diverged; require-summary; refuse-never-frozen; **paused-intent inheritance**; **condition-weight divergence**); getResults spans versions (no v1 loss + per-version filter + per-row version); export version column (+ pooled JSON/dictionary).
- **Static:** `tsc`/`lint`/`build` clean (exit-code-gated). Manifest `validate.py` clean. Dashboard `dashboard-state` JSON re-parsed (per the `validate-dashboard-json` rule).
- **Not click-tested by the agent:** the Run "Make live" form, the diverged-gate, the Results version chips — verified via tsc/build + the server tests, shipped for the owner's live click-through. Prod smokes: edit a recruiting study → Run shows "Make these edits live"; for preregistered it asks for a summary and re-files on OSF; the recruitment link is unchanged; pause then make live → stays paused; Results shows an "All versions / v1 / v2" filter and an Excel `version` column with no missing rows.

## Gates

- **Architecture:** ADR-0044 (new). Refines ADR-0002/0012 (versioning), ADR-0004 (amendments), ADR-0013 (published runnable).
- **Design:** `run-stage.md` (make-live action + states), `results-stage.md` (version filter + multi-version edge cases) amended. Tokens-only throughout.

## Carry-forwards / deferred

- **Concurrent live versions** (A/B of protocols) — out of scope; the model is a clean cutover (newest-with-open-session wins).
- **DB partial-unique on open recruitment_session** — deferred (a migration); `makeLive` always closes-then-opens in one transaction, so two open sessions can't arise from it.
- **OSF contributors POST** — still deferred pending live OSF-shape verification (from the v1.43.0 batch).
