# ADR 0044 — Making edits live mid-recruitment + version-spanning results

- **Status:** accepted
- **Date:** 2026-06-15
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** runtime, data-model, versioning, recruitment, results

## Context

A study runs a **frozen** immutable version (ADR-0002): `preregistered` (with an OSF push, ADR-0004/0005) or `published` (no OSF, ADR-0013). Participants are pinned to the open recruitment session's `experiment_version_id` at `startResponse`. After freezing, the researcher keeps editing the autosave **tip** (ADR-0012); those edits never reach participants. The audit (2026-06-14, v1.43.0 step 2) added a drift **banner** that says "your edits won't reach participants until you publish a new version" — but the owner correctly observed there is **no UI action to do that**, and asked: should it be an amendment for a preregistered study, should the action live on Run, and is the Excel export ready for it?

Two real gaps were confirmed against the code:

1. **No "make live" action.** Making an edited draft live today requires two manual, un-wired steps (freeze via `amend`/`publish`, then `openRecruitment`), and there is a footgun: `recruitment_session` has no partial-unique on `status`, so opening a new version's session without closing the old one leaves **two open sessions**; `resolveOpenRecruitment` silently routes everyone to the newest-by-`versionNumber` version. (The public link is `studyId`-based — `/take/<id>/start` — so the link itself is stable across versions; the risk is purely the dangling open session.)

2. **Results silently drop prior-version data.** `getResults` is hard-scoped to the single newest runnable version (`ORDER BY versionNumber DESC LIMIT 1` + `WHERE response.experiment_version_id = ver.id`). The moment a v2 goes live, **every completed v1 response disappears** from results, per-condition counts, and **every export** — silent data loss, with no version column anywhere and no signal in the UI.

This ADR refines ADR-0004 (amendments), ADR-0002/0012 (versioning), and the recruitment model. It does **not** change immutability: every made-live version remains a separate frozen snapshot.

## Options considered

### Option A — Repoint the existing open session to the new version

`UPDATE recruitment_session SET experiment_version_id = <new>` on the currently-open session.

- **Pros:** one session row; conceptually "the study keeps recruiting."
- **Cons:** **mixes versions under one session.** Prior responses keep their own `response.experiment_version_id` while new ones inherit the new version, so `getResults` (single-version filter) would still drop the old rows. Worse, an in-flight participant who resumes re-reads `rs.experiment_version_id` and would **switch protocol mid-study**. Corrupts the data model's "a response belongs to exactly one version" invariant. **Rejected.**

### Option B — Close the old session, open a fresh session on the new version (chosen)

Freeze the tip into a new immutable version, **close** all open recruitment sessions on the study's prior runnable versions, then **open** a new session on the new version — atomically.

- **Pros:** each session/version stays self-consistent — clean per-version partition. In-flight participants finish on their pinned version (their `response.experiment_version_id` never changes). The stable `studyId`-based link instantly serves the new version (`resolveOpenRecruitment` picks newest-with-open-session). No dangling open session.
- **Cons:** data is now **split across versions/sessions** and must be pooled for analysis — which is exactly the results gap, so we fix both together (below).

### Option C — Block edits / force a brand-new study

Disallow editing a frozen study, or make the researcher duplicate-and-run.

- **Pros:** trivially avoids multi-version data.
- **Cons:** contradicts ADR-0004 (legitimate corrections must be possible) and the owner's workflow ("update this running study"). Duplication loses the recruitment link and the continuity researchers want. **Rejected.**

### Results — single-version (status quo) vs. pooled-with-version-column (chosen)

Keeping `getResults` latest-only (even relabeled) leaves prior-version data invisible by default — the silent-loss bug. **Chosen:** `getResults` spans **all** runnable versions by default, every respondent row carries its `versionNumber`, and a per-version filter lets the researcher scope down. (Owner decision 2026-06-15: "Pool all + version column.")

## Decision

**We will add a single transactional `studies.makeLive` action, surfaced on the Run tab, that freezes the current draft as a new immutable version (an `amend` for a preregistered study — requiring a change summary and re-pushing to OSF per ADR-0004 — or a `publish` for a published study), closes the old version's recruitment session, and opens a fresh session on the new version. Results and every export span all runnable versions by default, with a per-respondent `version` column and a per-version filter.**

`makeLive` is the *only* path that combines freeze + recruitment switch; `amend`/`publish` keep their existing standalone meaning (freeze without touching recruitment). The freeze→close-old→open-new sequence runs inside one `db.transaction` so the link never lands in a two-open-sessions or dark-link state. The action is gated server-side: the study must be runnable **and** the draft must actually diverge from the live version (no-op amendments are refused). For a preregistered study the change summary is collected **inline on Run** (owner decision 2026-06-15) and flows through the same ADR-0004 amendment machinery (lineage columns + OSF amendment push) — Run is a second entry point to the same logic, not a bypass of it.

## Consequences

- **What becomes easier.** A researcher updates a running study in one click without losing the recruitment link or their already-collected data; preregistered studies stay honest (every made-live change is an auditable amendment); results and exports stop silently hiding prior-version responses.
- **What becomes harder.** Analysis now spans versions: the researcher must decide whether to pool or filter. We make that explicit (a `version` column + filter) rather than hiding it. Per-question/per-condition aggregates are keyed by `instanceId`/`slug` and merged across versions; a block that exists in only one version aggregates over only that version's responses (its rows are still exported, never dropped).
- **What we are now committed to.** `makeLive` is transactional and idempotent-safe; closing the old session is mandatory whenever a new version is opened for an already-recruiting study. `ResultsSummary` carries `selectedVersion`, `availableVersions`, and `rows[].versionNumber`; the export contract includes a `version` column. In-flight participants always finish on their pinned version.
- **What we are now precluded from.** Silently serving a draft's edits to live participants; repointing a live session to a different version; returning results for only the newest version by default.

## Revisit triggers

- A researcher needs **concurrent** versions live (e.g. an A/B of protocols) rather than a clean cutover — that needs a different recruitment-routing model than "newest wins."
- Two simultaneously-open sessions become possible through some other caller — then add the DB-level partial-unique on `recruitment_session(experiment_version_id) WHERE status='open'` (or per-study) as a hard guard (a migration; deferred now because `makeLive` always closes-then-opens in one transaction).
- Cross-version aggregation needs to reconcile blocks whose `instanceId` was reused with different semantics (not possible today — freeze copies the tip's instanceIds verbatim).

## References

- ADR-0002 — forking/versioning — immutable frozen versions; `makeLive` creates one per call.
- ADR-0004 — preregistration amendments — the preregistered `makeLive` path *is* an amendment (lineage columns + OSF re-push).
- ADR-0012 — autosave tip as the editable draft.
- ADR-0013 — `published` (no-OSF) runnable versions.
- `05_app/server/trpc/routers/studies.ts` — `makeLive`, `amend`, `publish`, `openRecruitment`, `getResults`.
- `05_app/server/runtime/participant.ts` — `openRecruitment`, `setRecruitmentStatus`, `resolveOpenRecruitment`, `startResponse` (version pinning).
- `05_app/lib/export/dataset.ts` — the `version` export column.
- `03_design/wireframes/run-stage.md`, `03_design/wireframes/results-stage.md` — the Run action + results version filter.
- Owner decisions 2026-06-15: pool-all + version column; inline amend on Run; bundle as one release (v1.44.0).
