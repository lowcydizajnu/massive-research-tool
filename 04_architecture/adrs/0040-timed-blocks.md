# ADR 0040 — Client-timed exposure and forced-wait blocks

- **Status:** accepted
- **Date:** 2026-06-13
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** participant-runtime, blocks, timing

## Context

The block-expansion plan (designed by the block-expansion-design workflow + adversarial review) calls for two timing blocks: **timed-exposure** (show a stimulus for exactly N ms, then hide it — the limited-exposure paradigm central to misinformation/memory research) and **forced-wait** (the Continue button is disabled for N seconds — enforced reading/consideration time). Both need millisecond/second-accurate browser timing, which the participant runtime is otherwise server-rendered-MPA and JS-free.

`reaction-time` already established the precedent (ADR-0013): a small `"use client"` island inside the take form is an allowed exception. The open questions are (a) how timing islands control or report to the surrounding server-rendered shell, and (b) whether the server trusts client-reported timings.

## Options considered

### Trust model — Option A: record-but-never-trust (chosen) · Option B: server-verify

- **A:** the client measures `shownMs` / `waitedMs` and posts it; the server stores it verbatim as honest client-reported telemetry and NEVER rejects the answer on its basis (timing blocks never block progress on a timing value). Researchers know client timing is approximate (tab-blur, rAF jitter); the value is data, not a gate.
- **B:** the server would need a trusted clock per screen (record server-side render time, diff on submit) — fragile across resume/back, and still spoofable. Rejected: adds a write-path clock for marginal trust.

### Forced-wait ↔ shell contract — Option A: `data-take-continue` attribute (chosen) · Option B: lift Continue into a client component

- **A:** the screen's Continue button carries a stable `data-take-continue` attribute; the forced-wait island disables it on mount and re-enables after `waitSeconds`. A documented DOM contract keeps the shell server-rendered.
- **B:** making the whole screen footer a client component to pass a disabled prop would client-ify the navigation for every screen — disproportionate. Rejected.

No-JS: forced-wait leaves Continue enabled (the gate is a client enhancement; without JS the wait simply isn't enforced — honest degradation, same posture as drill-down).

## Decision

We will add timed-exposure and forced-wait as ADR-0013 client-JS island exceptions (`timed-exposure-input.tsx`, `forced-wait-input.tsx`). Both `collectsResponse: true` purely to store client-reported timing telemetry (`{shownMs}` / `{waitedMs}`); `isAnswerEmpty` returns false always (a timing block is never "blank" — it never blocks a required check), and `validateAnswer` only shape-checks (non-negative number when present). forced-wait gates the shell via the `data-take-continue` contract; timed-exposure hides its stimulus after `exposureMs` and lets the participant continue. The stored timing is documented as client-measured and not server-verified.

## Consequences

- **Easier:** the two canonical timing paradigms ship without server clock machinery; timing is honest telemetry researchers can filter on.
- **Harder:** a shell refactor must preserve `data-take-continue` (documented here as a contract); client timing precision is inherently approximate (note in the block descriptions).
- **Committed to:** record-but-never-trust; no server-side timing rejection; the DOM contract for Continue.
- **Precluded from:** hard server-enforced minimum exposure/wait (would need the rejected trusted-clock model; revisit if a study truly requires it).

## Revisit triggers

- A researcher needs server-enforced timing (e.g. fraud-sensitive RT studies) → add the trusted-clock model behind a per-block flag.
- The screen footer becomes a client component for other reasons → move the gate to a prop and drop the DOM contract.

## References

- block-expansion-design workflow plan + adversarial review (2026-06-13)
- [ADR-0013](0013-participant-runtime-and-analytics.md) (client-JS island exceptions; reaction-time precedent)
- Wireframes: [timed-exposure](../../03_design/wireframes/timed-exposure.md), [forced-wait](../../03_design/wireframes/forced-wait.md)
- Code: `components/feature/take/timed-exposure-input.tsx`, `forced-wait-input.tsx`; the `data-take-continue` button in the take screen page.
