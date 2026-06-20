# Wireframe spec — Builder live preview

- **Serves user flow:** [Build a study as a flow](../../02_product/user-flows/build-study-as-a-flow.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — Build stage, alongside the block editor
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence.

Let the researcher edit a study and see the participant experience update live beside the editor — no leave-look-return loop (ADR-0057).

## Layout

> Layout zones.

- **Split Build stage:** **left** = the existing block list/editor; **right** = a **live preview pane**. A draggable **divider** between them; the split ratio is remembered (same mechanism as the right-panel side preference, M4).
- **Preview pane header:** device switcher **Desktop ▏Tablet ▏Mobile** (existing widths 960 / 768 / 390), a **Restart** control, a subtle **status** chip ("Live" / "Updating…"), an **Open full preview** link (the existing full-screen modal), and a **collapse** chevron to reclaim width.
- **Preview pane body:** the **real runtime** in `mode:"preview"` (ephemeral response, not counted), device-framed — the same engine as the modal, embedded inline.

## Content inventory

> Every piece of content.

- **Preview surface** — the running participant experience (real runtime, preview mode). Source: `studies.startPreview` → `/take/...` runtime.
- **Device switcher** — Desktop / Tablet / Mobile. Static control; changes frame width.
- **Status chip** — "Live" (idle) / "Updating…" (debounced refresh in flight). Computed.
- **Restart** — starts a fresh preview response from screen 0.
- **Open full preview** — opens the full-screen modal (unchanged).
- **Collapse / expand** — hide/show the preview to give the editor full width.
- **Divider handle** — resizes the split; remembers the ratio.

## States

> Each state.

- **Default (Live)** — preview shows the current screen of the draft; editor on the left.
- **Loading** — starting the preview response (spinner in the pane).
- **Updating** — after an edit, the runtime re-runs on a debounce and **re-seeks to the held screen index**; status chip reads "Updating…"; the editor stays fully usable meanwhile.
- **Empty study** — preview shows the runtime's own "nothing to show yet" / first-step prompt.
- **Held-screen-removed** — if an edit deletes the screen being previewed, clamp to the nearest valid screen (don't jump to 0).
- **Error** — the draft can't run (misconfigured block) → pane shows the error + **Restart**; editor unaffected.
- **Collapsed** — preview hidden; a slim "Show preview" affordance remains.

## Interactions

> For each interactive element.

- **Edit a block (left)** — debounced auto-refresh of the preview, **preserving the current screen index**. (No manual "refresh" needed; that's the whole point.)
- **Device switch** — re-frames the preview width; keeps the held screen.
- **Restart** — fresh preview response from the top.
- **Open full preview** — full-screen modal for an undistracted run.
- **Collapse / expand**, **resize divider** — layout only; ratio persisted.

## Edge cases

> - **Rapid typing** — debounce so the runtime isn't restarted on every keystroke; coalesce to the latest draft; never block typing.
- **Long study** — on refresh, the runtime seeks to the held index rather than replaying screens visibly.
- **Branch/arm-dependent screens** — preview runs one concrete arm + answer path; a note clarifies "previewing arm X" with a way to restart into another arm.
- **Narrow viewport** — below a threshold the split stacks or the preview auto-collapses (editor takes priority).
- **Slow refresh** — show "Updating…"; keep the prior frame until the new one is ready (no flicker to blank).
- **Permissions (viewer)** — preview is read-only anyway; no editor, so this pane can still render for a read-only viewer.

## Accessibility notes

> Beyond the defaults.

- The preview is a **labeled, supplementary region** ("Live participant preview") — not a focus trap; keyboard focus stays in the editor unless the user tabs into the preview.
- **Divider** is keyboard-resizable (arrow keys) with an ARIA value.
- **Status** changes announced politely (`aria-live="polite"` on "Updating…/Live") without spamming.
- **Reduced motion** — no transition animation on refresh; swap frames directly.

## Open questions

> To resolve before high-fi.

- Refresh trigger granularity: debounced-on-change (preferred) vs on autosave-commit — pick one and state it in handoff.
- Whether to persist the held screen across a hard reload of the Builder, or always restart from 0 on full page load.
- Arm/path selection affordance for preview (restart-into-arm vs a small picker) — minimal for v1.
