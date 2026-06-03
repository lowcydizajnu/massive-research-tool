# QA audit — 2026-06-03 — V1.7 (the review network)

## Overview

- **Date:** 2026-06-03
- **Scope:** the whole V1.7 anchor (ADR-0015 + ADR-0017 + ADR-0018), built across six PRs:
  - **PR-0** — schema + emission infra (no UI): migration 0003 for `comment` / `mention` / `notification` / `activity_event` / `follow`; `server/events/` (`emit()` writes an `activity_event` + enqueues fan-out; 8 event types; per-type recipient resolvers); the `notification.fanout` job (idempotent `ON CONFLICT`) + the `email.digest` stub (V1.8); Inngest functions + dev inline fallback.
  - **PR-1a** — comments backend: `comments` router (`list`/`create`/`resolve`/`update`/`delete`), flat threads per target (study or block_instance), tenant-scoped, @mentions validated against active members, emits `comment_on_your_study` + `mention` (+ `comment_resolved`).
  - **PR-1b** — Share stage UI: `/studies/[id]/share`, per-block comment markers, the Comments tab with an @-mention composer, markdown rendered via marked + DOMPurify (ADR-0015 allowlist).
  - **PR-2** — fan-out live + Activity·Yours: `emit()` wired into preregister / saveAsNamed / the OSF-push job (the last as a system event); `notifications` router (per-user); the `/activity` destination (Yours) + the rail unread badge.
  - **PR-3** — Activity·Follows + the four `+Follow` affordances: `follows` router (`follow`/`unfollow`/`myFollows`/`feed` via `activity_event × follow`); a reusable `FollowButton` on author / study / tag / framework; **study-level tags** (ADR-0017, migration 0004) + the Builder tag editor; the **Frameworks** browse destination.
  - **PR-4** — cross-workspace forking + Replications + Save & request review (ADR-0018): `studies.fork` (the one permission-gated cross-tenant read), `setForkable`, `getReplications` + `diffBlocks` (divergence withheld for unseeable cross-tenant forks); the Builder Replications tab + Replicate button + forkability toggle; the Save dialog's `review_request` path.
  - **PR-5** — two failing-first gated e2e specs (`hanna-network`, `hanna-publish-and-run`) in the opt-in `auth` project.
- **ADRs in play:** [0015](../../04_architecture/adrs/0015-notifications-comments-activity.md) (notifications/comments/activity, hybrid fan-out), [0017](../../04_architecture/adrs/0017-study-level-tags.md) (study-level tags), [0018](../../04_architecture/adrs/0018-cross-workspace-forking.md) (cross-workspace forking), building on [0002](../../04_architecture/adrs/0002-forking-model.md) (snapshot forking + `forkable_by`), [0011–0014](../../04_architecture/adrs/). *(Filenames verified present.)*
- **Wireframes (gates, committed before their UI):** [activity-destination](../../03_design/wireframes/activity-destination.md), [share-stage](../../03_design/wireframes/share-stage.md), [follow-affordances](../../03_design/wireframes/follow-affordances.md), [replications-tab](../../03_design/wireframes/replications-tab.md), [frameworks-browse](../../03_design/wireframes/frameworks-browse.md). *(Verified present.)*
- **Status of this audit:** ✅ **Cleared for continued dev / internal use.** The V1.7 anchor is code-complete, unit + integration tested (141 green), typecheck-clean, and the network loops were exercised live (single operator, via the dev seeder) end to end. It is **NOT** marked "ship V1.7 publicly" — the same three ship gates as V1.6 carry forward (real-Clerk axe DevTools pass on the new researcher surfaces; a live run of the gated multi-user e2e; the production deploy, ADR-0016), plus the V1.7-specific carry-forwards below. See Sign-off.

## Test results

