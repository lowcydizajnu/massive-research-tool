# Wireframe spec — Audio-stimulus block · Configure

- **Serves user flow:** [Hanna builds a study](../../02_product/user-flows/hanna-build-a-study.md) (Build-stage block configuration)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Build stage → right-panel Configure
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher author a spoken stimulus: write a script + a delivery direction, generate the audio (Hume Octave TTS, ADR-0069), and preview it — so participants later hear a controlled, emotionally-shaped clip (no recording studio). Generation is author-time and cached; the block stores the resulting audio URL.

## Layout

Replaces the generic Configure form for `audio-stimulus` (like `ai-chat` has its own panel). Single column in the right panel: title field → Script → Delivery direction → Playback → Generate button + status → audio preview player (when generated) → cost note → Remove.

## Content inventory

- **Block title** — researcher-set label (optional; falls back to "Audio stimulus").
- **Script** — textarea; the words spoken (max ~500 chars). Source: config.
- **Delivery direction** — input; an acting prompt ("anxious, urgent newsreader"); Octave shapes prosody from it. Optional. Source: config.
- **Playback** — radio: Play once / Replayable / Forced-listen (Continue gated until it finishes). Source: config.
- **Generate audio** — `PendingButton`; calls `studies.generateStimulusAudio`; disabled when the script is empty.
- **Status line** — `aria-live`: "Generating…", "Generated (cached)", or an error.
- **Audio preview** — a native `<audio controls>` playing the generated `/api/media/<key>` URL, shown once generated.
- **Stale hint** — when the current script/direction differ from what produced the stored audio: "Script changed — regenerate to update the audio."
- **Cost note** — advisory "≈ a few cents per generation; identical inputs are free (cached). Billed to your Hume key."
- **No-Hume notice** — if the workspace has no Hume connection: "Connect Hume in Settings → Workspace to generate audio," with a link.

## States

- **Default / not generated** — script empty or never generated; Generate disabled until script non-empty.
- **Generating** — spinner "Generating…"; button disabled.
- **Generated** — preview player + "Generated" (or "Generated (cached)").
- **Stale** — generated audio exists but inputs changed → stale hint + Regenerate.
- **Error** — generation failed (no Hume key / vendor error / budget cap) → red line with the reason; prior audio (if any) preserved.

## Interactions

- **Script / direction edit** — autosave on blur (existing config autosave); editing after generation sets the stale hint.
- **Playback change** — autosave immediately.
- **Generate** — `generateStimulusAudio({ studyId, instanceId })` → server reads the saved config, hashes inputs, cache-checks R2, calls `runTts` on miss, stores audio, writes the URL back to the block config; UI shows the player. Cache hit returns instantly.
- **Remove block** — existing remove affordance.

## Edge cases

- **Very long script** — soft cap ~500 chars with a counter; server also bounds it.
- **Generate before connecting Hume** — blocked with the no-Hume notice (server returns a clear error too).
- **Budget cap reached** — Generate returns the cap error; surfaced on the status line.
- **Repeated identical Generate** — cache hit, no new spend, "Generated (cached)".
- **Editing then publishing without regenerating** — preflight should warn (the block is incomplete until audio matches the current script); for V1, the stale hint + isComplete (audio URL present) cover it.

## Accessibility notes

- Script + direction are label-associated; the radio group is a labelled `radiogroup`.
- Status + stale lines are `aria-live="polite"`.
- The preview uses native `<audio controls>` (keyboard-operable, AT-labelled by the block title).

## Open questions

- Per-condition variants (different voice/direction per condition) — H5 follow-up; this spec is the single-variant case.
- The 10 vetted voice presets — deferred; this slice uses direction-only (Octave default voice).
