# Wireframe spec — Voice emotion probe · Configure

- **Serves user flow:** [Hanna builds a study](../../02_product/user-flows/hanna-build-a-study.md) (Build-stage block configuration)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Build stage → right-panel Configure
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher author a block where **the emotion in a participant's spoken answer is the measure** — a prompt + a recorded voice answer that is always analyzed by Hume (ADR-0066 H3a/H3b). Unlike the audio-record block's optional emotion toggle, here analysis is intrinsic and cannot be turned off.

## Layout

Uses the generic Configure form (prompt + recording fields) plus the shared emotion panel rendered in its **always-on** variant (no enable checkbox). Single column in the right panel: prompt → recording-duration → required → emotion panel (Hume badge + language + PII note) → Remove.

## Content inventory

- **Prompt** — textarea; what the participant reads before recording. Source: config.
- **Recording duration (seconds)** — integer 5–300 (default 60). Source: config.
- **Required** — boolean; whether the participant must record to continue. Source: config.
- **Emotion analysis (always on)** — a labelled panel (not a checkbox) stating analysis runs after submit; sensitivity = PII (biometric voice); ≈ $0.005/response billed to the workspace Hume key. Source: static + config.
- **Language** — dropdown: "Auto-detect (recommended)" + the 29 Hume BCP-47 languages (`lib/ai/hume-languages.ts`). Sets `emotionAnalysis.language`. Source: config.
- **No-Hume notice** — if the workspace lacks a Hume connection: "Connect Hume in Settings → Workspace → AI providers to run this."
- **PII note** — "Voice analysis requires the workspace PII opt-in (Settings → Workspace)."

## States

- **Default** — prompt empty, duration 60, language auto, emotion panel shown as always-on.
- **Loading** — connection-list query in-flight → the no-Hume notice stays hidden until known.
- **Empty** — prompt blank → block is incomplete (`isComplete` false); picker/preflight flags it.
- **Partial** — prompt set, language auto: valid, ready.
- **Error** — no Hume connection → the no-Hume notice; missing PII opt-in → the PII note (both advisory, not blocking authoring).
- **Success** — config autosaves via `studies.updateBlockConfig` like every other block.

## Interactions

- **Prompt / duration / required** — generic field editors; change → debounced autosave.
- **Language dropdown** — select → writes `emotionAnalysis.language` (empty value clears it → auto-detect); merge-write preserves `enabled/provider/modality`.
- **Remove** — removes the block (shared affordance).

## Edge cases

- Very long prompt — textarea scrolls; no hard limit beyond the generic field.
- No Hume connection — authoring still allowed; the block won't analyze until connected (job flags `failed`).
- Workspace PII opt-in off — authorable, but voice analysis is blocked at the gateway until opted in.
- Language mismatched to the recording — Hume still returns a vector; accuracy may drop (auto-detect is the safe default).

## Accessibility notes

- The always-on emotion panel is a labelled group, not a disabled checkbox (avoids implying it can be toggled).
- Language `<select>` has a visible label; options are plain text.
- Notices use the same text-contrast tokens as the audio-record emotion toggle.

## Open questions

- Per-block participant audio retention (`never|session|retained`) is stored in config (default `session`) but not yet enforced by a purge sweeper — surface a control only once retention is enforced (separate stream). Until then no purge is claimed in copy.
