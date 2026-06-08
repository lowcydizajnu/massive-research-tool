# ADR 0028 — Question groups and per-screen runtime

- **Status:** accepted
- **Date:** 2026-06-08
- **Deciders:** project owner, Claude (agent)
- **Tags:** blocks, runtime, grouping, ADR-0012-amendment, ADR-0013-amendment

## Context

Today blocks are a flat list and the participant runtime shows **one block per screen**. The owner wants **question groups**: several blocks shown **together on one screen** (a stimulus + its measures), with the participant moving between screens via **Next / Back**. The owner's framing (2026-06-08): *"a group IS one screen."* Groups can be **conditioned** (the whole screen shown/skipped via the V1.10 AND/OR engine), and standalone **transition / instruction screens** sit between groups and experimental parts. This also subsumes the C2-Group-5 "Multi-Question Page" idea and is the foundation the **custom composite modules** build on (a saved custom block = a named, reusable group).

This changes the runtime's unit of navigation from *block* to *screen*, which touches ADR-0013 (per-question SSR) and the answer/visibility model.

## Decision

**A group is an ordering construct over the existing flat `definition_snapshot.blocks[]`, not a nested tree.** Each block gains an optional `groupId?: string` (and groups carry their own metadata in a sibling `definition_snapshot.groups[]: {id, title?, showIf?, kind: "group"|"transition"}`). This keeps ADR-0012's "opaque owned JSON, no migration" intact — `groupId`/`groups` are new keys in the snapshot, read by `readBlocks`/a new `readGroups`, written by the existing block mutations.

**The runtime walks *screens*, not blocks.** A new pure `lib/whiteboard/screens.ts` derives the screen list from `(blocks, groups)`:
- consecutive blocks sharing a `groupId` collapse into one **group screen** (rendered together, in order);
- an ungrouped block is its own **single screen** (today's behaviour — fully backward compatible when no groups exist);
- a `transition` group is a **standalone screen** (copy only, no response).
Screen-level `showIf` is evaluated with the same `conditionWithSources`/`evaluateCondition` engine (ADR-0021), against answers from **earlier screens**; a hidden screen is skipped entirely.

**Per-screen routing (ADR-0013 amendment).** The runtime advances by screen index; a screen submit records answers for *all* its member blocks at once (the `answerAction` already writes per-block `response_item` rows — it now loops the screen's blocks). **Back** becomes a first-class control (re-renders the previous screen with its prior answers). Distinct screen URLs are preserved (`…/q/<screenIndex>`), so per-screen analytics/heatmaps still work — at the screen grain rather than per-question. Results/exports are unchanged (still per-block `response_item`).

**Conditioning + ordering invariants** (ADR-0021) carry over: a clause is valid only if its source block is on an **earlier screen**; reorder/remove prune forward refs; the group is the conditioning unit when blocks are grouped.

## Options considered

- **groupId on the flat array (chosen)** — minimal model change, no migration, backward-compatible (no groups = today's runtime), groups are pure derivation. Custom composite modules become "saved groups" naturally.
- **Nested block tree in the snapshot** — rejected: a structural migration of the blocks JSON, rewrites every consumer (Builder, whiteboard, diff, runtime), and multi-parent conditioning reads worse as a tree (ADR-0021 already chose flat + tags).
- **A new `screen` block kind wrapping children** — rejected: same nesting cost; conflates layout with the block list.

## Consequences

- **Easier:** stimulus+measures on one screen; transition screens; the runtime degrades to one-block-per-screen with zero groups (safe rollout); custom modules reuse the group machinery.
- **Harder:** the runtime's navigation + `answerAction` move from block to screen (the load-bearing change); Back must restore prior answers; the Builder needs a grouping affordance + a screen-preview. Phased: (L1) model + screen-derivation + runtime per-screen nav + Back; (L2) Builder grouping UI + transition blocks; (L3) custom composite modules as saved groups.
- **Committed to:** groups as flat-array derivation; screen = navigation unit; no blocks-JSON migration.

## Revisit triggers

- A group needs to span non-contiguous blocks, or nest groups in groups → revisit the contiguous-`groupId` rule.
- Per-question (not per-screen) analytics becomes a hard requirement again.

## References

- `lib/whiteboard/screens.ts` (derivation) + `server/runtime/participant.ts` (per-screen walk) + `app/(take)/take/.../actions.ts` (screen submit + Back); `lib/whiteboard/conditions.ts` (ADR-0021 engine, reused at screen level). Amends ADR-0012 (snapshot keys), ADR-0013 (per-screen routing), ADR-0021 (conditioning unit). Wireframes: `builder-question-groups.md` (L2).
