# Wireframe spec — Preregister stage

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher freeze the current design as an immutable, citable **Preregistration** and (if they've connected a registry) push it to the OSF — turning "I should preregister" into one button, with honest status about where the record lives. Implements ADR-0005 (push) + ADR-0002/0012 (immutable snapshot). Speaks researcher-native vocabulary: the surface says **Preregister / Preregistration / Saved version**, never "freeze a version" or "commit".

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
- **Preregister button** — primary action; label "Preregister".
- **Preregistration receipt** (once a `preregistered` version exists): **version label** (`Preregistration v{n}`, from server), **push-status banner** (see States), **OSF registration link** (`external_registration_url`, when present), **DOI line** ("DOI: pending approval" or the DOI when backfilled).
- **Amendment note** — static, muted: "Need to change a preregistered design? Amendments arrive in a later release." (ADR-0004 is V1.6.)

## States

- **Default — not yet preregistered, connected:** explainer + enabled **Preregister** button. Connection chip = "OSF connected".
- **Default — not yet preregistered, disconnected:** same, plus the connect prompt; the **Preregister** button stays enabled (preregistering still freezes a citable version locally; it parks as "not pushed — connect OSF to push").
- **Submitting:** button shows a busy state, disabled, `aria-busy`.
- **Preregistered · pending (`pending`):** banner (`info` tone) "Preregistered — pushing to OSF…". Shown immediately after submit while the background job runs.
- **Preregistered · pushed (`pushed`):** banner (`success` tone) "Preregistered on OSF." + the OSF link + "DOI: pending approval" (OSF mints the DOI on approval — ADR-0005 amendment 2026-06-03; the line updates to the DOI once backfilled).
- **Preregistered · no credentials (`no_credentials`):** banner (`warning` tone) "Preregistered locally — not pushed. Connect OSF to push this registration." + link to Settings.
- **Preregistered · failed (`failed`):** banner (`danger` tone) "OSF push failed." + the recorded error (truncated). V1.5 relies on the job runner's automatic retries; copy reads "We'll retry automatically." (explicit Retry is a V1.6 follow-up).
- **Loading:** the page is server-rendered; the post-submit transition to `pending` is the only async UI.
- **Error (submit failed):** inline `alert` "Couldn't preregister. Try again." — the version was not created.

## Interactions

- **Preregister button** — calls `studies.preregister({ studyId })` (tRPC mutation via the HTTP client). System response: a `preregistered` version is created; the receipt zone replaces the action zone and shows the `pending` (connected) or `no_credentials` (disconnected) banner. Error path: inline alert, no version created.
- **OSF link** — opens the registration on osf.io in a new tab (`rel="noreferrer"`).
- **Connect link / Settings link** — navigates to `/settings/account` (Connections tab).

## Edge cases

- **Already preregistered:** the action zone is replaced by the receipt; V1.5 shows a single preregistration (no re-preregister button — amendments are V1.6).
- **Empty design:** preregistering an empty study is allowed but discouraged; show the same advisory (non-blocking) incomplete-blocks warning the Save dialog uses, if any blocks need setup.
- **Very long title:** truncates in the header; full title available via `title` attribute.
- **Push pending for a long time / job lag:** banner stays `pending`; the page reflects whatever `registry_push_status` currently is on reload (no live polling in V1.5).
- **Permissions:** a viewer cannot preregister — the button is absent (write-gated, mirrors the mutation's `writeProcedure` FORBIDDEN).

## Accessibility notes

- The status banner is a live region (`role="status"` for info/success/warning, `role="alert"` for failure/submit-error) so the outcome is announced.
- The **Preregister** button uses `aria-busy` while submitting; focus stays on it, then moves to the receipt banner on success.
- Connection chip is not color-only: it pairs tone with text ("OSF connected" / "not connected").
- StageTabs: the active **Preregister** tab carries `aria-current="page"`; inert tabs are `aria-disabled`.

## Open questions

- Should the receipt also surface the OSF **project node** link (the draft's parent node), or only the registration? Leaning: registration only — the node is an implementation detail.
- Embargo option (register now, reveal later) — deferred; V1.5 registers immediately.
