# Wireframe — Preview (chrome-free, device-framed)

Status: building · Stage: Preview · Feature: V1.12 A4 · Owner: Claude (agent)
Refs: participant-runtime.md (the rendered content), build-stage-builder-mode.md (where Preview lives), ADR-0013 (participant runtime)

## Problem

V1.8.1's Preview rendered the participant `BlockView` **inline** inside the researcher chrome (TopBar + LeftRail + stage tabs). That doesn't reflect what a participant actually sees — the researcher chrome is noise. The owner wants Preview to show the real participant design, and to check it at common screen widths.

## Solution

The **Preview** stage opens a **full-viewport, chrome-free overlay** (fixed inset-0, above all researcher chrome) presenting the study exactly as a participant sees it, rendered through the same participant `BlockView` components. A slim control strip at the top lets the researcher switch device widths and escape.

```
┌──────────────────────────────────────────────────────────────┐
│  Preview · [ Desktop | Tablet | Mobile ]      Open in new tab  ✕│  ← control strip (researcher-only; not part of the participant view)
├──────────────────────────────────────────────────────────────┤
│                                                                │
│            ┌───────────────────────────────┐                  │
│            │  (participant runtime content) │  ← centered device frame at the selected width
│            │  block 1                        │     · Desktop = full / ~960px
│            │  block 2                        │     · Tablet  = 768px
│            │  …                              │     · Mobile  = 390px
│            └───────────────────────────────┘                  │
│                  dimmed page backdrop                          │
└──────────────────────────────────────────────────────────────┘
```

### Control strip (researcher chrome, not shown to participants)

- **Device toggle** — Desktop / Tablet / Mobile. Sets the frame width (Desktop = `min(100%, 960px)`, Tablet = 768px, Mobile = 390px). Default Desktop.
- **Open in new tab** — opens the same chrome-free preview URL in a new tab (for testing real browser resize / sharing the look with a colleague who has access).
- **✕ Close** — returns to the Builder (`/studies/[id]/build`).

### The frame

- A centered card at the selected width on a dimmed backdrop, scrollable. Renders every block through the participant `BlockView` (the same components `/take/*` uses), so the fidelity is real, not a mock.
- A small **"Preview — nothing is recorded"** ribbon (reuses `PreviewRibbon`) at the top of the frame; conditional blocks are all shown here with a note (same as V1.8.1), since there are no answers to branch on.
- When a per-study theme ships (V1.12 Section F), the frame applies that theme so the preview reflects the participant appearance exactly.

## Behavior / a11y

- The overlay is `role="dialog" aria-modal`, traps nothing destructive; ESC closes (→ Builder). Focus moves to the control strip on open.
- The device toggle is a `radiogroup`; arrow keys switch.
- Reduced-motion: no transition on width change beyond a short ease.

## Notes / deferred

- **Why an overlay, not an iframe to `/take`** — the participant `BlockView` is the exact component the runtime renders, so an in-page frame is faithful without standing up a throwaway preview *session* through the per-question `/take/[sessionId]/[q]` route. A future enhancement (max fidelity) can iframe a live preview session (`mode:"preview"`, ADR-0013) for true per-question navigation; the "Open in new tab" affordance is the seam for that.
- The old inline `/studies/[id]/preview` (with researcher chrome) is replaced by this chrome-free version at the same route; the Preview stage tab still navigates here.
