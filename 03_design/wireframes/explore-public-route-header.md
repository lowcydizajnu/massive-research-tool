# Wireframe spec — Explore public-route header

- **Serves user flow:** [Explore — discovery and activation](../../02_product/user-flows/explore-discovery.md) (the anonymous/public variant)
- **IA placement:** [Information architecture](../ia/information-architecture.md) — the marketing-site chrome wrapping the public `/explore` route (no LeftRail).
- **Persona:** [Principal investigator](../../02_product/personas/principal-investigator.md) (evaluating the tool before signing up)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Give an anonymous visitor a trustworthy marketing-site frame around the same Explore content, with one obvious path to sign up.

## Layout

> Layout zones.

A slim top bar above the shared `<ExploreContent />` island (the island itself is specified in [explore-destination](./explore-destination.md)):

- **Left** — wordmark / brand lockup (Plex Serif), links to `/` (marketing home).
- **Centre (desktop only)** — a few quiet nav links (Explore [current], Docs, Pricing-if-exists). Collapses on mobile.
- **Right** — "Log in" (text link) + "Sign up" (primary filled button, vibrant). On mobile these collapse into a single "Sign up" + a menu.
- Below the bar: the identical Explore bands an authed user sees, minus any workspace-scoped affordance.

The bar is sticky; parchment background with a subtle bottom hairline (`border.subtle`).

## Content inventory

> Every piece of content.

- **Wordmark** — static brand asset; links to marketing home.
- **Nav links** — static (Explore current, Docs → `docs.myresearchlab.app`, others as they exist).
- **"Log in"** — links to `/signin`.
- **"Sign up"** — links to `/signup`; when a fork intent is pending (visitor clicked "Use template"), the same destination but the intent is carried so the template is forked post-signup.

## States

> Describe each.

- **Default** — full bar (brand + nav + log in + sign up).
- **Scrolled** — sticky bar with a slightly stronger shadow once content scrolls under it.
- **Mobile** — condensed: brand + "Sign up" + hamburger (nav links inside the menu).
- **Pending fork intent** — no visible change to the header; the intent rides the sign-up link/route, surfaced after auth.
- **Authed visitor hits the public route** — they may still view it, but a subtle "Open in app →" affordance replaces "Sign up" (links to the authed `/explore`). (Optional; default is to leave the public chrome as-is.)

## Interactions

> For each interactive element.

- **Wordmark** — navigates to marketing home `/`.
- **"Sign up"** — `/signup` (carrying any pending fork intent).
- **"Log in"** — `/signin`.
- **Docs link** — opens `docs.myresearchlab.app` (new tab).
- **Hamburger (mobile)** — toggles the nav menu; Esc + outside-click close it; focus trapped while open.

## Edge cases

> Long content, zero/many, slow network, offline, permissions.

- Very narrow viewport → brand may abbreviate to a mark only; "Sign up" always stays visible (it's the conversion path).
- The public route must never render workspace-scoped data or controls (no "active workspace", no LeftRail) — content components receive an `isPublic` flag and hide authed affordances.
- Docs link target may not exist yet (pre-Mintlify) → points at a "coming soon" docs landing rather than a 404.

## Accessibility notes

> Beyond default rules.

- Header is a `<header>` with a `<nav aria-label="Primary">`; the current page link has `aria-current="page"`.
- "Sign up" is a real `<a>` styled as a button; sufficient contrast against parchment (vibrant fill meets AA).
- Mobile menu: button has `aria-expanded`/`aria-controls`; focus moves into the menu on open and returns to the toggle on close; Esc closes.
- Skip-to-content link precedes the header for keyboard users.

## Open questions

> Resolve before high-fi.

- Whether a marketing home (`/`) and Pricing page exist yet, or the wordmark/nav point only at Explore + Docs for now (depends on marketing-site scope, outside this handoff).
