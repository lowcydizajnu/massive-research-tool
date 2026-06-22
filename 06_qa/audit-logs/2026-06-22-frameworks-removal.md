# QA audit — 2026-06-22 — Frameworks removal (Library L2)

## Overview

- **Auditor:** Claude (agent), at the owner's direction ("continue with L2 and L3").
- **Scope:** Remove the retired Frameworks destination; Templates (Library L1, ADR-0063) is the successor. Handoff `04_architecture/handoffs/code-tab-library-completion.md` §L2 (owner-simplified 2026-06-22).
- **Verdict:** done — migration-free, 669 vitest green, build clean.

## What changed

- **Deleted:** `app/(app)/(workspace)/frameworks/` route, `server/trpc/routers/frameworks.ts`, `server/frameworks/registry.ts` (the in-code `FRAMEWORK_REGISTRY` — Frameworks were never seeded `experiment` rows, so there was nothing to migrate).
- **Deregistered:** `frameworks` from `server/trpc/root.ts`.
- **`studies.create`:** dropped the `framework` start-kind + `frameworkKey` (now blank-only; curated starts are Templates via `templates.useTemplate`).
- **Follows:** removed `framework` from `FOLLOW_TARGET_TYPES`, the list-resolver case, and the feed matcher/reason; `list` now filters out any retired-type rows so legacy `framework` follow rows degrade gracefully (no crash).
- **New-study modal:** "From a Framework" → **"From a Template"** (routes to `/library?tab=templates`); embedded framework picker removed.
- **Chrome/copy:** removed Frameworks from the left rail, ⌘K palette (replaced with Library), the breadcrumb RAIL set, and the Activity/Home/widget follow-copy.
- **IA:** v0.8 changelog entry; destinations table drops Frameworks (Library absorbs Templates); Frameworks sub-nav removed.

## Deliberately NOT done (owner-directed simplification)

- **No content migration** (no `workspace_template` auto-created from the framework) — author a fresh starter template later if an onboarding hook is wanted.
- **No `workspace.is_starter` column**, **no `framework`→`template` follow remap**, **no 90-day redirect shim** — there are no external users, so `/frameworks` simply 404s now.
- The DB `follow` CHECK constraint still lists `'framework'` (harmless; leaving it avoids a migration). Legacy framework follow rows are filtered out in code.

## Verification

- `npm run typecheck` — clean (after clearing stale `.next/types` for the deleted route).
- `npx vitest run` — **669 passed** (the two framework-create tests replaced by one blank-create test; +5 templates tests from L1).
- `npm run build` — compiles; no `/frameworks` route; `/library` + `/library/templates/[id]` present.
- Lint — clean except a pre-existing `no-explicit-any` rule-config error in `notifications.test.ts` (unrelated).
- Not browser-verified (Clerk-auth surfaces); relied on full typecheck + build + tests.

## Result

Frameworks is gone; the IA has one fewer top-level destination; Templates is the single curated-reuse surface. Deployed with L3+ as part of the v1.16.0 train (see STATUS).
