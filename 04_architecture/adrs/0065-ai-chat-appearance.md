# ADR 0065 — AI chat appearance + preview modes

- **Status:** accepted
- **Date:** 2026-06-22
- **Deciders:** Project owner, Claude
- **Tags:** ai, design, theming, take-runtime, preview

## Context

> What is forcing this decision?

Two owner requests off the AI conversation block (ADR-0061):

1. **A chat-window design editor.** Today the participant chat renders with a
   fixed look (a generic "Assistant" header, default bubbles). The owner wants to
   control its appearance — assistant name, avatar/icon (uploadable), bubble
   colours, bubble shape, font — and asked for it **under the Design tab, as a
   secondary "Chat" sub-tab.** This is researcher-controlled participant styling,
   exactly the concern the Design stage already owns (per-study theming, ADR-0024;
   the theme even has chat-style presets — whatsapp/discord/imessage). So chat
   appearance belongs **in the theme**, not as block plumbing.

2. **A preview-mode toggle.** The shared preview (`/preview/[studyId]`) renders
   *all blocks stacked on one page* while its caption claims "exactly what a
   participant sees." A real participant sees **one screen per group/lone block**
   (`deriveScreens`/`resolveVisibleScreens`, ADR-0028). The owner wants a toggle
   to switch the preview between the **real participant flow (paginated) — the new
   default** and the stacked all-screens view.

Constraints: ADR-0024 (theme lives in `experiment_version.theme`, resolved SSR to
CSS-variable overrides, freezes with the version + copies on replicate), the
design language locked at v0.6 (researchers customise *within tokens*, we don't
introduce new app visual decisions), ADR-0061 (AI non-determinism + the ethics of
participant-facing generation), and ADR-0028 (the screen model).

## Options considered

> ### Option A — Chat appearance in the study theme (`theme.chat`), edited under Design → Chat; preview gains a paginated mode (chosen)

- Extend `studyThemeSchema` with a `chat` object (assistant name, avatar R2 key,
  participant label, bubble colours from the theme palette, bubble radius,
  density, font from the theme fonts, AI-disclosure toggle, composer placeholder,
  typing-indicator toggle). The **Design → Chat** sub-tab edits it via the existing
  `studies.setTheme` (allowlist-validated), with a live chat-window preview.
  `ai-chat-input` reads the appearance, threaded from `snapshot.theme.chat` at
  each render site (take page, shared preview, Builder live-preview). The shared
  preview + in-app Preview gain a **mode toggle**: paginated participant flow
  (default, via `resolveVisibleScreens`) or stacked all-screens.
- **Pros.** Reuses the theme's freeze/replicate/SSR machinery (no migration — it
  rides the snapshot jsonb like the rest of the theme); lands exactly where the
  owner asked (Design tab); applies consistently to every AI block in the study;
  avatar upload reuses the L3 Materials/Pick-from-Materials + presign we just
  built. Colours stay token-based → on-brand, design-language-safe.
- **Cons.** Per-study (one chat look per study), not per-block — a study with two
  differently-styled AI personas would need a per-block override (deferred).
  Requires threading `theme.chat` to the few places that render the chat.

> ### Option B — Chat appearance in the `ai-chat` block config (per-block)

- Store it in each block's config (like `maxTurns`).
- **Pros.** Per-block flexibility; the renderer already receives block config.
- **Cons.** It's a *visual* concern that the owner wants in **Design**, not the
  block's Configure panel; editing block config from the Design tab is awkward;
  duplicated styling across blocks; doesn't ride the theme's freeze/replicate
  story. Rejected for v1 (kept as the future per-block-override mechanism).

> ### Option C — Leave preview stacked; just fix the caption

- Reword "exactly what a participant sees."
- **Pros.** Trivial.
- **Cons.** Doesn't give the owner the real-flow preview they asked for. Rejected
  (we do the toggle; the caption is fixed as part of it).

