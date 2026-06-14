# QA audit — 2026-06-14 — V1.39.0 Spatial follow-ups (per-respondent export link, hot-spot region editor, image saturation)

## Overview

- **Auditor:** Claude (agent).
- **Scope:** three owner follow-ups after the V1.38.0 explore release. Designed + adversarially reviewed via the `spatial-followups-design` workflow (3 parallel design agents → one verification pass against the real code); built per the corrected, gated build order.
- **Verdict:** ✅ cleared for the owner's live review. **No DB migration.** One load-bearing blocker the review caught (deep-link could open the wrong respondent) was fixed at two layers before shipping.

## What shipped

1. **Export viz link → per-respondent deep-link column** (reverses V1.38.0's trailing section). Owner: "the heatmap link in Excel should be per respondent in a dedicated column, not a collective section below." Now one `ExportColumn` per spatial block (`viz:<instanceId>`, type `meta`, toggleable/reorderable like any column), per-row cell = `…/results/explore/<instanceId>?r=<responseId>` — a deep link opening *that respondent* in per-respondent view. The Explore page + island gained a `?r` param. `spatialLinks()` + the appended section were removed. `dataset.ts` stays pure — origin is threaded as `ctx {studyId, origin}` from the client `ExportBuilder` (no `window` in the pure layer).
2. **Hot-spot visual region editor** (`RegionsEditor`, dispatched from `configure-form.tsx` for `hot-spot.regions`): draw rectangles on the stimulus, rename/nudge/resize/delete, full keyboard parity, frozen region keys. Pure geometry in `lib/take/image-coords.ts`. Also a **bug fix**: region objects previously fell through the generic `string[]` editor and rendered as `[object Object]`, corrupting the config on edit.
3. **Image-saturation slider** on the Explore stimulus (`filter: saturate(N%)`, default 100%, display-only) — applied to the `<img>` only, never the overlay markers (saturating the `--color-primary` dots would distort the viz). Available for all spatial kinds.

## The blocker we fixed (deep-link correctness)

The adversarial pass found `rows[]` (all completed respondents) is a **superset** of `spatial.responses[]` (only respondents with a `response_item` for that block). Naively, a `?r=` link for a non-participant would have opened respondent #1 (`Math.max(0, findIndex(-1)) = 0`). Fixed at **two** layers:

- **Export:** the column emits a link **only** for rows present in that block's `spatial.responses[]` (a `spatialMembers` set) — others get an empty cell.
- **Explorer:** if `?r` resolves to `findIndex === -1`, a `role=status` notice shows and the view falls back to aggregate (never a wrong respondent). The `[cond]` reset effect is `didMount`-guarded so the seeded deep-link index isn't clobbered on mount.

Both are exercised by tests (`buildMatrix` emits `?r=r1` for the participant, `""` for the non-participant).

## Verification

- **Unit/integration:** **373 vitest green (44 files, +10)**. New `lib/take/__tests__/image-coords.test.ts` (rectFromCorners both drag directions; clampRegion; nudge/resize edge clamps; nextRegionKey gap-fill/no-reuse; regionAtPoint topmost-wins + null-outside; a regression guard that a drawn region commits as an object, so the `[object Object]` bug can't recur). Rewrote the `dataset.test.ts` spatial block: viz column appended after questions with a researcher-native label; `buildMatrix` with ctx → per-respondent deep link, empty for non-participants; without ctx → blank; `toDelimited` emits the URL inline (no trailing section), unquoted + injection-safe.
- **Static:** `tsc --noEmit` clean, `next lint` clean, `next build` clean (`/studies/[id]/results/explore/[instanceId]` rebuilt at 4.06 kB). Verify chain run **exit-code-gated** (`vitest && tsc && lint && build`), per the `gate-deploys-on-exit-codes` rule.
- **Manifest:** `validate.py` clean (127 instances; `hot-spot-region-editor` wireframe registered).
- **Not click-tested by the agent:** the Builder region editor (drag/keyboard) and the Explore saturation slider + deep-link landing are auth- and data-gated interactive surfaces; verified via typecheck/build + the pure geometry/dataset tests and shipped for the owner's live click-through (the established pattern for interactive surfaces).

## Gates (phase order respected)

- **Architecture:** ADR-0041 **amendment (2026-06-14b)** — authoring-side region capture, the export deep-link reversal + `viz:` scheme + ctx-threading + membership guard, and the display-only image-tone filter. All extend ADR-0041 (amendments, not new ADRs). The stale `spatialLinks` code ref in amendment-a was corrected.
- **Design:** new wireframe `03_design/wireframes/hot-spot-region-editor.md`; `spatial-explore.md` amended (saturation control + per-respondent `?r` column + deep-link landing); IA Configure-row note; design-system unchanged (composes existing v0.6 primitives).

## Lock-in / safety review

- No new vendors, no new mutations (the region editor rides the existing `updateBlockConfig`; export is client-side). No DB migration — regions live in `definition_snapshot.blocks[].config` JSON (ADR-0012); per-respondent rows derive from existing answers.
- Tokens-only styling throughout (region boxes reuse the participant hot-spot treatment; saturation/opacity are native ranges). CSV-injection safety preserved (raw https URL, `escapeDelimited`, no `HYPERLINK()`).
- Privacy unchanged from V1.38.0: per-respondent points/values/PIDs are already in the CSV `rows` at the same auth surface; the deep link carries only a `responseId` (already the `response_id` export column). Signature gallery remains deferred (separate `/api/media` `resp/` authorization decision).

## Carry-forwards / deferred (owner-facing)

- **Pointer drag-to-move / corner-resize** of an existing region — deferred (arrow-key move/resize is the complete, a11y-required path); geometry helpers already support it for a later wiring-only change.
- **Per-region distinct colors** in the editor — uniform `--color-primary` first (matches the participant view).
- **Signature gallery** + `/api/media` `resp/` auth — still deferred (ADR-0041 amendment-a).
