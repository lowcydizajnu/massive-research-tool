# ADR 0085 — Social-post design builder (Facebook v1)

- **Status:** proposed
- **Date:** 2026-06-30
- **Deciders:** project owner, Claude (agent)
- **Tags:** participant-runtime, design-tab, theming, ADR-0024-related, ADR-0013-exception

## Context

We have a `social-post` block (v2) and ADR-0024's renderer override for facebook/x. What we lack is a **builder surface** — like the existing Design → Chat tab — where a researcher recreates and customizes a post's full anatomy: the seven Facebook reactions, the reaction summary/counts, the action bar, a comment thread (top-fan, seeded comments, nested replies, per-comment reactions, "View more comments", "N of M"), the composer affordances, and **researcher-defined custom slots**. The owner's reference screenshot shows the breadth ("especially all emotions"). v1 scope is **Facebook only**; X and TikTok follow on the same substrate.

Constraints: ADR-0013 (participant runtime is server-rendered MPA; client JS only via scoped exceptions — `reaction-time`, `reaction-toggles`). The full Facebook reaction picker (hover/long-press to reveal seven reactions, live +1) is not expressible in pure HTML, so it needs a **scoped client component** — a deliberate, contained ADR-0013 exception, consistent with `reaction-toggles.tsx`. Appearance must ride the snapshot (ADR-0024) so it freezes, forks, and diffs.

## Options considered

### Option A — Design → Social tab + post-anatomy config on the snapshot, FB renderer + scoped reaction client (chosen)

- Mirror Design → Chat: a new `social` sub-tab with controls + live preview; appearance/layout/slots stored under `theme.socialPost` (study default) and per-block content in the block config. Extend the existing `facebook` `getBlockOverride` renderer to read the anatomy. Reaction picker = one scoped client component.
- **Pros:** reuses the proven chat-builder pattern, the snapshot/freeze/fork/diff substrate, and the renderer-override contract; one well-contained JS exception; clean path to X/TikTok (same tab, more presets).
- **Cons:** the anatomy schema is sizable; the reaction client is the second bespoke take interaction to maintain.

### Option B — Put everything in the block Configure panel (no Design tab)

- All anatomy lives per-block in Build → Configure.
- **Pros:** no new Design tab.
- **Cons:** breaks the established Configure(content) vs Design(appearance) split (chat precedent); appearance wouldn't be reusable as a study default; worse preview ergonomics.

### Option C — Full WYSIWYG canvas editor

- Free-form drag/drop of every element.
- **Pros:** maximum flexibility.
- **Cons:** huge surface; conflicts with "presets are vetted code"; unbounded validation/a11y/legal risk. Rejected for v1.

## Decision

**We will add a Design → Social tab (mirroring Design → Chat) that edits a snapshot-stored Facebook post anatomy — reactions, counts, action bar, comment thread, composer, and custom slots — rendered by the existing `facebook` block override, with the reaction picker implemented as one scoped client component (ADR-0013 exception).**

Appearance + interaction config + custom slots live under `theme.socialPost` (study-level defaults) and may be overridden per block; post *content* stays in the `social-post` block config. The seven reactions, comment thread, and slots are validated by zod allowlists (no arbitrary HTML/CSS), consistent with ADR-0024. "Live/measured vs display-only" is a per-block toggle: when live, chosen-reaction/like/share/comment extend the existing response schema; when display-only they render but collect nothing. Custom slots are typed `{ id, region, kind: text|image|icon, content }` placed into named regions (`header-badge`, `sponsored-label`, `below-body`, `pinned-comment`, `action-bar`) and rendered by the override.

## Consequences

- **Easier:** high-fidelity, fully customizable FB stimuli; a reusable study default; a clear template for X/TikTok; everything frozen/forked/diffed for free.
- **Harder:** a larger theme schema and a second scoped take-interaction component; export must learn the chosen-reaction column.
- **Committed to:** Configure(content)/Design(appearance) split; reactions/thread/slots as vetted, schema-validated config (not user code); FB-first, extensible-by-preset.
- **Precluded from:** free-form WYSIWYG and user-authored renderers in v1.

## Revisit triggers

- X / TikTok builders begin → add presets + renderers on this substrate (no schema rework expected).
- Researchers need video/carousel content types beyond v1's text/image/link-card → extend content-type union.
- The scoped reaction client grows beyond a contained widget → reconsider the ADR-0013 exception boundary.

## References

- ADR-0024 (theming substrate, renderer overrides, page frames), ADR-0013 (participant runtime + client-JS exceptions), ADR-0012 (snapshot), ADR-0070 (editable participant copy / wording).
- Companion ADR-0084 (branding tiers + IRB gate).
- User flow: `02_product/user-flows/build-social-post-stimuli.md`.
- Wireframes: `03_design/wireframes/design-social-post-appearance.md`, `03_design/wireframes/social-post-builder-facebook.md`.
- Data model: `04_architecture/data-model/07-social-post-design.md`.
- Code touchpoints: `05_app/components/feature/design/design-workspace.tsx` (tab), `05_app/components/feature/take/block-overrides.tsx` (renderer), `05_app/lib/themes/themes.ts` (schema), `05_app/components/feature/take/reaction-toggles.tsx` (scoped-client precedent).
