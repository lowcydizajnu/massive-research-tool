# Wireframe spec — Timed exposure

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Show a stimulus (text and/or image) for exactly N milliseconds, then hide it — the limited-exposure paradigm for memory/misinformation studies. Records the actual time it was shown (client-measured).

## Layout

The stimulus fills the card; after `exposureMs` it is replaced by a muted "(stimulus hidden)" placeholder. Continue stays available throughout.

## Content inventory

- **Content** (text), **imageUrl?** (optional), **exposureMs** (display duration), **required** (n/a — never blocks).
- Records `{shownMs}` — client-measured actual display time (honest telemetry, not server-verified).

## States

- **Default** — as drawn.
- **Loading** — the client island hydrates; before hydration the stimulus is visible (timed-exposure) / Continue is enabled (forced-wait) — honest no-JS degradation.
- **Empty** — unconfigured shows the builder "Needs setup" chip.
- **Partial** — n/a (timing telemetry only).
- **Error** — n/a (never rejects on timing — ADR-0040).
- **Success** — timing recorded; advances.

## Interactions

- On mount the stimulus shows; a timer hides it after `exposureMs`; the participant clicks Continue when ready.

## Edge cases

- Tab blur / slow device → shownMs may exceed exposureMs; stored as-is (client-measured, ADR-0040).
- No-JS → stimulus stays visible (no enforced hide); honest degradation.

## Accessibility notes

- The hidden placeholder is announced via `aria-live`; the stimulus has its real text/alt. Continue is the native submit button.

## Open questions

- None blocking; server-enforced timing is an ADR-0040 revisit trigger.
