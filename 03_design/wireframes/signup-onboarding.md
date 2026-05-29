# Wireframe spec — Signup onboarding

- **Serves user flow:** [Signup and onboard](../../02_product/user-flows/signup-and-onboard.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

First contact with the product. Establish identity, theme preference, and workspace context with minimum friction.

## Layout

**Not the canonical three-zone surface.** Onboarding lives on a centered narrow column (~480px wide) on `color.surface.page` parchment. No left rail, no right context panel, no top bar chrome — just the brand mark top-left, the column content, and a footer with privacy / terms links.

This is the only surface in the product where the canonical layout doesn't apply. Justified because: the user has no workspace yet, so workspace-global chrome would be empty; and the brand-coded centered-column pattern is a SaaS convention researchers recognize.

## Content inventory

- **Brand mark** — top-left, Plex Serif name + tiny dot icon, `color.ink.deep`.
- **Centered column card** — `surface.canvas` white background, `radius.lg`, no border, `shadow.md` for a slight lift off the parchment.
- **Headline (Plex Serif display 32-40px)** — "Build studies. Document everything." (or workspace-specific variant on an invite link).
- **Step 1 — Identify** — email input + magic-link button OR `Continue with Google` OAuth button. "Already have an account? Sign in" link.
- **Step 2 — Profile + theme** — display name input (prefilled from OAuth where possible). Theme picker — three radio cards horizontal with mini-mockup swatches.
- **Step 3 — Workspace** — If from invite link, skip. Else: workspace name input + brief explanation "A workspace is where studies live. You can be in multiple."
- **Footer** — small Plex Sans `text.muted` row: Privacy · Terms · Help · (theme indicator).

## States

- Default — step 1 visible; steps 2 and 3 hidden until predecessors complete.
- Magic link sent — replace input with "Check your email" + resend link.
- OAuth in progress — spinner with "Connecting to Google…".
- Invite link path — workspace step skipped; copy adapts to "You've been invited to join {workspace}".
- Magic link expired — error state; "Send a new link" CTA.
- OAuth denied — return to step 1 with error explanation.

## Interactions

- Magic link button — sends email; transitions to "check email" state; auto-detects when user clicks link in another tab via polling or websocket.
- OAuth button — opens OAuth in same tab; returns to step 2 on success.
- Theme picker — selecting one fires immediate theme swap on the surface itself so user sees the choice before continuing.
- Step transition — animated slide; reduced-motion users get instant.

## Edge cases

- User already exists at that email — redirect to sign in.
- Workspace name already taken (global) — only relevant if we ever expose workspace URLs by name; defer.
- ORCID OAuth requested but not available — fallback to Google + email magic link.

## Accessibility notes

- Centered column has `role="main"` since this isn't the canonical layout.
- Step transitions announce to screen readers via `aria-live="polite"` regions.
- Brand mark is a link to landing page with `aria-label="Massive Research Tool home"`.
- Theme picker radio cards are a `role="radiogroup"` with arrow-key navigation; selecting a theme immediately previews the change in the surface to make the effect tactile.
- Magic-link "check email" state announces via `role="status"` so screen reader users get the feedback.

## Open questions

- "Continue with Google" vs "Sign in with ORCID" — researcher-coded but ORCID requires custom Clerk integration. V1 ships Google only; ORCID V1.5.
- Marketing copy "Build studies. Document everything." — placeholder; final headline needs ux-copy pass.
