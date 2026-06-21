# Wireframe spec — Workspace Playground

- **Serves user flow:** [Collect inspiration in the Playground](../../02_product/user-flows/collect-inspiration-in-playground.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — a new top-level **workspace destination** in the left rail, alongside Studies / Library / Frameworks (destination pattern per ADR-0046).
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence.

Give a workspace a shared board to collect, discuss, and triage the raw material for a study-not-yet-built — links, notes/questions, images/files, reference papers (and later to-dos and polls) — and to convert the keepers into a draft study without re-keying (ADR-0059).

> **Researcher-facing vocabulary note.** Per `00_meta/rules/design-rules.md`, user-facing copy avoids developer terms. Call it the **Playground**; cards are "cards"; the conversion CTA reads **"Start a study from this"** (not "convert" or "create draft"). No "fork/merge/snapshot" language appears on this surface. Run the developer-term check before high-fi.

## Layout

> Layout zones.

- **App chrome (unchanged):** the existing left rail with a new **Playground** destination item (icon + label, added to `DESTINATIONS` in `components/chrome/left-rail.tsx`).
- **Board header:** the **Playground** title, a one-line purpose subtitle, and the primary **Add** affordance (a button that fans out to the card types). A subtle member/avatar cluster and a board-level overflow (e.g. "Start a study from selection" when cards are multi-selected) sit on the right.
- **Board body:** a responsive **grid/masonry of cards** (modular floating cards on parchment, matching the `app/page.tsx` reference treatment), drag-to-reorder. Cards size to content; long content truncates with a "more" affordance.
- **Card (the core unit):** a typed card — a small **kind chip** (vibrant chip treatment), the card's primary content (per kind, below), a **comment count + open-thread** affordance, and a row-level overflow (edit / archive / "Start a study from this"). Selection checkbox appears on hover / in multi-select mode.
- **Comment thread:** opening a card's comments uses the **existing comments UI** (ADR-0015) in the standard placement (side panel / inline drawer as used elsewhere) — not a new thread component.

## Content inventory

> Every piece of content.

- **Playground title + subtitle** — static; orients the purpose ("Collect inspiration before you build").
- **Add affordance** — fans out to: **Link · Note/question · Image/file · Reference** (*Phase 2 adds:* **To-do · Poll/vote**). Static control.
- **Card — kind chip** — one of link / note / image / file / reference (/ todo / poll). Computed from `playground_card.kind`.
- **Link card** — `url` + a title (from paste-text in v1; no server unfurl). Shows the domain; click opens in a new tab (with the standard external-link safety treatment).
- **Note / question card** — `body` markdown (freeform thought or open question). Author + timestamp.
- **Image / file card** — a thumbnail/preview from `mediaKey` via `/api/media`; filename for non-image files. Source: the existing media uploader (`UploadButton`).
- **Reference card** — resolved title / authors / year from Crossref (`refDoi`), with the DOI shown; an "unresolved — retry" state when lookup failed.
- **To-do card (Phase 2)** — checklist label, an **assignee** avatar (`assigneeUserId`), a **done** checkbox (`done`).
- **Poll / vote card (Phase 2)** — a question + options; per-member **vote** controls and a running tally.
- **Comment count + thread** — per card; reuses the existing comments system (`comment` table, `targetType:"playground_card"`).
- **Card overflow** — Edit · Archive · **Start a study from this**. Computed by permission.
- **Selection + "Start a study from selection"** — multi-select to convert several cards into one draft.
- **Author + timestamp** — per card; from `createdByUserId` / `createdAt`.

## States

> Each state.

- **Default** — the board renders the workspace's cards in `position` order; Add is available to write-role members.
- **Loading** — skeleton cards in the grid while the board query resolves; chrome/header render immediately.
- **Empty** — no cards yet. Copy: "Nothing here yet. Drop in a link, a question, an image, or a paper — then turn the keepers into a study." CTA: the **Add** fan-out, prominent. (This is the most-seen first-run state; make it inviting, not barren.)
- **Partial** — board loaded but a single card is still resolving (e.g. a reference mid-DOI-lookup, or an image mid-upload): that card shows an inline spinner/placeholder while the rest are interactive.
- **Error (board)** — board query failed → a board-level error with a Retry; chrome stays usable.
- **Error (per card)** — DOI didn't resolve → reference card shows "Couldn't resolve this DOI — Retry / Edit"; upload failed → no card is committed and the uploader's error surfaces. Per-card errors never blank the board.
- **Permissions — read-only (viewer)** — board + cards + comment threads are visible; **Add / edit / reorder / archive / Start-a-study** affordances are hidden (not just disabled). Commenting follows the existing comment permission.
- **Success / optimistic** — adding or reordering a card updates the board optimistically; a failed write rolls back with a toast.

## Interactions

> For each interactive element.

- **Add → \{type\}** — opens the matching quick-add: Link = paste-URL field; Note = markdown textarea; Image/file = the existing `UploadButton` (presign + PUT, returns `/api/media` URL); Reference = paste-DOI field that calls `studyRecord.lookupCitation`. System: creates a `playground_card` of that `kind` at the top of the board. Error path per "Error (per card)".
- **Drag to reorder** — persists `position`; board re-renders. Keyboard-accessible reorder (see a11y).
- **Open comments** — opens the existing comment thread for that card (`targetType:"playground_card"`); posting fires activity/notifications (ADR-0015).
- **Edit card** — inline edit of the card's text fields; autosaves.
- **Archive card** — removes from the active board (non-destructive; recoverable per the project's archive convention). Distinct from convert.
- **Start a study from this / from selection** — calls `studies.create`, carries the card(s)' `url`/`body`/title into the new draft's initial notes/links, then offers **Open in Builder**. The source card is **linked, not deleted**. Partial-carry failure surfaces honestly ("study created, but couldn't carry everything — retry copy") rather than silently dropping material.
- **(Phase 2) Vote** — toggles the member's vote on a poll card; tally updates optimistically.
- **(Phase 2) Toggle to-do done / set assignee** — updates `done` / `assigneeUserId`.

## Edge cases

> - **Very long content** — long titles/notes/URLs truncate with "more"; the card grows to a sensible max then scrolls internally; reference titles wrap to ~2 lines.
- **Zero / one / many cards** — 0 → empty state; 1 → single card, no awkward grid gaps; many (100s) → board stays responsive; revisit virtualization per ADR-0059's revisit trigger.
- **Slow network** — optimistic add/reorder with rollback; per-card spinners for DOI/upload; never block the board.
- **Offline** — writes queue or fail with a clear toast; reads show last-loaded board (standard app behavior, not special-cased here).
- **Permissions denied mid-action** — a write after a role downgrade is rejected by the same write-gate used elsewhere; board falls back to read-only with an explanatory toast.
- **Duplicate link / DOI** — allowed (teams legitimately re-surface things); no hard dedupe in v1, optionally a soft "already on the board" hint. @open-question.

## Accessibility notes

> Beyond the defaults.

- **Cards are a list, not just a visual grid** — expose as a labeled list/grid with each card a list item; the kind chip's meaning is conveyed by text, not color alone (color-blind-safe; the chip has a label).
- **Drag-reorder has a keyboard path** — cards are focusable and reorderable via keyboard (e.g. grab/move/drop with arrow keys) with ARIA position/`aria-grabbed` semantics; reorder is never mouse-only.
- **Add fan-out** is a proper menu (roving focus, Esc to close, focus returns to the Add button).
- **Comment thread** inherits the existing comments component's a11y (ADR-0015); ensure opening a thread moves focus into it and Esc returns focus to the card.
- **Status announcements** — "card added", "study created from this card", and per-card error/resolve states announced politely (`aria-live="polite"`) without spamming.
- **External links** carry the standard new-tab + safety affordance; the link's accessible name includes its destination domain.
- **Reduced motion** — no card-fly animations on add/reorder when reduced-motion is set; swap in place.
- **Tokens** — all color/spacing/type via named design-system tokens (`03_design/design-system/tokens.md` / `05_app/styles/tokens.css`); no raw hex. Headlines use the Plex Serif treatment per the design language. If a needed token is missing, add it to both token sources (Light + Dark) before high-fi.

## Open questions

> To resolve before high-fi.

- **Link card titles** — paste-text only in v1, or a deferred server-side unfurl behind the vendor seam? (ADR-0059 defaults to paste-text.)
- **Grid vs. masonry vs. column-lanes** for the board — pick one in the design-system pass; lanes might pre-figure Phase-2 triage columns.
- **Convert granularity copy** — single card vs. selection: confirm the CTA wording and whether selection-convert ever offers one-draft-per-card.
- **Phase-2 poll/vote affordance** — inline tally vs. expand-on-click; settle with the vote storage decision in ADR-0059.
