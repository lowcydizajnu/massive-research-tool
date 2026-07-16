# Wireframe spec — Preregister stage

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher freeze the current design as an immutable, citable **Preregistration** and (if they've connected a registry) push it to the OSF — turning "I should preregister" into one button, with honest status about where the record lives. Implements ADR-0005 (push) + ADR-0002/0012 (immutable snapshot) + [ADR-0101](../../04_architecture/adrs/0101-preregistration-templates-typed-fields.md) (which registration template is filed, and the plan-before-data gate). Speaks researcher-native vocabulary: the surface says **Preregister / Preregistration / Saved version**, never "freeze a version" or "commit".

The **plan itself is authored on the [Overview stage](overview-stage.md)** — template choice + typed fields. This stage only freezes and files it.

## Layout

The Build-stage shell, reused (faithful to `build-stage-builder-mode.md`): the floating **StageTabs** pill on parchment (`Build · Preview · Share · Preregister · Run · Results`) with **Preregister** now active; below it a single work-surface card (`surface.canvas`, `radius.lg`, `shadow.md`). The card has three stacked zones:

1. **Header** — Plex Serif study title + a one-line subtitle (`text.secondary`): "Preregister this design to the Open Science Framework."
2. **Registry status row** — a chip + sentence stating the OSF connection state, with a link to **Settings · Connections** when disconnected.
3. **Action / receipt zone** — either the **Preregister** primary action (with a short "what this does" note) when no preregistration exists yet, or the **preregistration receipt** (version label + push-status banner + OSF link) once one does.

## Content inventory

- **Study title** — from server (`experiment.title`), Plex Serif, truncates with ellipsis past one line.
- **Stage subtitle** — static explainer copy.
- **Connection chip** — computed from `registry.getConnection`: "OSF connected" (`success` tone) or "OSF not connected" (`warning` tone).
- **Connect prompt** — static, shown only when disconnected: "Connect your OSF account in Settings · Connections to push automatically." → link to `/settings/account`.
- **Preregister explainer** — static: "This saves an immutable, timestamped snapshot of your current design. You can still keep editing your working draft afterwards."
- **Template line** (ADR-0101) — a quiet line stating which registration template will be filed: "Filing as: **Open-ended**" / "Filing as: **Replication recipe**" + a "Change in Overview →" link. Read-only here; the choice lives on the Overview stage. This exists so the researcher is never surprised by which OSF form their plan lands in — it used to be chosen invisibly from replication intent.
- **Plan-before-data gate** (ADR-0101) — when the study has recorded a participant response or is finished, the action zone shows a `warning`-tone blocking notice **in place of** the Preregister button: "This study has already recorded participant responses." + detail "A preregistration is a plan made *before* the data exist — that's the guarantee it carries, so it can't be added now. Your design is still fully shareable: save a Saved version, or publish a Record." + links to the Run stage and the Record. The button is **absent**, not merely disabled (there is no override — see Edge cases).
  Copy note: `warning`, not `danger`, and it does **not** scold. Anyone seeing this reached it legitimately — they published rather than preregistered, and then ran the study. The notice states the constraint and points at what they *can* do; it must never imply they did something wrong.
- **Preregister button** — primary action; label "Preregister". Shown only when the plan-before-data gate passes.
- **Preregistration receipt** (once a `preregistered` version exists): **version label** (`Preregistration v{n}`, from server), **push-status banner** (see States), **OSF registration link** (`external_registration_url`, when present), **DOI line** ("DOI: pending approval" or the DOI when backfilled).
- **Amendment affordance** (audit step 4, ADR-0004 — shipped): on the receipt (a preregistered version exists), a **"File an amendment"** action opens an inline form — a required **change-summary** textarea + an optional **classification** select (typo / methodological-correction / clarification / scope-change / other) + **File amendment** / **Cancel**. It freezes the current working draft as a new preregistered version that **supersedes** the latest, and re-pushes to OSF as an amendment on the same project node. Gated by the same pre-flight checklist as Preregister. A **lineage line** ("Amends v{n} — {change summary}") shows when the current preregistration is itself an amendment.

## States

- **Default — not yet preregistered, connected:** explainer + enabled **Preregister** button. Connection chip = "OSF connected".
- **Default — not yet preregistered, disconnected:** same, plus the connect prompt; the **Preregister** button stays enabled (preregistering still freezes a citable version locally; it parks as "not pushed — connect OSF to push").
- **Blocked — participant responses already recorded (ADR-0101):** the `warning` blocking notice replaces the Preregister button (no override). Reached when a participant response exists for the study, or the study is finished. Everything else on the stage still renders (the researcher can read their plan and the template line). Note recruitment being *open* is not enough — see Edge cases.
- **Submitting:** button shows a busy state, disabled, `aria-busy`.
- **Preregistered · pending (`pending`):** banner (`info` tone) "Preregistered — pushing to OSF…". Shown immediately after submit while the background job runs.
- **Preregistered · pushed (`pushed`):** banner (`success` tone) "Submitted to OSF — pending your approval there to finalize." + the OSF link + a DOI line "minted by OSF once you approve the registration there". `pushed` means *submitted* (OSF's `require_approval()` leaves it pending), NOT approved/public — ADR-0005 amendment 2026-06-03. Communication is one-way (push only) in V1.5: approval/DOI/withdrawal on OSF are not reflected back until DOI-backfill polling lands (V1.6). The DOI line updates once backfilled.
- **Preregistered · no credentials (`no_credentials`):** banner (`warning` tone) "Preregistered locally — not pushed. Connect OSF to push this registration." + link to Settings.
- **Preregistered · failed (`failed`):** banner (`danger` tone) "OSF push failed." + the recorded error (truncated). V1.5 relies on the job runner's automatic retries; copy reads "We'll retry automatically." (explicit Retry is a V1.6 follow-up).
- **Loading:** the page is server-rendered; the post-submit transition to `pending` is the only async UI.
- **Error (submit failed):** inline `alert` "Couldn't preregister. Try again." — the version was not created.

## Interactions

- **Preregister button** — calls `studies.preregister({ studyId })` (tRPC mutation via the HTTP client). System response: a `preregistered` version is created; the receipt zone replaces the action zone and shows the `pending` (connected) or `no_credentials` (disconnected) banner. Error path: inline alert, no version created.
- **OSF link** — opens the registration on osf.io in a new tab (`rel="noreferrer"`).
- **Connect link / Settings link** — navigates to `/settings/account` (Connections tab).
- **Withdraw registration** (ADR-0005 am. 3) — shown in the receipt zone **only when `pushStatus === "pushed"`** (the registration is actually on OSF). Collapsed by default as a quiet danger-tone "Withdraw registration…" link; expands to a warning + a **required** justification textarea + a danger **Request withdrawal** button (+ Cancel). Calls `studies.withdrawRegistration({ studyId, reason })`, which PATCHes OSF with `pending_withdrawal` + `withdrawal_justification`. System response on success: the affordance is replaced by a warning live region — "Withdrawal requested on OSF. Approve it on OSF to finalize" — because OSF finalizes the public tombstone only after the registration's contributors approve (two-step by OSF's design). Irreversible; that's why it's collapsed, justification-gated, and consequence-labelled. Write-gated (absent/disabled for viewers).
- **Withdrawn state** (ADR-0005 am. 3) — once OSF reports the registration `withdrawn` (synced by **Check OSF status** / `refreshRegistration`, persisted to `registration_withdrawn`), the receipt swaps the push banner for a neutral "Withdrawn on OSF — public tombstone; DOI still resolves" note and **hides** both the Withdraw affordance and the Amend button (nothing live to amend). **Check OSF status** now shows whenever the registration is pushed and not-yet-withdrawn (not only before the DOI), so a finalized withdrawal can be pulled back into the app.

## Edge cases

- **Already preregistered:** the action zone is replaced by the receipt; V1.5 shows a single preregistration (no re-preregister button — amendments are V1.6).
- **Empty design:** preregistering an empty study is allowed but discouraged; show the same advisory (non-blocking) incomplete-blocks warning the Save dialog uses, if any blocks need setup.
- **Very long title:** truncates in the header; full title available via `title` attribute.
- **Push pending for a long time / job lag:** banner stays `pending`; the page reflects whatever `registry_push_status` currently is on reload (no live polling in V1.5).
- **Permissions:** a viewer cannot preregister — the button is absent (write-gated, mirrors the mutation's `writeProcedure` FORBIDDEN).
- **Plan-before-data gate is hard, with no override (ADR-0101).** Unlike the rest of the pre-flight checklist — which is deliberately advisory-with-friction on the principle of researcher autonomy — this one cannot be proceeded past, because the thing it protects *is* the meaning of the word: a plan filed after the data exist is not a *pre*registration, and no amount of researcher intent makes it one. Enforced server-side in the `preregister` mutation (`PRECONDITION_FAILED`), mirroring how the ADR-0084 branding/IRB gate is advisory on the checklist and enforced in the freeze mutations. The UI must never render an enabled Preregister button in this state — the server would reject it anyway, and offering it would be a lie.
- **The trigger is a recorded participant response — not opening recruitment** (owner direction 2026-07-15). Opening recruitment and closing it again with nobody having taken the study leaves the plan demonstrably pre-data, so it must not burn the researcher's right to preregister. The researcher's own **Preview** runs never count either (`response.mode = "preview"`) — otherwise previewing your own study would lock you out of preregistering it.
- **The first real response is therefore the one-way door**, and in practice it is a narrow one: recruitment cannot open until a study is preregistered *or* published, so the normal path (preregister → recruit → amend) never meets this gate at all. It only refuses the researcher who published **instead of** preregistering, collected real data, and now wants to call the plan a preregistration retroactively. The honest alternatives stay open and are named in the blocking copy: a Saved version (still immutable + citable) or a published Record.
- **Amendments are exempt.** Filing an amendment *after* collection starts is legitimate and stays available — documenting a mid-flight change is precisely what ADR-0004 amendments exist for. The gate applies to the first preregistration only; `amend` is not gated by it.
- **Already-preregistered studies are unaffected.** The gate is evaluated when creating a preregistration, so an existing preregistration + its receipt render normally once the study starts running.

## Accessibility notes

- The status banner is a live region (`role="status"` for info/success/warning, `role="alert"` for failure/submit-error) so the outcome is announced.
- The **Preregister** button uses `aria-busy` while submitting; focus stays on it, then moves to the receipt banner on success.
- Connection chip is not color-only: it pairs tone with text ("OSF connected" / "not connected").
- StageTabs: the active **Preregister** tab carries `aria-current="page"`; inert tabs are `aria-disabled`.

## Open questions

- Should the receipt also surface the OSF **project node** link (the draft's parent node), or only the registration? Leaning: registration only — the node is an implementation detail.
- Embargo option (register now, reveal later) — deferred; V1.5 registers immediately.
