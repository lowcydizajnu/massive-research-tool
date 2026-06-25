# Wireframe spec — Preview mode toggle

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Studies › study › Preview](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let whoever opens a preview switch between the real paginated participant flow (default) and a stacked all-screens overview — so "preview" honestly matches what a participant sees, while still allowing a quick full skim.

## Layout

A small segmented control at the top of the preview surface (under the preview ribbon, beside the title): **Participant flow · All screens**. Applies to both the shared `/preview/[studyId]` page and the in-app Preview stage.

- **Participant flow (default):** one screen at a time — the group or lone block for the current screen — with **Back / Continue** navigation, exactly like the take runtime but recording nothing.
- **All screens:** the current stacked list of every block (today's behaviour), for a fast skim.

## Content inventory

- **Preview ribbon** — "Preview — no responses are recorded." (existing).
- **Mode toggle** — segmented: Participant flow (default) / All screens. URL-driven (`?mode=flow|stacked`); `flow` is the default when absent.
- **Flow mode:** the active screen rendered via the participant screen model (`resolveVisibleScreens`), a screen counter ("Screen 2 of 5"), Back (disabled on first) + Continue (→ "Finish" copy on the last), and a note when a screen has answer-based branching that preview can't reveal.
- **Stacked mode:** the `<ol>` of all blocks (current render).
- **Title + caption** — caption reflects the mode ("Participant flow — paginated, nothing recorded" vs "All screens, stacked for review").

## States

- **Default (flow, screen 0)** — first screen + Continue.
- **Mid-flow** — Back + Continue, counter.
- **Last screen** — Continue becomes "Finish" → a "That's the end of the preview" panel + "Start over".
- **Stacked** — all blocks.
- **Empty study** — "This study has no blocks yet." (both modes).
- **Branching note** — if a later screen is gated on an answer, show "Some screens only appear based on answers — not shown in preview." (preview has no recorded answers).

## Interactions

- **Toggle** — switches mode; updates `?mode=`; flow resets to screen 0.
- **Continue / Back** — advance/retreat `?screen=N` (or client state); recompute the visible screen via `resolveVisibleScreens` with empty answers.
- **Finish → Start over** — back to screen 0.
- Nothing is ever recorded (no `responseId`); interactive blocks render but don't persist (the AI block shows its preview placeholder per ADR-0061 fix).

## Edge cases

- Conditional screens — without answers, only always-visible screens show; the branching note explains it.
- A single screen — no Back/Continue chrome needed; Finish panel still offered.
- Deep links — `?mode=stacked` opens stacked directly; `?mode=flow&screen=3` opens mid-flow (clamped to range).
- The AI block in flow mode — renders the preview placeholder (disabled composer), since preview has no session/model.

## Accessibility notes

- The toggle is a labeled radiogroup; mode + screen changes announce via `aria-live` ("Screen 2 of 5").
- Back/Continue are real buttons with disabled states; focus moves to the new screen heading on navigation.

## Open questions

- Should flow mode let you type sample answers to walk branches? (Deferred — "fill with sample data" is a future preview mode.)
- In-app Preview stage vs shared link — same component, same toggle; confirm no chrome differences beyond the ribbon.