## Decision

> A single, declarative sentence.

**We will add chat-window appearance to the study theme (`theme.chat`), edited in
a new Design → Chat sub-tab with a live preview and rendered by `ai-chat-input`
from the version snapshot; and we will give the preview a mode toggle that
defaults to the real paginated participant flow (`resolveVisibleScreens`) with a
stacked all-screens option — both migration-free (theme rides the snapshot).**

Reasoning: chat appearance is participant styling, and the Design stage already
owns that with a frozen-with-the-version, copied-on-replicate theme — so the new
controls slot into the same place, same persistence, same lifecycle, with zero
schema migration. The preview toggle just renders the existing screen model the
participant already gets, instead of a stacked approximation.

### Decisions locked

- **Per-study** chat appearance in `theme.chat` (applies to all AI blocks);
  per-block override is a deferred follow-up (Option B mechanism).
- **AI-disclosure element defaults ON** (ethics, ADR-0061) — researchers can
  word it but it's on by default; a "you're talking to an AI" line.
- **Colours/fonts are token-constrained** (theme palette + theme fonts), not
  arbitrary hex — stays on-brand, honours the v0.6 lock + the ADR-0024 precedent.
- **Avatar** reuses L3: upload via `uploads.presign` → `ws/` R2, or Pick-from-
  Materials; stored as an R2 key (orphan-safe), served via `/api/media`.
- **Preview default = participant flow** (paginated); mode is URL-driven
  (`?mode=flow|stacked`). With no recorded answers, screen conditions evaluate
  against empty answers (forward-branching screens may not reveal — noted in the
  preview copy). Nothing is recorded in either mode.

## Consequences

> - **What becomes easier.** Researchers brand the chat to fit their study; the
>   preview honestly shows the participant experience; future per-block overrides
>   or new chat controls extend one schema.
> - **What becomes harder.** `theme.chat` must thread to every chat render site;
>   the preview now has two code paths (paginated + stacked); more theme surface
>   to keep token-safe.
> - **What we are now committed to.** Chat appearance is theme data (frozen with
>   the version, copied on replicate); it is token-constrained; AI disclosure is
>   on by default; the preview can render the real screen model.
> - **What we are now precluded from (for now).** Per-block chat styling (one look
>   per study); arbitrary non-token colours/fonts; recording anything in preview.

## Revisit triggers

> Conditions under which we reopen this.

- A study genuinely needs two differently-styled AI personas → ship the per-block
  override (Option B) layered over the study default.
- Researchers want richer chat layouts (full-screen chat, side avatars, rich
  media bubbles) beyond the token set → a dedicated chat-layout decision.
- Preview needs to simulate branching with sample answers → a "fill with sample
  data" preview mode.

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0061 AI conversation block](0061-ai-conversation-block.md) (the block +
  non-determinism/ethics), [0024 per-study theming](0024-per-study-theming.md)
  (theme model, SSR CSS vars, freeze/replicate — chat appearance extends it),
  [0028 question groups & screens](0028-question-groups-and-screens.md) (`resolveVisibleScreens`
  for paginated preview), [0064 workspace materials](0064-workspace-materials.md)
  (avatar via Pick-from-Materials / presign).
- Wireframes: `03_design/wireframes/design-chat-appearance.md`,
  `03_design/wireframes/preview-mode-toggle.md`.
- Code touchpoints: `lib/themes/themes.ts` (`studyThemeSchema.chat` + the
  `setTheme` allowlist); `components/feature/design/design-workspace.tsx` (Theme |
  Chat sub-tabs); `components/feature/take/ai-chat-input.tsx` + `block-view.tsx`
  (read appearance); `app/(take)/take/[studyId]/…` + `app/preview/[studyId]/page.tsx`
  (thread `theme.chat`, preview mode toggle); `server/runtime/participant.ts`
  (`resolveVisibleScreens` reused for paginated preview).
