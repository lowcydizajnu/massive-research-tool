# Wireframe spec — Public researcher profile page

- **Serves user flow:** [Public researcher profile — enable and view](../../02_product/user-flows/public-researcher-profile.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — a public route `/u/<handle>` (no auth, marketing/minimal chrome).
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Show a researcher's public identity and the work they've chosen to make public, so peers can recognise, cite, and follow them.

## Layout

> Layout zones.

Single centred column (~720px) on `surface.page` parchment, no app chrome (public). Top to bottom:

1. **Identity header** — avatar (public avatar, else Clerk avatar), display name (Plex Serif), affiliation, ORCID + website + scholar links (icons), research-area chips, bio paragraph. A **+Follow / Following** control (authed non-self) or **Edit profile** (self) or a **Sign up to follow** CTA (anonymous) sits top-right. Follower / following counts under the name.
2. **Public studies** — a list/grid of this researcher's `share_scope='public'` studies (title, tags, replication count) → each links to the public study Details (`/browse/[id]`).
3. **Templates** — public templates this researcher authored (name, use-count) → template detail.

## Content inventory

> Every piece of content.

- **Avatar** — `public_avatar_r2_key` (public R2) → falls back to Clerk `avatarUrl`.
- **Display name** — `display_name`.
- **Affiliation / ORCID / website / scholar / research areas** — existing V1.12 profile fields, shown when present.
- **Bio** — `public_bio` (≤ 1000 chars), plain text.
- **Follow control** — V1.7 follow infra; state depends on viewer.
- **Follower/following counts** — V1.7.
- **Public studies** — server: this researcher's public studies with a frozen version (same rule as Explore/Browse).
- **Templates** — server: their public templates.

## States

> Describe each.

- **Default** — identity + at least one of studies/templates.
- **Loading** — SSR; minimal skeleton if any band hydrates.
- **Empty (no public work)** — identity renders; studies/templates sections show a quiet "No public studies yet." (the profile still exists once enabled).
- **Self-view** — Follow replaced by "Edit profile" → Settings.
- **Anonymous** — Follow replaced by "Sign up to follow".
- **Not found / disabled** — the route 404s (no "this profile is private" message — don't leak existence).

## Interactions

> For each interactive element.

- **+Follow / Following** — toggle via V1.7 follows (authed, not self).
- **Edit profile** (self) — link to Settings · Public profile.
- **Sign up to follow** (anon) — `/signup`.
- **Study / template cards** — navigate to `/browse/[id]` / template detail.
- **ORCID / website / scholar** — external links (new tab, `rel="noopener"`).

## Edge cases

> Long content, zero/many, slow network, offline, permissions.

- Long bio → rendered in full (capped at 1000 chars at write time); long name → wraps.
- Many studies → cap with a "see more on Browse" affordance (filtered to author) rather than unbounded.
- Avatar missing → Clerk fallback → initials monogram if neither.
- Disabled-after-the-fact → 404 even if the URL was shared earlier.
- Handle case/spacing → route matches the normalized lowercase handle only.

## Accessibility notes

> Beyond default rules.

- `<main>` with an h1 = the researcher's name; sections have `aria-labelledby` headings.
- Avatar `alt` = "" (decorative; name is adjacent) — or the name if it's the only identity cue.
- Follow control is a real `<button>` with `aria-pressed` for Following state.
- External links carry a visible/SR cue that they open a new tab.

## Open questions

> Resolve before high-fi.

- Whether to show metrics (total replications across their studies) as a headline stat — defer; counts per study suffice for V1.
