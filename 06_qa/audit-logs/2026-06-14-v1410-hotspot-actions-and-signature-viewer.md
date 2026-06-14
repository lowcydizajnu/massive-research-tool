# QA audit — 2026-06-14 — V1.41.0 Hot-spot region actions + invisible regions + signature viewer

## Overview

- **Auditor:** Claude (agent).
- **Scope:** the hot-spot + signature wave series (owner asks: invisible-but-active regions; region click actions "go to a question / a link / set a value / propose more"; and signatures — "what is the issue, how is it exported, can we have the same deep link?"). Designed + adversarially reviewed via the `hotspot-actions-signature-auth-design` workflow; built in waves smallest-safest first.
- **Verdict:** ✅ cleared for the owner's live review. **No DB migration** anywhere. Wave 1 (the security fix) already shipped as v1.40.0; this log covers v1.41.0 (waves 2/3/4-6) plus the v1.40.0 security context.
- **Deploy ordering respected:** the signature viewer/gallery (+ its "private to your workspace" copy) ships only now that the `/api/media` `resp/` access-control fix is **live in production** (v1.40.0, `2da1f65`) — the ADR-0041 line-71 condition.

## What shipped

**v1.40.0 (live — see `2026-06-14-media-resp-access-control.md`):** `/api/media` `resp/` workspace-ownership access control + the embedded-data persistence fix.

**v1.41.0 (this batch, local → deploying):**
1. **Invisible hot-spot regions** (wave 2, ADR-0041 amendment-c) — optional `visible?` flag; `false` ⇒ no outline/fill for the participant but still clickable + keyboard-focusable (focus ring + `aria-label`). The Builder always shows every region (dashed + dimmed when hidden) with a per-region eye/eye-off toggle.
2. **Signature viewer + gallery** (wave 3) — `getResults` builds a `spatial` payload for signature (`kind:"signature"`, per-respondent `r2Key`); the Explore island renders a lazy paginated gallery + per-respondent view via the now-gated `/api/media/<r2Key>`. Results inline shows "N signatures captured — private to your workspace" + "View signatures →". The per-respondent export deep-link column auto-applies. **Answers the owner's signature questions:** the *issue* was the public gateway (fixed in v1.40.0); *how it's exported* = the raw `r2Key` cell **plus** the new gated deep-link column; *same deep link* = yes.
3. **Hot-spot region click actions** (waves 4-6, new **ADR-0043**) — `link` (https, new tab, also records), `advance` (records + submits via the real Continue so siblings still validate), `setValue` (key=value tag into the **answer payload**, not `response.metadata`). Default `record` unchanged.

## The security-relevant decisions (verified)

- **setValue tags are default-deny.** `validateAnswer` accepts a tag key only if a region declares it via a `setValue` action — a forged client tag can't drive `showIf` branching. The runtime re-validates server-side, so the hidden-input transport isn't trusted. Tested (declared key ok / undeclared 403-equivalent reject / non-object reject / absent ok).
- **`link` is open-redirect-safe.** `https`-only via a zod `.refine` in the config schema **and** a render-time `new URL().protocol === "https:"` recheck; `window.open(..., "noopener")`, participant-clicked, never auto-navigate; the URL is researcher config, not participant input. Tested (`http:`/`javascript:` rejected at config). Note recorded: end-redirect is **not** an https-only precedent (it allows `http:`); hot-spot `link` is deliberately stricter.
- **`advance` never bypasses validation.** The region button stays `type="button"` and calls `form.requestSubmit(continueBtn)` through the real Continue, so `recordScreenAnswers` validates every sibling block; the selected key is written to the hidden input's DOM value imperatively before submit so FormData carries it.
- **setValue does NOT use `response.metadata`** — that column doesn't exist (the embedded-data bug). Tags live in `response_item.answer.tags` (jsonb) — per-block, per-respondent, no migration.

## Verification

- **Unit (node):** **383 vitest green (45 files)**. New: `authorizeMediaKey` (7, v1.40.0); hot-spot `visible?` config (default/false/true + invisible still a valid target); hot-spot action union (each variant parses; `http:`/`javascript:` link rejected; tags default-deny: declared ok / undeclared reject / non-object reject / absent ok); getResults signature spatial shape (r2Key + PID per respondent); embedded-data persistence (clientMetadata.embedded). Pure geometry + dataset tests from the prior wave still green.
- **Static:** `tsc --noEmit`, `next lint`, `next build` all clean (exit-code-gated, no grep-pipe before any push). Manifest `validate.py` clean (130 instances; ADR-0043 + the wireframe amendments). Dashboard `dashboard-state` JSON validated to parse (per the new `validate-dashboard-json` rule — a malformation from the v1.39.0 edit was also fixed in v1.40.0).
- **Not exercised by the agent:** the interactive surfaces (Builder region drawing/action pickers; participant link/advance/setValue clicks; the signature gallery render; a real cross-workspace 403) are client/auth/data-gated; verified by tsc/build + the pure registry/getResults tests and shipped for the owner's live click-through (the established pattern). Recommended prod smokes: (a) a non-owning-workspace signature URL → 403; (b) an `advance` region with a required sibling → still blocks; (c) a `setValue` region → tag appears in the CSV.

## Gates (phase order respected)

- **Architecture:** ADR-0003 amendment (media auth, v1.40.0); ADR-0041 amendment-c (invisible regions); **new ADR-0043** (action-driven block interactions — introduced at the first action variant, per the review's correction of the over-gating); ADR-0042 amendment (the embedded-data column fix).
- **Design:** `hot-spot`, `hot-spot-region-editor`, `spatial-explore`, `signature` wireframes amended; IA Configure-row note. Tokens-only throughout (eye toggle, action picker, gallery compose existing v0.6 primitives).

## Carry-forwards / deferred

- **`advance` cross-block warning** — currently an inline "best as the only/last block" hint in the editor (RegionsEditor only sees its own block). A full preflight-style warning that inspects sibling required blocks is a possible later refinement.
- **Region action params commit on change** (link URL, setValue key/value) rather than on blur — consistent with the number-field's immediate-commit rationale; fine for short fields.
- **Pointer drag-move/resize of regions** and **per-region colors** remain deferred (arrow-key path is complete; geometry helpers support a later wiring-only change).
