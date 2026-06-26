# ADR 0070 — Editable participant-facing copy (uiCopy override layer)

- **Status:** accepted
- **Date:** 2026-06-26
- **Deciders:** project owner, Claude
- **Tags:** runtime, builder, i18n

## Context

Researchers want to translate or reword everything a participant sees — to run a study in another language, or to match their own phrasing. Block *content* is already editable (prompts, options, consent text), but the **fixed chrome** around it was hardcoded: the Continue/Finish/Back buttons, the "please answer" error, the progress label, and the thank-you screen. There was no way to change those.

This is the first slice of "make all participant-facing text editable." The full goal is broad (every string; eventually per-language variants), so we want a foundation that scales but ships value now. Prior decisions in play: ADR-0024 (per-study theme stored on the version snapshot), ADR-0058 (variant bindings on the snapshot) — both established "study-level participant config lives on `definitionSnapshot`."

## Options considered

### Option A — Per-study `uiCopy` override map on the version snapshot (chosen)

- A small set of well-known string keys (`continueButton`, `requiredError`, `progressLabel`, …) with code defaults; a study stores only the keys it overrides, on `definitionSnapshot.uiCopy`. A pure resolver merges overrides over defaults; the take runtime + a Builder "Wording" editor both use it.
- **Pros:** Mirrors theme/variants (same storage + freeze + replication for free). Tiny surface. Blank = default, so partial translation works. Extends to more keys (and later per-language sets) without a migration.
- **Cons:** Each newly-editable string must be added to the key registry + threaded once.

### Option B — Full i18n framework (message catalogs + locale files)

- Adopt an i18n library, externalize every string into catalogs, add locale negotiation.
- **Pros:** Industry-standard; scales to many languages.
- **Cons:** Heavy for a per-study override need; participant copy is study-authored data, not app chrome — it belongs in the study, not in app locale files. Over-engineered for the current ask.

## Decision

We will use a per-study **`uiCopy` override map** on the version snapshot, resolved over code defaults by a pure helper (`lib/take/ui-copy.ts`). Slice 1 covers the fixed chrome (buttons, required-answer error, progress, thank-you). It's the smallest thing that lets a researcher translate/reword what blocks don't cover, and it reuses the snapshot-config pattern we already trust for theme and variants — so freezing a version, replicating a study, and the Builder/runtime split all work without new infrastructure.

## Consequences

- **What becomes easier.** Translating/rewording the chrome; adding more editable strings later (append a key + thread it once); per-language variants become "multiple uiCopy sets" on top of this.
- **What becomes harder.** Nothing structural; each new editable string is a small, explicit addition (intentional — keeps the key set curated + documented).
- **What we are now committed to.** Participant copy lives in the study (`definitionSnapshot.uiCopy`), not in app locale files; the resolver is the single source for defaults; blank override ⇒ default.
- **What we are now precluded from.** Treating these strings as app-level i18n; silently changing a default (it would shift every study that didn't override it — change deliberately).

## Revisit triggers

- We need true multi-language studies (participant picks/assigned a language) → extend `uiCopy` to per-language sets (a `uiCopyByLang` map) rather than a flat map.
- The editable-string set grows large enough that hand-threading is unwieldy → consider a render-time key→element registry.
- Block-internal strings (e.g. the audio "play once" notice) need editing → add a take-side `UiCopyProvider` context so client block components can resolve keys too.

## References

- `lib/take/ui-copy.ts` (keys, defaults, resolver, `formatProgress`, `sanitizeUiCopy`); `server/trpc/routers/studies.ts` (`setUiCopy`, `StudyDetail.uiCopy`); `server/runtime/participant.ts` (`getRuntimeScreen`/`getCompletionInfo` attach resolved copy); take pages + `components/feature/take/parts.tsx`; `components/feature/builder/wording-section.tsx`.
- ADR-0024 (per-study theme on snapshot), ADR-0058 (variant bindings on snapshot), ADR-0028 (screens/runtime).
