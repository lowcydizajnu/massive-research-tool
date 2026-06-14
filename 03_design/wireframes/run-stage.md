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
- **Paused** (`paused`) — an amber "Paused" chip + response count + copy "the link is inactive and no new participants can start; your data is safe; resume any time"; **Resume recruitment** + **Stop collecting**.
- **Closed** (`closed`) — a neutral "Closed" chip + response count + copy "no new participants can start; your results stay available; you can reopen to collect more"; **Reopen recruitment**.

## Content inventory

- **Recruitment status** — `open` / `paused` / `closed`, from `getRunInfo().recruitment.status`.
- **Response count** — `getRunInfo().recruitment.currentN`.
- **Recruitment link** — the public `/take/<studyId>/start` URL (shown only while `open`).

## Interactions

- **Open recruitment** — `studies.openRecruitment` (creates/reuses an open session on the latest runnable version).
- **Pause** — `studies.setRecruitmentStatus({status:'paused'})` — flips the open session to paused; the public link immediately reads as unavailable (the runtime begins only on an `open` session) while all responses are retained.
- **Resume / Reopen** — `studies.setRecruitmentStatus({status:'open'})` — reopens the same session (data continuous; not split).
- **Stop collecting** — `studies.setRecruitmentStatus({status:'closed'})`, behind an inline confirm — terminal-by-intent (data retained, Results stays available); reversible via Reopen.
- All transitions `router.refresh()` so the panel re-renders the new state.

## Edge cases

- **Re-freezing while recruiting** (e.g. preregister/publish a v2 while v1 is open) is a separate, known footgun handled by the drift-visibility + re-freeze-carry-over work — not by this panel. Until that lands, the safe sequence is: **Stop** the current version, then freeze/amend, then **Open** the new version.
- **No session yet** — Pause/Stop are not offered; only Open.
- **Paused link** — `resolveOpenRecruitment` returns null, so `/take` shows the "not available" state; the participant runtime also rejects a non-`open` session defensively.

## Accessibility notes

- Status chips are text (not color-only). Pause/Resume/Stop are real buttons with pending states (spinners) and descriptive labels; the Stop confirm is keyboard-operable (Stop now / Cancel buttons, not a native `confirm()`).

## Open questions

- Whether Stop should also auto-snapshot/lock the dataset — out of scope; deferred with the re-freeze work.
