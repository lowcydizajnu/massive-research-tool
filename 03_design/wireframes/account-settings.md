# Wireframe spec — Account settings

- **Serves user flow:** [Manage account settings](../../02_product/user-flows/manage-account-settings.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

> **v0.7 amendment (2026-06-18, IA v0.7):** Account settings now renders in **personal-mode chrome** (slim personal top bar, **no workspace left rail**), reached from the UserMenu → *Account settings*. Its scope is strictly per-user: Profile · Connections (per-user OSF) · Appearance (theme + right-panel side). The two workspace-admin toggles that used to sit under Appearance — **Show demo content** and the **workspace Activity-feed filter** — moved to the new **Workspace settings** page (`/settings/workspace`, workspace chrome, reached from the rail's *Settings*). Sub-nav references to a Settings left rail below are superseded by this entry.

## Purpose

User-level identity + visual preference + connected-services management. Separate from workspace-level settings.

## Layout

Standard three-zone modular surface per brief v0.6 — slim top bar (no Save — autosave throughout), left rail (Settings active — workspace-level sub-nav swapped for account-level), center column with sub-nav pill (Profile · Appearance · Connections · Notifications) + content card below, right context panel hidden by default.

## Content inventory

- **Top bar** — workspace chip + breadcrumb (`Misinformation Lab · Settings · Account`); ⌘K + user avatar.
- **Left rail** — Settings active. Sub-rail shows Account (active) + Workspace (separate route).
- **Sub-nav pill** — Profile · Appearance (default landing) · Connections · Notifications.
- **Profile tab** — Display name (inline editable), avatar (Clerk-managed upload), email (read-only), ORCID (read-only if linked via OAuth).
- **Appearance tab** — Theme picker: three radio cards labelled "Light" / "Dark" / "System" each showing a mini-mockup swatch of the surface in that mode.
- **Connections tab** — OSF row (Connected as X / Not connected with `+ Connect` button). Future: Prolific, CloudResearch.
- **Notifications tab** — Default cadence (radio: Immediate / Daily / Weekly / Off) + per-target overrides table (Tag / Author / Framework / Study / Saved search × cadence).

## States

- Default landing — Appearance tab.
- Saving — inline spinner on the changed field; no full-screen state.
- OSF connection failed — row shows red badge `Last sync failed` + retry button.
- Theme persist failed (Clerk down) — banner top of work surface "Saving to localStorage only".
- Onboarding hint (new user, never visited) — `color.accent.subtle` callout: "Pick a theme that works for late-night sessions" with Light / Dark mini swatches inline.

## Interactions

- Theme radio click — immediate theme swap; writes to Clerk user metadata + localStorage.
- Display name edit — autosave on blur.
- `+ Connect OSF` — opens OAuth in new window; on return, row updates.
- Cadence radio — autosave.
- Per-target override row — combobox to pick target + cadence dropdown.

## Edge cases

- User changes theme mid-onboarding before signup completes — preference persists via localStorage; written to Clerk on first authenticated request.
- ORCID already linked at another email — error explains; offer disconnect.
- Workspace has billing-tied features — banner about workspace settings (cross-link).

## Accessibility notes

- Sub-nav pill = `role="tablist"`.
- Theme radio cards = `role="radiogroup"` with arrow-key navigation; each card has `aria-label` describing the theme.
- Mini-mockup swatches inside the radio cards are `aria-hidden="true"` (decorative).
- Connection failure badge has `role="alert"` so screen readers announce the failure.
- Per-target cadence table uses semantic `<table>` markup with `<caption>`.

## Open questions

- Privacy / data export — link to legal page from Profile? Yes, footer row.
- Sign out — already in user dropdown; surface here as well? Defer.

---

## Profile tab (V1.12 A2)

The **Profile** tab (now the default; `?tab=profile`) holds researcher identity reused by OSF preregistration metadata, the public author byline, and V1.13 Participants. Tabs: **Profile · Connections** active; Appearance / Notifications stay "coming soon".

Fields (all optional except display name; stored additively-nullable on `user`, migration `0006`):

- **Display name** (editable) · **Email** (read-only)
- **Full name** — OSF authors + byline
- **ORCID iD** — validated `XXXX-XXXX-XXXX-XXXX` (checksum `X` allowed)
- **Affiliation** — institution + department
- **Research areas** — chip input (reuses the V1.7 tag shape; Enter / comma to add, ✕ to remove; max 20)
- **Bio** — short markdown textarea (public author page)
- **Website** + **Google Scholar** — http(s) URLs, validated

`Save profile` (PendingButton) → `profile.update` (zod-validated; empty strings normalize to null). `profile.get` seeds the form. ORCID + URL errors surface inline. No participant-facing surface.
