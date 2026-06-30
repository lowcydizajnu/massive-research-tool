# Wireframe spec — Design — Social post appearance

- **Serves user flow:** [build-social-post-stimuli](../../02_product/user-flows/build-social-post-stimuli.md)
- **IA placement:** [Studies › study › Design](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher choose the branding tier and tailor a Facebook post's layout, reactions, comments, composer, and custom slots — with a live participant-accurate preview — without leaving the Design stage.

## Layout

The Design stage sub-nav gains a third tab: **Theme · Chat · Social**. The Social tab is the same two-column shape as Chat: a **controls column** (left, grouped accordions) + a **live Facebook-post preview** (right) that re-renders on every change. Edits autosave via `studies.setSocialPostDesign` (appearance lives under `theme.socialPost`; ADR-0024 snapshot pattern). The branding-tier picker + IRB gate are detailed in [branding-tier-irb-gate](./branding-tier-irb-gate.md); the post anatomy in [social-post-builder-facebook](./social-post-builder-facebook.md).

## Content inventory

- **Sub-nav** — Theme / Chat / Social. Source: static; Social active here.
- **Platform** — fixed to **Facebook** in v1 (label + "X and TikTok coming soon" muted note). → future `theme.socialPost.platform`.
- **Branding tier** — segmented control: `Block design` / `Layout (inspired)` / `Fully branded`. Inline helper text per tier; selecting `Fully branded` reveals logo upload + the IRB gate. Study default; per-block override noted. → `theme.socialPost.brandingTierDefault`.
- **Reactions** — multi-toggle over the seven (Like/Love/Care/Haha/Wow/Sad/Angry) + a **Live/measured vs Display-only** switch + a **reaction-summary** toggle. → `theme.socialPost.reactionsEnabled` / `reactionsLive` / `showReactionSummary`.
- **Action bar** — three toggles: React / Comment / Share. → `theme.socialPost.actionBar`.
- **Comments** — enable thread; manage **seeded comments** (add/edit/reorder/remove; top-fan, verified, avatar, body, time, reaction count, one level of replies); "View more" + "N of M" labels. → `theme.socialPost.comments`.
- **Composer** — enable; placeholder text; which icons (emoji/photo/GIF/sticker). → `theme.socialPost.composer`.
- **Custom slots** — add/edit/remove researcher-defined elements (region · kind · content). → `theme.socialPost.slots`.
- **Wording** — link/jump to the existing Wording editor (Like/Share/Comment labels) — not duplicated here.
- **Live preview** — a faithful, mostly non-interactive FB post reflecting every setting; the reaction picker is interactive in preview to demo the hover-reveal.
- **"No social-post block yet" hint** — muted note if the study has no `social-post` block ("Add a Social post block in Build to use this."). Settings still save.
- **Per-block override hint** — note that a block can override the tier/slots in its Configure panel; this tab sets the study default.

## States

- **Default** — controls from `theme.socialPost` (or defaults); preview rendered at the effective tier.
- **Saving** — shared autosave indicator (Theme/Chat tabs).
- **Tier = Fully branded, no logo** — logo slot shows "Logo required"; preview shows a placeholder mark; a banner notes publishing is blocked until a logo + IRB attestation exist.
- **Tier = Fully branded, no attestation** — an "IRB attestation required to publish" banner with a "Review & attest" button (opens the gate modal).
- **Logo uploading** — spinner in the logo slot; preview updates on success.
- **Empty (no social-post block)** — the hint above; editor still usable.
- **Error** — upload failure inline; `setSocialPostDesign` failure → shared autosave-error treatment.

## Interactions

- Any control change → optimistic preview update → debounced `studies.setSocialPostDesign({ studyId, socialPost })`.
- Tier → `Layout`/`Fully branded` surfaces the ADR-0024 mimic-acknowledgment checkbox (reused); unacknowledged save is rejected server-side.
- Tier → `Fully branded` reveals logo Upload (presign → R2) / Pick from Materials / Remove, and the IRB gate entry point.
- Seeded comments: add/edit in a small inline editor; drag to reorder; nested reply add (one level).
- Custom slots: "Add slot" → choose region + kind → content field (text / media-pick / icon-pick).
- Reaction "Live/measured" off → preview shows reactions as static; a note explains nothing is collected.

## Edge cases

- Many seeded comments — the controls list scrolls; the preview shows the thread with "View more comments".
- Long author/comment text — wrap in preview; truncate where FB truncates.
- Block override differs from study default — preview here shows the **study default**; a note links to the block's Configure for its override.
- Deleted logo/avatar/image-slot asset — orphan-safe fallback (no-logo layout); preflight flags it.
- Switching tier down from `Fully branded` keeps the uploaded logo (unused) so toggling back is lossless.

## Accessibility notes

- All toggles/segments are labeled; the segmented tier control is a `radiogroup` with arrow-key nav (reuse the existing pattern).
- The preview is `aria-hidden` (decorative mirror) **except** the reaction picker demo, which mirrors the real take widget's a11y (focusable, labeled reactions).
- Reaction/emoji never convey state by color alone (icon + label).
- Contrast of any custom-slot text against its region must pass AA — reuse the Theme tab's contrast check.

## Open questions

- Should seeded-comment management live here or in the block's Configure panel? (Assumed: study-level defaults here; per-block content in Configure — confirm.)
- Reorder UX for slots/comments — drag vs up/down buttons (assumed drag with keyboard-accessible fallback).
- Do we preview at the participant theme tokens or the researcher chrome? (Assumed: participant tokens, like the take page.)
