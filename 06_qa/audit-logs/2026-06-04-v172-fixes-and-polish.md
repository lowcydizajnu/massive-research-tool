# QA audit — 2026-06-04 — V1.7.2 fixes + builder polish

## Overview

- **Auditor:** Claude (agent).
- **Scope:** Everything merged to `main` after the `v1.7.1` tag — the production module-picker fix, the Google-OAuth signup-trap fix, request caching hardening, a lint guardrail, version-label clarity, and the version preview/restore feature (ADR-0019).
- **Verdict:** ✅ cleared to ship as **v1.7.2**. Critical production regression resolved + verified live by the owner; the new feature is gated, tested, and confined to the active workspace.

## What changed since v1.7.1

1. **fix(modules) — production module picker empty (`82425f8`).** The Builder's "Add block" picker returned nothing in production for a logged-in owner. Root cause: `modules.ts` imported the Drizzle table as the bare identifier `module`, which webpack passes as the CommonJS module-wrapper parameter to every bundled factory; in the minified prod bundle that param shadowed the import, so `module.id` resolved to a numeric webpack chunk id (`"12589"`), which Drizzle bound against a `uuid` column → `22P02 invalid input syntax for type uuid`. Prod-only (minification); dev + all tests passed. Fixed by renaming the export to `moduleTable` + updating importers. **Full root-cause narrative in `2026-06-04-v171-polish-deploy.md`.** Owner confirmed the picker works live.
2. **chore(lint) — guardrail (`154afcf`).** `.eslintrc.json` `no-restricted-syntax` rule errors on any import bound to `module`/`exports`/`require`/`__dirname`/`__filename`; `npm run lint` added to CI before typecheck. Prevents recurrence of the class of bug above. Repo lints clean; rule verified to fire on a probe.
3. **feat(builder) — clearer version labels (`d610649`).** Replaced the confusing `current` badge (it outranked a just-saved named version) with **Working copy** / **Unsaved changes** (when the autosave tip diverges from the latest frozen snapshot) on the tip and **Latest saved** on the newest conscious save. `listVersions` now returns `isWorkingCopy` / `isLatestSaved` / `hasUnsavedChanges`.
4. **feat(builder) — version preview + restore (`be1068e`, ADR-0019).** Clicking a Versions-tab row reveals a read-only block preview; a frozen version's preview carries **"Restore as working copy"** (inline confirm). `studies.getVersion` (read-only) + `studies.restoreVersion` (writeProcedure; copies the frozen snapshot's blocks onto the autosave tip via `writeBlocks` — the frozen version is never mutated, `current_version_id` unchanged; refuses to restore the autosave onto itself; no activity event).
5. **fix(auth) — Google OAuth signup trap (`be3f944`).** One-shot guard on the pending-OAuth pickup effect + conflict routes to `/signin` instead of looping. (Owner-only Clerk account-linking remains the clean-merge follow-up — see below.)
6. **fix(trpc) — no-store + always-refetch (`21bd43f`).** `/api/trpc` responses are `no-store`; the picker refetches on mount. Defensive hardening (correct regardless of the root cause).

## Verification

- **Unit/integration:** `163 vitest green` (20 files), including 4 new ADR-0019 tests (preview; restore-without-mutating-the-frozen-source; refuse-to-restore-the-working-copy; cross-tenant `NOT_FOUND` on both `getVersion` and `restoreVersion`) and an added `hasUnsavedChanges` assertion on `listVersions`.
- **Static:** `npm run typecheck` clean; `npm run lint` clean (new rule active); `next build` clean (debug endpoint removed).
- **Manifest:** `validate.py` clean — 24 types / 69 instances (ADR-0019 registered).
- **Live prod:** owner confirmed the module picker fills and the relabeled Versions panel reads correctly on `https://myresearchlab.app` (deploys `82425f8` → `be1068e`).

## Tenancy / safety review (new write path)

- `getVersion` + `restoreVersion` are workspace/writeProcedures scoped to `ctx.workspace.id`; a version id outside the active workspace is `NOT_FOUND` (test-covered).
- Restore overwrites the working copy only; frozen snapshots (named/preregistered/published) are never mutated — preregistration integrity (ADR-0002/0004) holds. UI requires an explicit confirm that warns about discarding unsaved edits, surfaced alongside the `Unsaved changes` badge.
- Restore emits no activity event by design (private working-copy edit, not a conscious save) — recorded as a revisit trigger in ADR-0019.

## Known caveats carried forward

- **Clerk account-linking (owner-only)** — still the clean "Google = same user" fix; the code makes the failure graceful. See `handoffs/clerk-oauth-identity-linking.md`.
- **OAuth 5d pickup** remains unverified against live Clerk (worst case is a clear error, not a loop).
- A few low-frequency Builder buttons remain disable-only (no spinner) — opportunistic follow-up noted at v1.7.1.
- `next lint` is deprecated in Next 16; the `.eslintrc.json` works on Next 15.1 today. Migrate to the ESLint flat-config CLI when upgrading.

## Sign-off

- [x] Agent: V1.7.2 changes deployed (`be1068e`), smoke-verified live by the owner; unit/typecheck/lint/build/validator all green; tagged `v1.7.2`.
- [ ] **Owner:** enable Clerk account-linking + verify the Google flow on production (carries from v1.7.1) → then the OAuth story is fully closed.
