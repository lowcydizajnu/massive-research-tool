# Feature spec — Signup and onboard

- **Status:** building
- **Owner:** Paweł (project owner)
- **Target release:** V1 MVP — ADR-0011 step 2
- **User flow:** [Signup and onboard](../user-flows/signup-and-onboard.md)
- **Wireframe(s):** [Signup onboarding](../../03_design/wireframes/signup-onboarding.md)
- **Design handoff:** {none yet — implemented directly from wireframe + tokens per CLAUDE.md "implement design from the spec"}
- **ADR(s):** [ADR-0007 — Path A + adapter discipline](../../04_architecture/adrs/0007-path-a-vs-b.md), [ADR-0011 — scaffold strategy](../../04_architecture/adrs/0011-scaffold-strategy.md)
- **Data model entries:** [Auth + tenancy entities](../../04_architecture/data-model/01-auth-tenancy-entities.md)
- **API contract(s):** {none — onboarding finalize is a server action, not a public contract; tRPC arrives with the Studies destination}

## Problem

A new researcher arriving at Massive Research Tool has no identity, no theme preference, and no workspace. Until those three exist they cannot do any real work, and the first impression sets the credibility bar (a recurring theme across all four personas). The feature must establish identity, theme, and workspace with minimum friction and then get out of the way — landing the user ready to act, not on yet another setup screen.

## Goals

1. A new user completes signup → has a `user` row, a `workspace` row, and an owner `member` row, is signed in, and `hasCompletedOnboarding` is true — observable in the DB and Clerk metadata.
2. The user's theme choice (Light / Dark / System) is captured during onboarding and persists across sessions (stored in Clerk `publicMetadata`, read by `ThemeProvider`).
3. The user lands authenticated with zero further blocking setup steps (Studies destination once it exists; the `/` placeholder until then).

## Non-goals

- ORCID OAuth (V1.5 — Clerk default providers only; Google + email magic-link for V1).
- Multi-user workspace invitations and the Team destination (the `invited` Member status exists in the schema, but the invite-sending UX is deferred).
- OSF / provider connections (deferred to account settings + first recruitment).
- The Studies destination and the rest of Hanna's build loop (separate ADR-0011 moves).
- Role management UI (the `member_role` enum exists; the admin surface is deferred).

## Users and use cases

- **Primary user:** [Hanna Kowalczyk — postdoc operator](../personas/postdoc-operator.md).
- **Primary use case:** [Signup and onboard](../user-flows/signup-and-onboard.md) — standalone signup (Path B), creates a new workspace.
- **Secondary use cases:** invite-link join (Path A — flips a pending `invited` member to active, skips the workspace step); [Get set up](../jobs-to-be-done/get-set-up.md) JTBD.

## Functional requirements

1. The system shall offer two identity methods on the first step: email magic-link and "Continue with Google" OAuth.
2. The system shall, for the email path, send a magic link and auto-advance the originating tab when the link is opened in another tab (Clerk `waitForEmailLinkVerification`).
3. The system shall, for the OAuth path, complete the redirect on a callback route and route users still missing a display name into the profile step.
4. The system shall collect a display name (prefilled from the OAuth profile where available) and a theme choice (Light / Dark / System) on the profile step.
5. The system shall apply the chosen theme to the onboarding surface immediately on selection, before the user continues.
6. The system shall, for standalone signup, collect a workspace name and create the workspace + owner membership; for an invite link, it shall skip this step and attach the user to the inviting workspace.
7. The system shall, on completion, create/upsert the `user` row and (for standalone) `workspace` + owner `member` rows in a single transaction, then persist `themeChoice`, `lastWorkspaceId`, and `hasCompletedOnboarding=true` to Clerk metadata via the `AuthAdapter`.
8. The system shall handle and display: magic-link expired (resend), OAuth denied (retry), and invite revoked (offer new-workspace path).
9. The system shall land the completed user on an authenticated surface.

## Non-functional requirements

- **Adapter discipline (ADR-0007):** no `@clerk/nextjs/server` import outside `05_app/server/adapters/`; the unavoidable client/framework primitives (`<ClerkProvider>`, `clerkMiddleware`, the `(auth)` page client hooks) are recorded as deliberate exceptions in `04_architecture/lock-in-inventory.md`.
- **Accessibility:** theme picker is a `role="radiogroup"` with arrow-key navigation; step transitions and the "check email" state announce via `aria-live`/`role="status"`; visible focus ring on every control (`focus.ring` token); honors `prefers-reduced-motion`.
- **Design fidelity:** centered ~480px column on `surface.page` parchment, white `surface.canvas` card (`radius.lg` + `shadow.md`), Plex Serif brand mark + headline — token names only, no raw hex (per tokens.md contract).
- **Determinism (testability):** the e2e uses Clerk testing tokens / `+clerk_test` addresses — no real email, network, time, or RNG dependence.
- **Atomicity:** the user+workspace+member write is one interactive transaction (drives the `postgres-js` driver choice; HTTP driver can't do interactive transactions).

## Dependencies

- **Clerk** (identity) via the `AuthAdapter` implementation `auth.clerk.ts`.
- **Drizzle + Postgres** (`user`, `workspace`, `member` tables) — the first migration.
- **Existing components reused:** `components/theme-toggle.tsx` (the Light/Dark/System radio-card picker), `components/theme-provider.tsx` (extended to hydrate from Clerk metadata), `lib/utils.ts` (`cn`).
- **Data created:** `user`, `workspace`, `member` rows; Clerk `publicMetadata` (`themeChoice`, `lastWorkspaceId`, `hasCompletedOnboarding`).

## Open questions

- ORCID as an OAuth provider — researcher-coded but needs custom Clerk integration. Deferred to V1.5. (Paweł)
- Final marketing headline — "Build studies. Document everything." is placeholder pending a ux-copy pass. (Paweł)
- Whether instant optimistic theme switching needs an `unsafeMetadata` mirror to avoid the server round-trip — current decision: no; localStorage + `data-theme` give the instant switch, server persist is async. (revisit if perceptible lag appears)

## Telemetry

Deferred for V1 MVP — no analytics wired on admin surfaces yet (per the ADR-0012 candidate note, third-party analytics are a participant-runtime concern, never the dashboard). When analytics land, the events to capture here are: `signup_started` (method), `signup_verified`, `onboarding_completed` (theme choice, invite vs standalone). Recorded here so it isn't forgotten.

## QA plan

Verified by a signup-slice Playwright e2e (`05_app/e2e/signup-slice.spec.ts`): `/signup` → enter a Clerk test email → complete verification in test mode → fill display name + pick a theme → name the workspace → assert the user lands authenticated and `[data-theme]` reflects the chosen theme (and survives reload). Unit tests cover the onboarding finalize transaction (happy + auth-fail) and the `AuthAdapter` mapping. The full QA pass (accessibility scan, manual exploratory notes, sign-off) is recorded in `06_qa/audit-logs/` when the slice is considered shipped.
