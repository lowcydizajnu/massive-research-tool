# Wireframe spec — Social-post group — interaction requirements

- **Serves user flow:** [Hanna builds a study](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Build stage](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Let a researcher require participants to *engage* with a social-post screen —
N likes / comments / reports / shares / any-interaction / like-or-dislike /
specific reaction — before Continue unlocks, with an optional per-screen time
limit that auto-advances. Implements ADR-0087.

## Layout

Two surfaces:

**A. Builder — Configure panel (left/right sidebar), group screen with a social post.**
A section **"Interaction requirements"** appears below the group's existing
controls, ONLY when the selected group contains ≥1 social-post block:
- **Max time for this screen** — a number input (seconds; 0 = no limit) + helper:
  "After the time elapses the participant auto-advances, regardless of
  requirements."
- **Requirements list** — one row each: `[type dropdown] × [count number] "post"`
  with a delete (trash) button. `+ Add requirement` appends a row.
- Helper when empty: "No requirements — the participant can continue freely."

**B. Participant runtime — the group screen.**
A sticky **progress-chips bar** at the top of the screen: one chip per
requirement, `«label» n/N`, unmet = neutral outline, met = filled/checked. Below
it the social post(s) render as today. The screen's **Continue/Finish is disabled**
until every chip is met; if a time limit is set, a subtle countdown shows and, on
expiry, Continue enables + the screen auto-advances.

## Content inventory

- **Section heading "Interaction requirements"** — static; only when group has a social post.
- **Max-time input** — number (0–3600s), from `group.maxTimeSec`.
- **Requirement row** — per `group.interactionRequirements[i]`: type (select of
  Like / Comment / Report / Share / Any interaction / Like-or-Dislike / a specific
  reaction), count (int ≥1), delete. Researcher-native labels (design-rules
  vocabulary), never dev keys.
- **Progress chip (runtime)** — computed: requirement label + `current/target`.
- **Countdown (runtime)** — computed from `maxTimeSec`, shown only when > 0.
- **Continue/Finish button** — the existing `[data-take-continue]`, disabled state driven by the aggregator.

## States

- **Default (builder):** the section shows for social-post groups; hidden otherwise.
- **Empty:** no requirements + maxTime 0 → no runtime chips, no gate.
- **Partial (runtime):** some chips met, some not → Continue disabled.
- **All met (runtime):** chips all filled → Continue enabled.
- **Timed-out (runtime):** countdown hits 0 → Continue enabled + auto-advance.
- **Loading / Error:** inherits the Builder Configure + take-screen patterns (no bespoke states).

## Interactions

- **+ Add requirement** — appends a default row (Any interaction × 1); autosaves via `setGroups`.
- **Type dropdown / count** — edits the row; autosaves.
- **Delete row** — removes it; autosaves.
- **Max-time input** — edits `maxTimeSec`; autosaves.
- **Participant like/comment/report/share/react** — increments the matching chip
  live; when all targets are hit, Continue enables.
- **Time expiry** — enables Continue and advances automatically.

## Edge cases

- Group loses its social post (blocks removed) → the section hides; stored
  requirements stay in the snapshot but are inert (no social post to satisfy them).
- Many requirements → chips wrap; the bar scrolls horizontally on mobile.
- `maxTimeSec` very small → still enforce; never below 0.
- A requirement type that can't be produced by the post's enabled controls (e.g.
  requires Share but Share is disabled) → surface a Builder warning (a chip that
  can never be met would trap the participant); the time limit is the safety valve.
- Preview mode → gate behaves as in a real run (so the researcher can test), but nothing is recorded.

## Accessibility notes

- Chips are a `role="list"`; each chip announces `«label», n of N` and its met
  state (not colour-only — include a ✓ glyph when met).
- The disabled Continue has an `aria-describedby` pointing at the chips bar so a
  screen reader explains *why* it's disabled.
- Countdown uses `aria-live="polite"` sparingly (announce at coarse intervals, not every second).
- Requirement rows: labelled selects/inputs; the trash button has an aria-label.

## Amendment (2026-07-03) — participant summary polish (ADR-0087 am.)

- **Builder:** a "Show these requirements to participants" checkbox in the group's
  Interaction-requirements editor (default on). Off = the chip bar is hidden but
  Continue is still gated.
- **Participant chip bar:** one tight row — emoji-led chips (`👍 Like 1/1`, subtle
  fill; emerald + ✓ when met) with a compact `⏱ mm:ss` countdown on the right —
  instead of the old stacked `○ Label n/N` list.
- **Wording:** the chip labels (Like / Comment / Report / Share / Any interaction /
  Like-or-Dislike / React) are editable in Design → Wording under "Interaction
  requirements", so they translate (e.g. → Polub / Skomentuj). Blank = the default.

## Open questions

- Should a "specific reaction" requirement auto-imply that reaction is enabled on
  the post? (Builder warning for now; hard-couple later if it confuses.)
- Do we ever want OR across requirements? (v1 is AND-only per ADR-0087.)
