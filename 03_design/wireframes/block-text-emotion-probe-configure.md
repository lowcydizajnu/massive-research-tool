# Wireframe spec — Text emotion probe · Configure

- **Serves user flow:** [Hanna builds a study](../../02_product/user-flows/hanna-build-a-study.md) (Build-stage block configuration)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Build stage → right-panel Configure
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher author a block where **the emotion in a participant's written answer is the measure** — a prompt + a free-text answer that is always analyzed by Hume's Language model (ADR-0066 H3a/H4b). Unlike the free-text block's optional emotion toggle, analysis is intrinsic and cannot be turned off.

## Layout

Uses the generic Configure form (prompt + text fields) plus the shared emotion panel in its **always-on** variant (no enable checkbox). Single column: prompt → long-form toggle → required → max-length → emotion panel (Hume badge + language) → Remove.

## Content inventory

- **Prompt** — textarea; what the participant reads. Source: config.
- **Long-form** — boolean; single line vs paragraph box. Source: config.
- **Required** — boolean. Source: config.
- **Max length** — integer 1–10000 (default 1000). Source: config.
- **Emotion analysis (always on)** — labelled panel: analysis runs after submit; sensitivity = participant data (not biometric); ≈ $0.001/response billed to the workspace Hume key. Source: static + config.
- **Language** — dropdown: "Auto-detect (recommended)" + the 29 Hume BCP-47 languages. Sets `emotionAnalysis.language`. Source: config.
- **No-Hume notice** — if no Hume connection: "Connect Hume in Settings → Workspace → AI providers to run this."

## States

- **Default** — prompt empty, long-form on, max-length 1000, language auto.
- **Loading** — connection-list query in-flight → no-Hume notice hidden until known.
- **Empty** — prompt blank → incomplete (`isComplete` false).
- **Partial** — prompt set: valid, ready.
- **Error** — no Hume connection → notice (advisory, not blocking authoring).
- **Success** — config autosaves via `studies.updateBlockConfig`.

## Interactions

- **Prompt / long-form / required / max-length** — generic field editors; change → debounced autosave.
- **Language dropdown** — writes `emotionAnalysis.language` (empty clears → auto-detect); merge-write preserves `enabled/provider/modality`.
- **Remove** — removes the block.

## Edge cases

- Very long prompt — textarea scrolls.
- No Hume connection — authorable; won't analyze until connected (job flags `failed`).
- No biometric/PII layer needed (text = participant data) — still subject to the workspace "allow external AI on participant data" setting.
- Empty / whitespace answer at runtime — not analyzed (job skips; no spurious row).

## Accessibility notes

- Always-on emotion panel is a labelled group, not a disabled checkbox.
- Language `<select>` has a visible label.
- Notices reuse the free-text emotion toggle's contrast tokens.

## Open questions

- None for V2.1.
