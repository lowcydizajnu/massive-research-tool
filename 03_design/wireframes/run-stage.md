# Wireframe spec — Run stage

- **Serves user flow:** [Hanna runs and reads results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Run stage](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

The Run stage is where a researcher freezes a runnable version, opens recruitment to get a participant link, and **controls the lifecycle of data collection** — pause it, resume it, or stop it — without destroying data. (Backfills the audit gap: previously the only ways to halt collection were Archive or Delete.)

## Layout

Reuses the focused-study shell (StageTabs with **Run** active; work-surface card). One `RunPanel` that renders a different state depending on whether the study is runnable and the recruitment session's status (`open` / `paused` / `closed`).

## States

- **Not runnable** (no frozen version) — explains that a study must be frozen first; offers **Preregister (to OSF) →** and **Publish & run (no OSF)**, gated by the methodological pre-flight checklist. (Unchanged.)
- **Not yet open** (runnable, no recruitment session) — **Open recruitment** + **Preview**. (Unchanged.)
- **Recruiting** (`open`) — a green "Recruiting" chip + response count; the recruitment link with **Copy**; **Preview as a participant**; and a controls row: **Pause** and **Stop collecting** (the latter behind a one-step inline confirm "Stop collecting responses? [Stop now] [Cancel]").
- **Recruiting · unpublished edits** (`open` **and** `divergedFromLive`) — same as Recruiting, plus an amber **"You have unpublished edits"** notice and a **Make these edits live** action (ADR-0044). For a **published** study it is a one-step inline confirm ("Make your edits live now? [Make live] [Cancel]"). For a **preregistered** study it expands to a short inline form — a **required change-summary** textarea + optional classification (typo / methodological-correction / clarification / scope-change / other) + **[File amendment & make live] [Cancel]** — because making a preregistered change live *is* an amendment (ADR-0004): it re-pushes to OSF with the stated reason. Copy under the action: "Participants already in progress finish on v{liveVersionNumber}; new participants get the new version. Your existing responses are kept and stay in Results." (Shown in the **Paused** state too, so a researcher can amend before resuming.)
- **Paused** (`paused`) — an amber "Paused" chip + response count + copy "the link is inactive and no new participants can start; your data is safe; resume any time"; **Resume recruitment** + **Stop collecting**.
- **Closed** (`closed`) — a neutral "Closed" chip + response count + copy "no new participants can start; your results stay available; you can reopen to collect more"; **Reopen recruitment**.

## Content inventory

- **Recruitment status** — `open` / `paused` / `closed`, from `getRunInfo().recruitment.status`.
- **Response count** — `getRunInfo().recruitment.currentN`.
- **Recruitment link** — the public `/take/<studyId>/start` URL (shown only while `open`). `studyId`-based, so it is **stable across versions** — making a new version live does not change the link.
- **Drift signal** — `getRunInfo().divergedFromLive` (true when the editable draft differs from the live frozen version) + `versionKind` + `liveVersionNumber`, used to decide whether to show **Make these edits live** and which flavour (amend vs publish).

## Interactions

- **Open recruitment** — `studies.openRecruitment` (creates/reuses an open session on the latest runnable version).
- **Pause** — `studies.setRecruitmentStatus({status:'paused'})` — flips the open session to paused; the public link immediately reads as unavailable (the runtime begins only on an `open` session) while all responses are retained.
- **Resume / Reopen** — `studies.setRecruitmentStatus({status:'open'})` — reopens the same session (data continuous; not split).
- **Stop collecting** — `studies.setRecruitmentStatus({status:'closed'})`, behind an inline confirm — terminal-by-intent (data retained, Results stays available); reversible via Reopen.
- **Make these edits live** — `studies.makeLive({ studyId, changeSummary?, classification? })` (ADR-0044). One transaction: freezes the draft (amend if preregistered — `changeSummary` required + OSF re-push; publish if published), closes the old version's recruitment session, opens a fresh session on the new version. The stable link instantly serves the new version. Refused server-side if the study isn't runnable or the draft doesn't diverge (no no-op amendments).
- All transitions `router.refresh()` so the panel re-renders the new state.

## Edge cases

- **Re-freezing while recruiting** is now a first-class action: **Make these edits live** (ADR-0044) does the freeze → close-old-session → open-new-session in one transaction, so the researcher never has to hand-sequence Stop → freeze → Open. The old manual sequence still works but is no longer the only path. Two open sessions on different versions cannot result from this action (it always closes the old one).
- **No session yet** — Pause/Stop are not offered; only Open.
- **Paused link** — `resolveOpenRecruitment` returns null, so `/take` shows the "not available" state; the participant runtime also rejects a non-`open` session defensively.

## Accessibility notes

- Status chips are text (not color-only). Pause/Resume/Stop are real buttons with pending states (spinners) and descriptive labels; the Stop confirm is keyboard-operable (Stop now / Cancel buttons, not a native `confirm()`).

## Open questions

- Whether Stop should also auto-snapshot/lock the dataset — out of scope; deferred with the re-freeze work.
