# ADR 0042 — Flow blocks: embedded data, end redirect (captcha reserved)

- **Status:** accepted
- **Date:** 2026-06-13
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** participant-runtime, blocks, security

## Context

The block-expansion plan's final cluster: **embedded-data** (capture URL parameters — Prolific PID, condition, source — into the response), **end-redirect** (send completers back to a recruitment platform with a completion code), and a **captcha** decision. These are flow/quality concerns, not questions. The adversarial review fixed the security posture: embedded-data must be default-deny (a researcher-declared allowlist, never "capture every param"), end-redirect must be open-redirect-safe, and captcha should ship as nothing now with a vendor reserved behind a gated, unprovisioned lock-in entry.

## Options considered

### Are these "blocks"? — Option A: blocks that are non-screen (chosen) · Option B: study-level settings

- **A:** they live in the registry/picker (researchers think "add a redirect at the end"), but the participant runtime FILTERS them out of the visible screen flow (they render no participant screen) — embedded-data captures at start, end-redirect renders on the completion page. `collectsResponse:false`, no response_item.
- **B:** separate study settings surfaces would fragment the "everything is a block" model and need new UI. Rejected; the non-screen-block filter is one chokepoint in `visibleBlocks`/`resolveVisibleScreens`.

### embedded-data capture — Option A: declared allowlist, captured at start (chosen)

- Config is `{params: string[]}` — the exact param NAMES the researcher wants. The start page reads that allowlist from the runnable snapshot, pulls only those names from the URL, and `startResponse` writes them to `response.clientMetadata.embedded`. Never captures undeclared params (PII safety). Placement in the block list is irrelevant — capture is at start. **(Amended 2026-06-14:** originally documented as `response.metadata.embedded`, but the `response` table has no `metadata` column — that jsonb lives on `recruitment_session`. The write targeted a non-existent column and Drizzle silently dropped it, so embedded params never persisted. Fixed to the existing `clientMetadata` jsonb under an `embedded` namespace — no migration, no reader changes since nothing read it back yet.)

### end-redirect safety — Option A: validated-https button, participant-clicked (chosen) · Option B: server host-allowlist · Option C: auto-redirect

- A research redirect target is legitimately arbitrary (Prolific, SONA, Qualtrics back-links), so a host-allowlist (B) would block real use. An auto-redirect (C) to a researcher-supplied URL is an open-redirect/abuse vector. **A:** the completion page validates the URL parses as http(s) and renders a prominent button the participant clicks, with the destination visible and the completion code shown — no silent redirect to an unvetted URL.

### captcha — Option A: ship nothing, reserve Cloudflare Turnstile (chosen)

- The existing rate-limit (ADR per Upstash) + attention-check already deter bots. Turnstile (privacy-friendly, free) is recorded as the chosen vendor in a lock-in-inventory entry but NOT shipped — it needs an owner-provisioned secret (gated). Nothing gated ships in this wave.

## Decision

We will add embedded-data and end-redirect as `collectsResponse:false` registry blocks that the runtime treats as non-screen (filtered from `visibleBlocks`/`resolveVisibleScreens`). embedded-data captures a researcher-declared URL-param allowlist into `response.clientMetadata.embedded` at start (see the 2026-06-14 amendment above — the `metadata` column it originally named does not exist on `response`); end-redirect renders a validated-https, participant-clicked completion button + code on the completion page. Captcha ships as nothing with Turnstile reserved (gated) in the lock-in inventory.

## Consequences

- **Easier:** panel integration (Prolific PID in → completion code out) works end to end; researchers capture exactly the params they declare.
- **Harder:** two non-screen blocks are a new runtime concept (one filter set, documented); the block-library preview shows them as a builder note, not a participant input.
- **Committed to:** default-deny param capture; no silent external redirect; no captcha vendor wired until owner-provisioned.
- **Precluded from:** capturing arbitrary URL params; auto-redirect.

## Revisit triggers

- Bot/fraud pressure appears → provision Turnstile (gated) and wire the reserved adapter.
- Researchers want auto-redirect → add it behind an explicit, destination-shown confirmation, never silent.

## References

- block-expansion-design plan + adversarial review (embedded-data PII, open-redirect, captcha posture)
- [ADR-0013](0013-participant-runtime-and-analytics.md) (runtime), [ADR-0014](0014-response-data-model-and-conditioning.md)-era response model (`response.clientMetadata`)
- Wireframes: [embedded-data](../../03_design/wireframes/embedded-data.md), [end-redirect](../../03_design/wireframes/end-redirect.md)
- Code: `server/runtime/participant.ts` (non-screen filter + start capture + completion config), `app/(take)/take/[studyId]/start` + `…/complete`, `lock-in-inventory.md` (Turnstile reserved row)