- **Unit + integration (Vitest): 141 green** (0 failing, 0 skipped). Net **+30 since the V1.6 audit (111 → 141)**. New coverage by area:
  - **emit/recipients/fan-out** (`server/events/__tests__/emit.test.ts`): `emit()` writes the event + enqueues; recipient resolution for mention / comment_on_your_study (author + earlier commenters, actor excluded) / preregister_complete (Follows-only → []) / **osf_push_complete as a system event** (actorUserId null ⇒ the initiator is NOT filtered out — the bug this framing prevents); fan-out idempotency on re-fire; Follows-only inserts nothing.
  - **comments** (`comments.test.ts`): create emits both events + inserts mentions; non-member mentions dropped; list oldest-first + target filter; resolve emits; author-only update/delete (FORBIDDEN); tenant NOT_FOUND.
  - **notifications** (`notifications.test.ts`): the full live chain (comment → fan-out → Yours), per-user read scoping, markRead/markAllRead, saveAsNamed Follows-only (no notification).
  - **follows** (`follows.test.ts`): idempotent follow/unfollow, self-author no-op, myFollows; the `activity_event × follow` feed (author/study/tag match, own actions excluded, reason tagging), empty-follows → [].
  - **tags**: `setTags` normalize→dedupe→slug + tags surfaced on `get` + copied into `related_tag_slugs` on preregister.
  - **forking** (`studies.test.ts` + `blocks-diff.test.ts`): `diffBlocks` (added/removed/changed/unchanged, ref-change, config key-order-insensitive, identity); same-workspace fork (instanceIds preserved + visible diff + parent link); cross-workspace fork (FORBIDDEN when private, allowed + emits `fork` when public, **diff withheld** for the private cross-tenant child); `saveAndRequestReview` (emits `review_request` + creates the version; non-member reviewer BAD_REQUEST).
