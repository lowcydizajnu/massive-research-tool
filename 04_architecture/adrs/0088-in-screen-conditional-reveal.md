# ADR 0088 — In-screen conditional reveal (same-screen dynamic blocks)

- **Status:** accepted
- **Date:** 2026-07-01
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** runtime, builder, conditions, social-post

## Context

Conditions today gate whole **screens** on answers from **earlier** screens
(ADR-0021 + ADR-0028): `resolveVisibleScreens` evaluates each screen's condition
against prior answers, server-side, at navigation time. So a block inside a group
(one screen, all blocks rendered together) can't be gated on a *sibling* on the
same screen — the sibling's answer doesn't exist when the screen renders. A
researcher who put a social post + a video in one group and set "show the video
if the post reaction is X" saw it silently not apply (the owner's report).

The owner wants that to work **dynamically, in place**: the video appears on the
same screen the moment the participant reacts — progressive disclosure within a
screen, no Continue in between. This is the counterpart to ADR-0087 (which gates
*Continue* on interactions); here we gate a *block's visibility* on a sibling's
live state.

The pieces exist: the condition model + evaluator (`evaluateCondition`,
reaction-as-source), and the ADR-0087 `InteractionGate` pattern of watching the
screen `<form>` with a MutationObserver to read live state client-side.

## Options considered

### Option A — A new `revealWhen` field, separate from `showIf`

- **Pros:** explicit split of "screen gate" vs "in-screen reveal".
- **Cons:** a second condition concept + builder for the same mental model; the
  researcher already tried to express it via `showIf`.

### Option B — Reuse `showIf`; a same-group reference ⇒ client-side reveal (chosen)

- When a grouped block's `showIf` references **same-group siblings**, the runtime
  renders the block hidden and a client `RevealGate` reveals it once the live
  sibling state satisfies the condition (reusing the ADR-0087 form-observer). A
  `showIf` referencing **earlier-screen** blocks stays a server screen gate.
- **Pros:** one mental model + one builder; fixes the reported gap directly;
  reuses the evaluator + the form-observer.
- **Cons:** `showIf` now has two evaluation sites (server cross-screen, client
  same-screen); recording must skip a never-revealed block.

### Option C — A general client reactive-visibility framework

- **Cons:** over-general, large, unneeded for the stated use.

## Decision

**We will make a grouped block's `showIf` that references same-group siblings
evaluate client-side and reveal the block in place** (Option B). The take screen
renders such a block inside a `RevealGate`: hidden until its condition is met
against live form state (social-post interactions via the ADR-0087 tally; other
blocks via their form values), then revealed. A never-revealed block records
**nothing** (the take action already skips no-answer blocks; the gate also keeps a
hidden block from tripping required-answer validation). Cross-screen `showIf`
sources are unchanged (server screen gate); a `showIf` mixing same-screen +
earlier-screen sources gates the screen server-side on the earlier part and
reveals in-screen on the same-screen part. The condition builder is unchanged — a
grouped block can already target an earlier sibling; we add a one-line hint that a
same-screen source reveals the block live.

## Consequences

- **Easier:** true progressive disclosure within a screen (react → video appears);
  the reported "conditions in a group don't work" gap is resolved.
- **Harder:** `showIf` gains a dual evaluation path; the runtime classifies each
  clause source as same-screen vs earlier-screen; recording treats a hidden block
  as absent (no required-answer error for an unrevealed block).
- **Committed to:** conditions stay the single "show this when …" concept; reuses
  `showIf` in the snapshot — no new field, no migration.
- **Precluded (for now):** reveal-and-re-hide (v1 is reveal-and-stay — simpler +
  never discards a partially-entered answer); animated reordering.

## Revisit triggers

- Researchers want toggle (reveal-and-re-hide) semantics.
- In-screen reveal needs a driver other than a sibling block.
- The condition evaluator or the form-observer contract changes.

## References

- ADR-0021 (answer conditions), ADR-0028 (groups = screens), ADR-0087
  (interaction gating + `InteractionGate` form-observer), the social-post
  conditioning work (reaction as a condition source).
- `lib/whiteboard/conditions.ts`, `lib/whiteboard/screens.ts`,
  `server/runtime/participant.ts`, `components/feature/take/interaction-gate.tsx`,
  the take screen page.
