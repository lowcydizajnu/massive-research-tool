# Wireframe spec — Settings · Public profile

- **Serves user flow:** [Public researcher profile — enable and view](../../02_product/user-flows/public-researcher-profile.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — a section within Settings · Account (personal/account settings, not workspace).
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher opt in to a public profile, choose a handle, and control the public-facing bio/avatar — with a clear preview of what others will see.

## Layout

> Layout zones.

A card section under Settings · Account:

1. **Master toggle** — "Make my profile public" (`public_profile_enabled`). Default OFF. Helper text: "Off by default. Your workspace activity is never public — only the studies and templates you've already shared publicly."
2. **Revealed when on** — handle picker (with live availability check + the resulting `/u/<handle>` preview URL), bio textarea (≤1000 chars, counter), avatar upload (separate from Clerk avatar; shows current).
3. **Footer** — "View your public profile ↗" (opens `/u/<handle>` in a new tab) + Save.

## Content inventory

> Every piece of content.

- **Toggle** — `public_profile_enabled`.
- **Handle field** — text; normalized lowercase + hyphens; prefilled from the email local part on first enable; live `checkHandleAvailable`.
- **Handle preview** — `myresearchlab.app/u/<handle>`.
- **Bio textarea** — `public_bio`, ≤1000 chars + remaining counter.
- **Avatar upload** — `public_avatar_r2_key` (public R2 namespace), with current/preview + fallback note.
- **Save** — persists via `users.updatePublicProfile`.

## States

> Describe each.

- **Off (default)** — only the toggle + helper text; handle/bio/avatar hidden.
- **On, first time** — fields revealed, handle prefilled, unsaved.
- **Checking handle** — inline spinner; Save disabled while pending/invalid.
- **Handle taken / invalid** — inline error + suggestion; Save blocked.
- **Saving / saved** — PendingButton; success confirmation; "View your public profile" enabled.
- **Avatar uploading / failed** — progress; non-blocking error, keep prior avatar.

## Interactions

> For each interactive element.

- **Toggle on/off** — reveals/hides fields; turning OFF after enabled warns that `/u/<handle>` will stop resolving (handle stays reserved).
- **Handle input** — debounced availability check; normalizes on blur.
- **Avatar upload** — presigned PUT to the public R2 namespace (reuses the existing upload path).
- **Save** — `updatePublicProfile`; validates handle uniqueness server-side.
- **View public profile ↗** — opens `/u/<handle>`.

## Edge cases

> Long content, zero/many, slow network, offline, permissions.

- Reserved/blocked handles (`admin`, `settings`, `u`, `signup`, …) → rejected with a clear reason (denylist in ADR-0077).
- Turning off then on → same handle retained (reserved to the user).
- Bio at the 1000-char cap → hard stop + counter; no silent truncation.
- Slow availability check → Save stays disabled until it resolves.

## Accessibility notes

> Beyond default rules.

- Toggle is a labelled switch (`role="switch"` / `aria-checked`); revealing fields moves focus to the handle input.
- Availability status is announced via `aria-live="polite"` ("handle available" / "taken").
- The handle preview URL is associated with the input via `aria-describedby`.
- Save's disabled reason (pending/invalid) is conveyed, not just visual.

## Open questions

> Resolve before high-fi.

- Per-field visibility toggles vs one master opt-in — V1 uses a single master toggle (per the flow's open question); revisit if researchers ask to hide specific fields.
