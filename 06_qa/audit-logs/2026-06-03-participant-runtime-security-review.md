# QA — 2026-06-03 — Participant-runtime security review + V1.6 axe checklist

> V1.6 pre-work PR-2 (the two V1.5-audit carry-forwards). Part A: a focused security review of the public, unauthenticated `/take/*` participant runtime + the hardening landed this PR. Part B: the real-Clerk axe DevTools checklist for the researcher surfaces (owner-run — headless Clerk auth isn't possible in the sandbox).

## Scope

The participant runtime is the only **public, unauthenticated, mutating** surface in the app (ADR-0013): `/take/[studyId]/start` (consent) and `/take/[studyId]/[sessionId]/[questionIndex]` advance via Next.js **Server Actions** (`beginAction`, `answerAction`) → DB writes. Everything else is behind Clerk + `workspaceProcedure`/`writeProcedure` (covered by the MVP audit's role-enforcement review).

## Threat model + findings

| # | Threat | Status | Notes |
|---|--------|--------|-------|
| 1 | **CSRF** on the public form-POSTs | ✅ Mitigated by framework | Next.js Server Actions enforce a same-origin check (Origin vs Host) on every action invocation; a cross-site POST is rejected. No cookie-auth is involved on `/take` anyway (it's unauthenticated). |
| 2 | **Oversized payloads** (giant free-text, huge option arrays) → storage abuse | ✅ Hardened this PR | `responseSchema` now bounds: free-text ≤ 10k chars; multiple-choice/attention `selected` ≤ 50/1 items of ≤ 500 chars; ranking `order` ≤ 100 items. Rejected as `invalid_answer` before any write. |
| 3 | **Forged answer values** (a crafted POST selecting an option that isn't in the question, a slider value out of range, a ranking over items not in the block) → dirty/invalid data | ✅ Hardened this PR | New `CoreModuleDef.validateAnswer(answer, config)`, run server-side in `recordAnswer` after the shape check: multiple-choice/attention selections must be among `options` (single-select caps at 1); slider value must be in `[min, max]`; ranking entries must be among `items`. The UI already constrains these; this closes the crafted-POST bypass. |
| 4 | **Draft exfiltration / running an unfrozen study** | ✅ By design | `/take` only serves an **immutable** runnable version (`resolveOpenRecruitment` → latest `kind ∈ {preregistered, published}` with an **open** recruitment). A draft/closed/unknown study yields "not accepting responses". |
| 5 | **Preview replay** (flip a real response to preview via the URL) | ✅ By design | `mode` is set once at session creation and read from the `response` row thereafter, never re-read from the URL (ADR-0013). |
| 6 | **Duplicate completion** from the same recruitment PID | ✅ By design | Partial unique index `(recruitment_session_id, external_pid)`; `startResponse` resumes an existing attempt rather than duplicating. |
| 7 | **PII leakage / logging** | ✅ By design | No IP / raw UA captured (`client_metadata` is never populated); grep confirms no IP/header capture in `/take` or the runtime; the anonymous identifier is a server-minted ULID (ADR-0014). |
| 8 | **Session-id guessing** (continue another participant's session) | ⚠️ Accepted (low) | `[sessionId]` is a ULID in the URL; a guessed id could append answers to another anonymous attempt. Anonymous + unguessable-in-practice; no PII exposed. Acceptable for V1.6; revisit if a per-session token is warranted. |
| 9 | **Rate-limiting / flooding** the answer + start endpoints | ⛔ Deferred → deploy | A real limiter needs a shared store across serverless instances (in-memory is per-instance, ineffective). Recommend a hosted limiter (e.g. Upstash Ratelimit) keyed by `recruitment_session_id` + a coarse IP bucket at the edge, decided in **ADR-0016 (production deploy)**. The payload bounds (#2/#3) cap the per-request blast radius in the meantime. |

## Hardened this PR (code)

- `server/modules/registry.ts`: tightened `responseSchema` bounds (#2) + added `validateAnswer` to multiple-choice, attention-check, ranking, slider (#3).
- `server/runtime/participant.ts`: `recordAnswer` runs `def.validateAnswer(parsed.data, block.config)` after the shape check; failure → `invalid_answer` (no write).
- Tests: registry membership/range/bounds cases (`registry.test.ts`); the existing runtime tests cover the `recordAnswer` validation path.

## Deferred to production deploy (ADR-0016)

- A hosted rate-limiter on `/take/*` (#9).
- A WAF/edge IP throttle is the other half (CDN-level).

## Part B — axe DevTools checklist (owner-run, real Clerk session)

Headless axe can't authenticate against Clerk in the sandbox; the **participant** runtime was already axe-clean (V1.5 audit). Run **axe DevTools** (or Lighthouse a11y) on each **researcher** surface while signed in, and log results back here:

- [ ] **Preregister** stage — banner states (idle / pending / pushed / failed / no_credentials), the Retry button, the OSF connect chip.
- [ ] **Run** stage — Preregister vs **Publish & run** buttons, recruitment status + copy-link field, Preview link.
- [ ] **Results** stage — by-condition list, by-question summaries (numeric / categorical option-counts / text), preview-included toggle, Export CSV button, empty states.
- [ ] **Builder** — the **Conditions** section (name/slug/weight inputs, remove buttons) + the per-block **"Show only if condition"** multi-select + the new module config forms (option-list editor, number, demographics toggles).
- [ ] (Carry-forward) the MVP authenticated surfaces (Studies destination, New-study modal, the Builder block list).

Log each as pass / findings inline above, then this carry-forward is closed.

## Status

✅ **Participant-runtime security: hardened** for V1.6 pre-deploy (payload bounds + config-membership validation + the by-design protections). Rate-limiting is the one explicit deferral, scoped to the production deploy (ADR-0016). The researcher-surface axe pass is **owner-run** (checklist above). 111 vitest green; typecheck clean.
