# ADR 0089 — Social platform selection decoupled from theme preset

- **Status:** deprecated
- **Date:** 2026-07-01
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** runtime, design, theming, social-post

## Context

> **Reverted 2026-07-01.** The implementation was removed at the project owner's
> request — only Facebook is finalized, so a multi-platform selector is premature,
> and the "Follow the theme — Facebook" / "Facebook" options were redundant. This
> ADR is kept as a record for when a second platform is actually ready to ship.

Today the social-post *skin* (which platform a post imitates — Facebook, X, …)
and its page chrome (the fake nav) are derived entirely from the **theme preset**
(`effectivePresetKey(theme)`, ADR-0024): a Facebook-skinned post only appears when
the whole study theme is the `facebook` preset. Block overrides
(`getBlockOverride(presetKey, "social-post")`) and the page frame
(`getPageFrame(presetKey)`) both key off that single preset.

The owner wants the two decoupled (2026-07-01): the Social section should have its
own **platform dropdown** — Facebook now, X / TikTok / … as they ship — so a
researcher can pick a Facebook-styled post while the *rest* of the study uses a
neutral, non-platform look (e.g. an "Elegant"/"Academic" theme). The requested
linkage: when the theme **is** a platform (Facebook/X), the Social platform
**pre-fills to match** ("predefined"); when the theme is **not** a platform, the
platform is chosen **independently** in Social. Owner answered the open design
question directly: the pre-fill is **default-but-overridable**, not locked.

This rides `theme.socialPost` (ADR-0085), which already carries the study-level
social design and freezes into the snapshot — so no migration.

## Options considered

### Option A — Keep skin tied to the theme preset (status quo)

- A Facebook post requires theme = Facebook.
- **Pros:** one source of truth; nothing to build.
- **Cons:** can't have a platform-styled post under a neutral theme — the exact
  thing the owner asked for; forces the whole study look to follow the post.

### Option B — Add `theme.socialPost.platform`, resolved with a fallback (chosen)

- New optional `socialPost.platform` (enum of the social platforms). A new
  resolver `effectiveSocialPreset(theme)` returns `socialPost.platform` if set,
  else the theme preset when that preset is itself a platform, else none (plain
  renderer). The social-post override, the page frame, feed-mode detection, and
  the chrome toggle all key off `effectiveSocialPreset` instead of the raw theme
  preset. The editor defaults the dropdown from the theme (pre-fill) but lets the
  researcher change it (overridable).
- **Pros:** delivers the decoupling with one additive, snapshot-carried field (no
  migration); the linkage is just "default the control from the theme"; other
  block types keep using the theme preset (only social-post + its chrome move to
  the social preset).
- **Cons:** two preset concepts now exist (theme preset vs social preset); the
  runtime must consistently use the social one for social-post surfaces.

### Option C — A separate top-level `theme.socialPlatform`

- **Cons:** splits social config across two places (`socialPost` already holds the
  whole social design); more surface to keep in sync; no upside over B.

## Decision

**We will add an optional `theme.socialPost.platform` and resolve the effective
social skin via `effectiveSocialPreset(theme)` = `socialPost.platform` ?? (the
theme preset when it is itself a social platform) ?? none.** The social-post block
override, the page frame, feed-mode un-boxing, and the platform-chrome toggle all
key off `effectiveSocialPreset`; every other block keeps using the theme preset.
The Design → Social platform dropdown **defaults from the theme** when the theme is
a platform and is **always overridable** (owner decision). Unset `platform` + a
non-platform theme = today's behavior (the plain social-post renderer), so existing
studies are unchanged.

## Consequences

- **Easier:** a platform-styled post under any theme (the owner's case); one place
  (Design → Social) to choose the platform; X/TikTok/… slot in by extending one
  enum + the override/frame maps.
- **Harder:** the runtime must use `effectiveSocialPreset` (not the raw theme
  preset) everywhere social-post chrome is decided — a missed call site would show
  the wrong skin.
- **Committed to:** social skin resolution flows through `effectiveSocialPreset`;
  `socialPost.platform` rides the snapshot (no migration; freezes on preregister,
  copies on replication).
- **Precluded (for now):** per-block platform (a study mixing Facebook + X posts
  on one screen) — the platform is study-level; revisit if researchers ask.

## Revisit triggers

- Researchers want different platforms per block within one study.
- The theme preset list and the social platform list diverge enough that deriving
  one from the other stops making sense.
- A platform needs page chrome that isn't expressible via the existing
  `getPageFrame` contract.

## References

- ADR-0024 (per-study theming), ADR-0084 (branding tiers), ADR-0085 (social-post
  design on `theme.socialPost`).
- `lib/themes/themes.ts` (`socialPostSchema`, `effectivePresetKey`,
  `showsPlatformChrome`, `isFeedSkin`, `SOCIAL_PLATFORM_PRESETS`),
  `components/feature/take/block-view.tsx`, `components/feature/take/page-frames.tsx`,
  `app/(take)/take/[studyId]/layout.tsx`,
  `components/feature/design/social-post-appearance-editor.tsx`.
