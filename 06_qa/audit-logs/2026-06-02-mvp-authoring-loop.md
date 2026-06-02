# QA audit — 2026-06-02 — MVP authoring loop

## Overview

- **Date:** 2026-06-02
- **Scope:** the ADR-0011 MVP authoring loop, code-complete — auth → Studies → New study (Blank / from Framework) → Builder (block add/remove/configure + validation + autosave) → Save as named version.
- **Feature spec:** [signup-and-onboard](../../02_product/feature-specs/signup-and-onboard.md) (covers the auth leg; the build leg is specified by the wireframes + ADR-0011/0012 — a dedicated feature spec for build-a-study is a follow-up).
- **User flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **Status of this audit:** ⚠️ **NOT a clean ship pass.** Records the QA state at code-complete and the gaps that must close before V1-MVP ships.

## Test results

- **Unit + integration (Vitest): 50 green.** Migration (forward + constraint rejection + reapply), seed (idempotent), `AuthAdapter` mapping, onboarding finalize transaction, and the tRPC routers over **real Postgres via PGlite** (no DB mocks, per the anti-pattern rule): tenant scoping, guards (UNAUTHORIZED/FORBIDDEN/NOT_FOUND), block add/configure/remove with schema validation, create-from-framework, save-as-named (snapshot + duplicate-label CONFLICT).
- **End-to-end (Playwright): 4 green** in the default suite — public/surface flows (signup identify, sign-in, scaffold home, unauthenticated `/studies` → `/signin`). **0 skipped** (the authenticated loop is an opt-in project, not a skipped test).
- **Authenticated Hanna-loop e2e: written, NOT run.** Lives in the opt-in `auth` project (`npm run test:e2e:auth`). Requires a reachable Clerk + a configured test user; **unverified** — the dev/CI sandbox cannot reach Clerk's CDN. Sign-in strategy + selectors are best-effort and may need tuning on a real instance.
- **Typecheck + production build: clean** throughout.

## Accessibility scan

- **Not run on the authenticated surfaces.** `design:accessibility-review` / axe has not been run against Studies, the Builder, or the dialogs. Roles/labels were authored to spec (radiogroups, `role=dialog`/`aria-modal`, `aria-current`, focus rings, labelled inputs), but this is unverified. **Open:** run an axe pass per surface; known deferrals — the sub-nav and stage tabs are links with `aria-current` rather than full WAI-ARIA tablists with arrow-key roving.

## Performance check

- **Not measured.** Workloads are tiny (single-author, few blocks). No N+1 audit on `studies.list`/`get` beyond the single joins used. **Open:** revisit when a workspace has many studies / a study has many blocks (the wireframe calls for list virtualization > ~1000 studies / > 20 blocks).

## Security review

- **Tenant isolation:** every study read/write goes through `workspaceProcedure`, scoped to the caller's active workspace; cross-workspace access returns NOT_FOUND (covered by tests). Auth identity flows only through the `AuthAdapter`; no `@clerk/*` in feature code beyond the inventoried exceptions.
- **Input validation:** block `config` is Zod-validated at the write boundary (ADR-0012); tRPC inputs are zod-typed. Block config that fails its module schema is rejected, not stored.
- **Role enforcement (addressed 2026-06-02):** write mutations now go through `writeProcedure`, which rejects `viewer`-role members (FORBIDDEN); reads stay open to any member. Tested. (No functional change for V1 single-author owners, but the boundary is enforced for when invites land.)
- **Not formally reviewed:** rate limiting and the `/api/trpc` surface area. **Open:** a `security-review` pass before exposing multi-member workspaces.

## Manual exploratory notes

- **Verified live (real browser):** signup → onboard → land on `/studies` → New study → land in the Builder; theme persists; title rename persists across reload.
- **NOT yet clicked live:** block add via the picker, the Configure form, validation badge flips, Save-as-named, and the from-Framework path. These are integration-test-covered but the **UI was added after the last live session**. The authenticated UI is not screenshot-verifiable in the sandbox (Clerk client SDK won't load).
- **Known deferrals visible in the UI (intended, not bugs):** Whiteboard toggle, "Save & request review", non-Studies left-rail destinations, non-Build stage tabs, and right-panel tabs other than Details/Configure are inert. Incomplete-block completeness is advisory (not a hard save-block).

## Sign-off

I have read the above. The MVP authoring loop is **code-complete and test-green at the unit/integration/surface-e2e layers**, but this is **not a clean ship pass**: the authenticated Hanna-loop e2e is unverified, no accessibility/performance pass has been run on the authenticated surfaces, and block editing + save have not been exercised live. **Risk accepted for continued development; NOT accepted for shipping V1** until: (1) the loop e2e runs green against a real Clerk instance, (2) a manual click-through of block editing + save, and (3) an axe pass per authenticated surface — each logged as a follow-up here.
