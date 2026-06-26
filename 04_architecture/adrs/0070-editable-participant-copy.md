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

## Amendment 1 (2026-06-26) — Slice 2: block-internal social-post copy

The first revisit trigger fired: researchers need to translate/reword strings rendered *inside* a block — specifically the social-post **Like / Share / Comment** labels and the **comment-box placeholder**. We added these as block-internal keys (`postLike`, `postShare`, `postComment`, `postCommentPlaceholder`) alongside the chrome keys, with a deliberately different default rule:

- **Chrome keys** have a real default; blank override ⇒ that default.
- **Block-internal keys** have NO universal default — each mimicking preset (Facebook, X, Reddit, …) has its own native label (Repost, Forward, ▲, ♥). So **blank ⇒ the skin's native text**; a set value applies everywhere. `readBlockCopy()` returns only the SET keys (no defaults), and the take runtime threads them to the renderers as `RuntimeScreenView.blockCopy`.

Trade-off (recorded so we don't relitigate): we apply an overridden Like/Share/Comment **word** only where a skin already renders a word; icon-only reaction glyphs (♥, ▲, 🔁, ❤️) keep their glyph to preserve the locked platform mimicry (design language v0.6). The comment placeholder is editable on every skin. This honors "make block strings editable" without eroding the platform-fidelity that the social-post presets exist for. Extending to other blocks = add a key + thread it (same as chrome). We chose prop-threading (`blockCopy` down through `BlockView`) over a client `UiCopyProvider` context because the social-post renderers are server components and compose the label strings inline — no client context needed.

The **Builder live-preview pane** does not yet reflect block-internal overrides (it loads via a separate preview-token payload); the participant take is the source of truth. Surfacing overrides in the preview payload is a follow-up.

## Revisit triggers

- We need true multi-language studies (participant picks/assigned a language) → extend `uiCopy` to per-language sets (a `uiCopyByLang` map) rather than a flat map.
- The editable-string set grows large enough that hand-threading is unwieldy → consider a render-time key→element registry.
- Block-internal strings (e.g. the audio "play once" notice) need editing → add a take-side `UiCopyProvider` context so client block components can resolve keys too.

## References

- `lib/take/ui-copy.ts` (chrome + block keys, defaults, `resolveUiCopy`/`readBlockCopy`, `WORDING_GROUPS`, `formatProgress`, `sanitizeUiCopy`); `server/trpc/routers/studies.ts` (`setUiCopy`, `StudyDetail.uiCopy`); `server/runtime/participant.ts` (`getRuntimeScreen` attaches `uiCopy` + `blockCopy`); take pages + `components/feature/take/parts.tsx`; `components/feature/take/block-view.tsx` + `block-overrides.tsx` (social-post skins consume `blockCopy`); `components/feature/builder/wording-section.tsx` (grouped, columned, real-text, collapsible editor).
- ADR-0024 (per-study theme on snapshot), ADR-0058 (variant bindings on snapshot), ADR-0028 (screens/runtime).
