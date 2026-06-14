# QA audit — 2026-06-14 — /api/media `resp/` access control (security)

## Overview

- **Auditor:** Claude (agent).
- **Scope:** close the pre-existing, tracked security finding that `/api/media` was a **public** gateway with no authorization on participant uploads (`resp/` keys = signatures/files/audio/video, PII). Flagged in the ADR-0041 explore amendments (line 71/80) and deferred there as condition "(i)". Designed + adversarially reviewed (`hotspot-actions-signature-auth-design` workflow). Wave 1 of the signature work; also the unblocker for the signature viewer/gallery.
- **Verdict:** ✅ fix implemented + node-tested; cleared for deploy (the gallery copy stays out until this is live in prod). No DB migration.

## The finding (HIGH, pre-existing)

`app/api/media/[...key]/route.ts` validated only `isSafeMediaKey` then 302'd to a presigned R2 GET — **no session/ownership check**. A `resp/<responseId>/<ulid>` participant upload was protected only by the unguessability of its ULID key (security-by-obscurity, not access control). Anyone who obtained or enumerated a key could read another workspace's participant PII, indefinitely, from any context (a leaked CSV, email, screenshot, browser history).

## The fix

`/api/media` now authorizes `resp/` reads against the owning workspace; `ws/` researcher stimuli stay public.

- **Prefix-branch before any cost.** The route resolves identity (`auth.getCurrentUser()`) **only** for `resp/` keys; `ws/` short-circuits straight to presign — no Clerk call, no DB query. (Adversarial-review correctness fix: the first design called auth on every hit, adding a Clerk round-trip to every anonymous stimulus impression; corrected.)
- **`resp/` → active workspace member.** Decision logic is the pure `authorizeMediaKey(key, externalUserId, deps)` (`server/media/authorize.ts`); the DB-backed deps resolve `resp/<responseId>` → `response.experimentVersionId` → `experimentVersion.experimentId` → `experiment.tenantId` (workspace), and check `member` ⋈ `user` where `user.externalId = <Clerk id>`, `member.workspaceId = <owning ws>`, `member.status = 'active'`. Anonymous → **403**; logged-in non-member → **403**; unresolved response/key → **404**.
- **Anti-XSS disposition unchanged + downstream.** The signed inline-vs-attachment logic (ADR-0003 2026-06-13 amendment) runs AFTER the auth check — authorization is additive; `resp/` non-rasters still force `attachment`.

## The trap — verified safe

The concern with gating `resp/` was breaking participants (who are not logged in). **Verified by grep across `app`/`components`/`lib`/`server`: no participant flow reads a `resp/` asset back through `/api/media`.** All four upload blocks (signature/file-upload/audio-record/video-record) PUT via `/api/take-upload` and preview locally — signature draws on a canvas, audio/video use `URL.createObjectURL`, file-upload shows the filename only. The `mediaUrl` config schema only ever produces `/api/media/ws/...`. So `ws/` stays public for stimuli and `resp/` gating breaks no participant path.

## Verification

- **Unit (node):** `server/media/__tests__/authorize.test.ts` — 7 cases: `ws/` ok with DB deps **not called** (zero-cost proof); `resp/` active member ok; anonymous → 403 (no membership lookup); non-member → 403; unresolved → 404; empty responseId → 404; unknown namespace → 404.
- **Static:** `tsc --noEmit` clean; full `vitest`/`lint`/`build` green; exit-code-gated (no grep-pipe before any push, per the deploy rule).
- **Not exercised by the agent:** a live cross-workspace fetch against R2 (requires prod secrets + two real workspaces) — the membership chain mirrors the verified `getResults` join and is covered by the pure unit tests; recommend a manual prod smoke (open a signature URL while signed into a non-owning workspace → 403) after deploy.

## Residual / follow-ups

- **Fail-closed:** if `auth.getCurrentUser()` throws, the `resp/` request errors → denied (correct posture). `ws/` never calls it.
- **Gallery copy:** the signature viewer/gallery (Wave 3b) and any "private to your workspace" wording must deploy **after** this is live in production (ADR-0041 line 71). Wave ordering enforced.
- **Other `resp/` consumers** (file-upload/audio/video viewers, if added later) inherit this gate automatically — no per-feature work.