- **Migration test:** the pglite migration test still asserts the full table set incl. the five V1.7 tables + indexes (idempotency, partial-unread, GIN tag); migrations 0003 + 0004 applied to Neon.
- **Browser e2e (Playwright):** default `chromium` suite green, **0 skipped** (the new `hanna-network` + `hanna-publish-and-run` specs live in the opt-in `auth` project, `testMatch **/hanna-*`; verified the default project lists neither). The gated specs are **failing-first + UNVERIFIED in the sandbox** (no Clerk CDN; the network spec also needs three `+clerk_test` users with Maya a member of Hanna's workspace) — they run on the owner's machine via `RUN_AUTH_E2E=1 … npm run test:e2e:auth`.
- **Typecheck: clean.** **Production build:** last verified clean at the PR-4/PR-5 boundary (`/activity`, `/frameworks` dynamic; `/studies/[id]/build` builds). The only changes since are the gated e2e specs (not built) and a one-line `href` string fix (typecheck-clean). A `next build` was **not** re-run for this audit because the dev server held `.next` (a concurrent build produced a spurious `/api/*` PageNotFoundError); **re-run `npm run build` with the dev server stopped before deploy** (trivial gate).
- **Validator:** clean at **65 instances** (+8 since V1.6: ADR-0015/0017/0018 + the activity-destination / follow-affordances / replications-tab wireframes were each the per-PR gate).

## Bugs found in this audit + fixed

- **Dead Activity links (fixed, `71fef12`).** Activity·Yours (fork / OSF rows) and Activity·Follows rows linked to `/studies/{id}`, but studies have **only stage routes** (`/build`, `/share`, …) — no index — so the links 404'd (caught by the owner clicking a replication). Repointed to `/studies/{id}/build` (the canonical entry; comment/mention/review rows already used `/share`). Swept all `studies/${…}` links app-wide afterward — every remaining one carries a stage segment.

## Accessibility scan

- **Status: new researcher surfaces code-reviewed; real-Clerk axe DevTools carried forward (headless axe still can't auth against Clerk in the sandbox).** Participant runtime unchanged from V1.6 (0 violations there stands).
- **Activity destination:** Yours/Follows are an ARIA `tablist` with `aria-selected`; each event row is a sentence with a `<time>`; **unread is never color-only** (left accent + a visually-hidden "Unread:" prefix; the rail badge pairs its count with an `aria-label`).
- **FollowButton:** a real `button` with `aria-pressed` and an accessible name that names the target ("Follow the misinformation tag" / "Following Hanna — activate to unfollow"); state conveyed by text, not color.
- **Replications:** the tab joins the right-panel `tablist`; divergence chips pair the symbol with text ("3 changed"); "divergence hidden" is text.
- **Tag chips / reviewer picker / forkability toggle:** chips pair `#slug` text with sibling (not nested) Follow + remove buttons; the reviewer `select` is labelled; the forkability control is a labelled `role="switch"` with `aria-checked`.
- **Comment render:** sanitized HTML only (marked + DOMPurify allowlist); no `dangerouslySetInnerHTML` without DOMPurify; links forced `rel="noopener noreferrer" target="_blank"`, http(s)/mailto only.

## Security / tenancy review

- **The one cross-tenant read is contained (ADR-0018).** `loadForkSource` is the only query that bypasses the active-workspace filter; it returns a study only if `forkable_by='public'` OR the caller is an active member of the source's workspace. Everything else (`get`/`list`/comments/conditions/run/results) stays workspace-scoped. `link-only` is recognised but not yet honoured (deferred).
- **Replications don't leak private protocols.** `getReplications` computes the block-divergence diff only for children the caller can see (public or same-workspace); other children are counted + named but their diff is withheld (`null` → "divergence hidden"). Tested.
- **Notifications + follows are identity-scoped, not workspace-scoped** (you see activity about/your follows across workspaces) — intentional (ADR-0015); reads scope to `recipientUserId` / `follow.userId`, never trusting the active workspace.
- **Fan-out is idempotent** (`UNIQUE(recipient_user_id, source_event_id)` + `ON CONFLICT DO NOTHING`), so an Inngest retry can't double-notify.
- **@mentions are workspace-internal** (validated against active members; non-members silently dropped server-side even if a client supplies them).

## Known issues / gaps (accepted for V1.7)

- **Cross-workspace discovery is absent.** There's no UI to browse/open another workspace's public study, so the *cross-workspace* Replicate is reachable only by id/link (the gated e2e drives `studies.fork` directly). A study link you can't open `notFound()`s gracefully. A share-link / explore surface is the ADR-0018 revisit trigger.
- **Follows "why you see this" label is wrong for `fork` events.** The author-reason label uses the event actor's name; for a fork the actor (replicator) ≠ the followed author (source author), so it can mislabel. Correct for preregister/named (actor = author, the common Follows events). Minor cosmetic — fix is a related-author name lookup. *(Logged; not blocking.)*
- **Team-invite UI is still deferred.** A real workspace has only the owner, so the network loops can't be exercised by inviting a teammate; a **dev seeder** (`05_app/scripts/seed-network-demo.ts`) stands in (adds members + seeds activity) for manual/solo testing. Seeded members have no Clerk login (can't act back).
- **Comment markdown sanitizer has no node unit test** (DOMPurify binds `window`); the allowlist is declarative + battle-tested, exercised by build + the gated e2e.
- **Email digest** events are emitted but the handler is a stub (V1.8).
- **Deferred by ADR:** link-only forking, pull-from-upstream / merge (ADR-0002), the two-directional family-tree visual + card replication count (replications-tab open questions), saved-search follow target (ADR-0015 Decision 5).

## Sign-off

✅ **Cleared for continued dev / internal use.** V1.7's anchor — the review network (notifications / comments / activity), study-level tags, follows + the four `+Follow` affordances, cross-workspace forking + Replications, and Save & request review — is built, tested (141 green), typecheck-clean, and exercised live end to end (single operator via the seeder). One real bug surfaced and was fixed (the Activity 404). 

❌ **Not cleared to ship V1.7 publicly.** Carry-forwards before public ship:
1. **Real-Clerk axe DevTools pass** on the new researcher surfaces — Activity (Yours/Follows), Frameworks, the Builder Replications tab + tag editor + forkability control, Share stage (owner-run; headless axe can't auth).
2. **A live run of the gated multi-user e2e** (`npm run test:e2e:auth` with three test users) to verify the selectors + the full loop against a real Clerk instance; adjust selectors as needed.
3. **Production deploy as the next version** (ADR-0016, execution still owner-deferred) — and re-run `npm run build` with the dev server stopped as a pre-deploy gate.
4. Address (or consciously accept) the two minor items above — the Follows fork-label and the absence of a cross-workspace discovery surface.
