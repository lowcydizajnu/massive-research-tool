# ADR 0087 — Screen-level interaction gating for social-post groups

- **Status:** accepted
- **Date:** 2026-07-01
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** runtime, builder, social-post, data-model

## Context

Researchers running misinformation studies need participants to *engage* with a
stimulus screen before advancing — not just view it. Today the only continue-gate
we have is `video.requireFullWatch` (ADR-0040 family), which blocks the screen's
Continue (`[data-take-continue]`) until a clip ends. There is no equivalent for a
social-post: a participant can land on a post and click Continue without ever
liking, commenting, or reporting.

The owner wants (ported from a prior tool): for a **group screen that contains a
social post**, a Configure control to require *N* interactions of chosen kinds
(likes, comments, reports, shares, any-interaction, like-or-dislike combined, a
specific reaction) before Continue unlocks, plus an optional **max time for the
screen** after which the participant auto-advances regardless. The participant
sees live progress chips (`Like 0/1`, `Comment 0/1`, …) and a disabled Continue
until the requirements are satisfied.

Groups already render as a single screen (ADR-0028); their config lives on the
`StudyGroup` object in `definition_snapshot.groups` (`{id, title?, showIf?,
moduleId?}`), edited via `studies.setGroups`. Social-post interactions are already
captured client-side through the `ReactionGroup` context + hidden form inputs
(`${np}liked/shared/reactionKey/comment/reply`) and recorded as the block's answer
(ADR-0085). This ADR adds the gating layer on top of that existing machinery.

## Options considered

### Option A — Per-block `requireInteraction` config on the social-post block

- Each social-post block carries its own requirement + gates the screen.
- **Pros:** reuses the block config surface; natural for a lone post.
- **Cons:** owner wants **whole-screen** semantics (sum across posts in a group);
  a block doesn't own the screen's Continue or its max-time; multi-post screens
  would fight over the gate.

### Option B — Screen-level gating on the `StudyGroup` (chosen)

- Extend `StudyGroup` with `maxTimeSec?` + `interactionRequirements?[]`. The take
  runtime evaluates them against the live interaction state of *all* social posts
  on that screen and gates the screen's Continue; a timer auto-advances at
  `maxTimeSec`.
- **Pros:** matches the owner's whole-screen model; one place to configure; reuses
  the `[data-take-continue]` contract and the existing social-post interaction
  capture; degrades cleanly (no requirements ⇒ no gate).
- **Cons:** requires a client island that aggregates interaction state across the
  screen's posts (cross-component), and the requirements only make sense on groups
  that actually contain a social post.

### Option C — A dedicated "gate" block

- A separate block type that gates the screen.
- **Pros:** explicit.
- **Cons:** a phantom block with no stimulus content; awkward in the builder; the
  gate is a property *of the screen*, not a step.

## Decision

**We will add screen-level interaction gating as optional config on the
`StudyGroup`** (Option B): `maxTimeSec` (0/absent = no limit) and an ordered
`interactionRequirements` list, each `{ id, type, count, reactionKey? }` where
`type ∈ like | comment | report | share | any | likeOrDislike | reaction`. The
runtime aggregates the live interaction state of every social post on the screen,
renders progress chips, and keeps the screen's Continue disabled until **all**
requirements are met — or until `maxTimeSec` elapses, which auto-advances. The
config surface appears in Configure only when the group contains a social post.
Requirements are **advisory gating only** — they never alter the recorded answer
(interactions are recorded exactly as today, ADR-0085); the gate just governs when
Continue unlocks. Empty list + `maxTimeSec=0` ⇒ no gate (full back-compat).

## Consequences

- **Easier:** researchers can force engagement with a stimulus; the pattern
  generalizes any future "must interact to proceed" need.
- **Harder:** the take screen gains a client aggregator that watches all posts'
  interaction state; the builder must show the control conditionally (group has a
  social post) and translate requirement types into researcher-native labels
  (design-rules vocabulary).
- **Committed to:** requirements live in the snapshot (they travel with a version,
  freeze on preregister, copy on replication — like all block/group config); no
  new table, no migration.
- **Precluded (for now):** per-post requirements within a multi-post screen (whole
  screen only); cross-screen interaction tallies.

## Revisit triggers

- Researchers ask for per-post requirements on a multi-post screen.
- We need requirements on non-social screens (generalize beyond social-post).
- The interaction-capture model changes (e.g. reactions stop riding the
  `ReactionGroup` context), which the aggregator depends on.

## References

- ADR-0028 (question groups = screens), ADR-0085 (social-post design + interaction
  capture), ADR-0040 (`requireFullWatch` continue-gate precedent).
- `server/modules/blocks.ts` (`StudyGroup`, `readGroups`), `studies.setGroups`
  (`server/trpc/routers/studies.ts`), `server/runtime/participant.ts`
  (`resolveVisibleScreens`), `components/feature/take/reaction-toggles.tsx`
  (`ReactionGroup` interaction state), the `[data-take-continue]` contract
  (`force-watch-video.tsx`, `forced-wait-input.tsx`).
- Wireframe: `03_design/wireframes/social-post-group-gating.md`.
