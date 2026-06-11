# Wireframe spec — Design stage (study theming)

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Studies › study › Design](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** reviewed

## Purpose

Let the researcher control what the **participant-facing** study looks like — pick a preset or tune granular primitives — so the study's appearance serves the research design (ecological validity), without ever touching the researcher-side workspace look.

## Layout

Stage tab **Design** between Build and Preview. Two-zone body inside the standard stage card:

- **Left — controls column (~360px, scrolls):**
  1. **Preset picker** — radio cards: Academic (default), Clinical, Modern, Playful. Picking one resets the primitives below to that preset; further tweaks flip the badge to "Custom (based on X)".
  2. **Colors** — Page background, Card background, Text, Muted text, Accent (native color inputs; values validated server-side).
  3. **Typography** — Heading font + Body font (selects from the curated list), Base text size (S/M/L).
  4. **Shape & spacing** — Corner radius (Sharp/Soft/Rounded/Pill), Block spacing (Compact/Normal/Spacious).
  5. **Page layout** — Page width (Narrow 480 / Medium 640 / Wide 800), Progress indicator (Bar/Step counter/None), Back button (Show/Hide).
  6. **Reset to preset** link.
- **Right — live sample (flex-1, sticky):** a non-interactive sample of the participant screen (progress header + a Likert card + a Continue button) rendered with the current theme applied as CSS variables, updating instantly as controls change. Below it: "Open real preview →" (Preview stage) for the genuine participant run.

## Content inventory

- **Preset cards** — name + 1-line description + 4 color dots; static from the preset registry (`lib/themes/presets.ts`).
- **Control fields** — current theme from the server (`studies.get` → `theme`), edited locally, autosaved via `studies.setTheme`.
- **Live sample** — static sample copy ("How credible is this post?" Likert), styled from local state; computed.
- **Saved indicator** — reuses the Builder's saved-toast pattern.
- **Footnote** — "Theme travels with this study's version: preregistering freezes it; participants always see the frozen look." (static).

## States

- **Default** — current theme loaded (Academic when never set).
- **Loading** — stage-card skeleton (same as other stages).
- **Empty** — n/a (a default theme always exists).
- **Error** — autosave failure toast with Retry (same pattern as Builder config saves).
- **Success / optimistic** — controls apply to the sample immediately; server write commits on change/blur.

## Interactions

- **Pick preset** — applies the preset's full primitive set; sample updates; autosaves.
- **Tweak primitive** — color/select/radio commit on change (color inputs on blur); sample updates immediately; badge becomes "Custom".
- **Reset to preset** — restores the active preset's values; autosaves.
- **Open real preview** — navigates to the Preview stage (real participant runtime with the saved theme).

## Edge cases

- Garbage color value pasted → server-side zod allowlist rejects; field reverts + toast.
- Long custom font name — impossible (curated select only).
- Theme set, then study preregistered → the frozen copy renders with the frozen theme even after the draft theme changes.
- Replication of a themed study → theme copies with the protocol (fork carries the snapshot).
- Old studies with no theme → Academic default; no migration needed.

## Accessibility notes

- All controls are native inputs with visible labels; color inputs additionally show the hex value as text.
- The live sample is `aria-hidden` (a decorative duplicate of real content). Researcher-chosen contrast is their responsibility, but a low-contrast warning line appears when text/background contrast < 4.5:1 (computed client-side).
- Radio groups use `fieldset`/`legend`; keyboard operable end-to-end.

## Open questions

- Platform-mimicking presets (Facebook/X/News/…) — Wave 5 continued, gated on ADR-0024's IRB-acknowledgment design.
- Multi-question single-page layout — deferred; question groups (ADR-0028) already cover multi-block screens.
- Participant-copy editing (consent/thanks/buttons) — Section G, separate slice.
