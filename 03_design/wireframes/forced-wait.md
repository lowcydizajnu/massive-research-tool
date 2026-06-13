# Wireframe spec — Forced wait

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Build stage · block](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Disable Continue for N seconds so participants spend a minimum time on a screen (e.g. reading instructions or a stimulus). Records how long they actually waited.

## Layout

Optional instruction text, then a countdown ("You can continue in 8s…") beneath; the screen's Continue button is disabled until the countdown ends.

## Content inventory

- **Content** (instruction text), **waitSeconds** (minimum), **required** (n/a).
- Records `{waitedMs}` (client-measured).

## States

- **Default** — as drawn.
- **Loading** — the client island hydrates; before hydration the stimulus is visible (timed-exposure) / Continue is enabled (forced-wait) — honest no-JS degradation.
- **Empty** — unconfigured shows the builder "Needs setup" chip.
- **Partial** — n/a (timing telemetry only).
- **Error** — n/a (never rejects on timing — ADR-0040).
- **Success** — timing recorded; advances.

## Interactions

- On mount the island disables the `data-take-continue` button and shows a live countdown; at zero it re-enables Continue.

## Edge cases

- No-JS → Continue stays enabled (gate is a client enhancement, ADR-0040).
- Multiple forced-waits on one grouped screen → the longest wins (each disables until its own timer; Continue re-enables only when all elapse).

## Accessibility notes

- The countdown is `aria-live=polite`; the disabled Continue uses the native `disabled` attribute (announced). Re-enable is automatic, no pointer needed.

## Open questions

- None blocking; server-enforced timing is an ADR-0040 revisit trigger.
