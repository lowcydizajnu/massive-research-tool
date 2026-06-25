# Wireframe spec — Audio-stimulus block · Take (participant)

- **Serves user flow:** [Participant takes a study](../../02_product/user-flows/participant-take-a-study.md) (participant runtime)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — /take participant surface
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md) (surface serves the recruited participant; authored for the operator's study)
- **Status:** draft

## Purpose

Play the researcher-generated audio stimulus to the participant inside the take flow (ADR-0069). It collects no response — it's a delivery block — but its playback rule can gate the Continue button (forced-listen).

## Layout

A single card in the take flow: optional caption/label, a play control with elapsed/remaining time, and (for non-forced modes) standard audio controls. Sits in the normal block position; the page Continue button lives in the take chrome below.

## Content inventory

- **Audio player** — plays the block's stored `/api/media/<key>` URL. Source: block config (`audioUrl`).
- **Play / pause control** — large, themed; shows remaining time.
- **Plays-remaining indicator** — for "play once"/"play N", e.g. "Plays remaining: 1".
- **Forced-listen note** — when gated: "Please listen to the end to continue."

## States

- **Idle** — not yet played; prominent Play.
- **Playing** — progress + remaining time; pause (unless forced-listen disables pause).
- **Ended** — for play-once the control disables; for replayable it resets.
- **Forced-listen, not finished** — the take chrome's Continue is disabled until `ended` fires once.
- **Missing audio** — if `audioUrl` is absent (study published without generating): a neutral "This audio isn't available — please contact the researcher" (should be prevented by Builder isComplete, but fail safe).

## Interactions

- **Play** — starts playback; on `ended`, marks the block listened (enables Continue for forced-listen) and decrements plays-remaining.
- **Pause/seek** — allowed for replayable; suppressed for forced-listen (no scrubbing past unheard audio).
- **Continue** — take chrome; gated by forced-listen completion when configured.

## Edge cases

- **Autoplay blocked** — browsers block autoplay; always require an explicit Play (no reliance on autoplay).
- **Slow network / large clip** — show a loading state on the control; don't gate Continue on a clip that failed to load (surface an error instead of trapping the participant).
- **Re-entry / back navigation** — if the participant returns, forced-listen is already satisfied (don't re-trap).
- **Mobile / no audio output** — native controls + a visible note; participant can still proceed unless forced-listen.

## Accessibility notes

- Native `<audio>` element (keyboard-operable, screen-reader-labelled by the caption/title).
- Forced-listen must not trap keyboard focus; the disabled Continue has an `aria-describedby` explaining why.
- Respect reduced-motion for any progress animation.

## Open questions

- Exact forced-listen UX when the clip fails to load (proceed vs. retry) — confirm in build.
- Per-condition variant selection at run time (which clip plays for the participant's condition) — H5 follow-up.
