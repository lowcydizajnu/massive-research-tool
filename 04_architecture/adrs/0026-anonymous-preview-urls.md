# ADR 0026 — Anonymous preview-URL semantics

- **Status:** accepted
- **Date:** 2026-06-08
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** runtime, security, sharing

## Context

V1.12 I: researchers want to share a draft study with an external colleague for review *before* preregistering — someone who does not have an account. V1.7's "Save & request review" covers workspace members (Clerk-authed); this is the un-authenticated case. We need a link that grants read-only, no-data-recorded access to one study's current draft, without creating a Clerk session, and that the researcher can expire/revoke.

This introduces a new pattern: a **public route that bypasses auth via a bearer token** (everything else public is either truly public, like Browse, or Clerk-gated). It gets an ADR to lock the security model.

## Options considered

### Option A — hashed, expiring, revocable token in a dedicated table (chosen)

- A `preview_token` row stores only the **SHA-256 hash** of a random 32-char token; the plaintext lives only in the shared URL. Columns: `experiment_id`, `token_hash` (unique), `created_by`, `expires_at`, `revoked_at`. Route `/preview/<studyId>?token=…` hashes the param, looks up a matching non-revoked, non-expired row scoped to that study, and renders the participant `BlockView` read-only.
- **Pros:** stealing the DB doesn't leak working links (only hashes); per-link expiry + revocation; scoped to one study; no session created; no PII captured; trivial to reason about.
- **Cons:** a new table + the discipline of never logging the plaintext.

### Option B — stateless signed token (HMAC / JWT), no table

- Sign `{studyId, exp}` with a server secret; verify on the route; no storage.
- **Pros:** no table.
- **Cons:** **not revocable** before expiry (the core requirement); rotating the secret invalidates all links at once; leaks studyId in the token. Rejected.

### Option C — make the existing `/take` runtime accept a preview flag

- Reuse the participant route with `?preview`.
- **Cons:** `/take` is built around a recruitment session + response rows; bending it to a session-less anonymous viewer muddies the runtime and risks accidentally recording data. The read-only `BlockView` render is cleaner + safer. Rejected for this purpose.

## Decision

**We will use Option A** — a hashed, expiring (7-day default, 1–30 configurable), revocable per-study token table, with a public `/preview/<studyId>?token=…` route that renders the draft read-only through the participant `BlockView`. The token is the authorization; no Clerk session is created and nothing the visitor enters is recorded.

## Consequences

- **Easier:** external review of drafts without accounts; researchers control link lifetime + can revoke.
- **Harder:** one more table + the rule that the plaintext token is never persisted or logged (only returned once at creation, surfaced in the copy-link UI).
- **Committed to:** tokens are per-study and per-link; `create`/`list`/`revoke` are workspace-scoped mutations; the loader returns null on any miss (one neutral "link not valid" page — no oracle distinguishing expired vs revoked vs wrong-study).
- **Precluded from:** nothing — preregistration/runtime are untouched; the route reads the working tip read-only.

## Revisit triggers

- We need preview links that capture feedback (annotations) — that would add write surface + likely a session.
- Abuse (link sharing at scale) warrants rate-limiting the public route (reuse the V1.6 Upstash RateLimitAdapter).

## References

- `05_app/server/runtime/preview.ts` (loader + hashing); `05_app/server/trpc/routers/preview-tokens.ts` (create/list/revoke); `05_app/app/preview/[studyId]/page.tsx` (public route); migration `0007`.
- ADR-0013 (participant runtime — why we render BlockView, not a session); ADR-0014 (no-PII discipline); V1.7 Save & request review (the authed sibling).
