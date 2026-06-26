# ADR 0066 — AI substrate — provider-adapter contract, invocation audit, and metering

- **Status:** accepted
- **Date:** 2026-06-25
- **Deciders:** Project owner, Claude
- **Tags:** ai, data-model, runtime, vendor-seam, cost-model, privacy

## Context

**ADR-0006** ("Task-based AI architecture with provider adapters", accepted) committed the AI *substrate* — a typed `AIProviderAdapter` seam, a per-invocation **audit log**, **per-tenant cost metering**, schemas-first validation, and privacy routing — while shipping zero AI features. **ADR-0061** then shipped the first feature (the `ai-chat` block) — but, under time pressure, on a **thin** slice of that substrate: the live `AIProviderAdapter` is only `validateKey(apiKey)` + `chat(input)` (`server/adapters/ai.ts`), there is **no `ai_invocation` table**, no cost metering, and no gateway. Every AI call today goes straight from feature code (`server/runtime/ai-chat.ts`) to the adapter with nothing recording that it happened.

V2.1 (Hume emotion AI — see `04_architecture/handoffs/code-tab-v210-hume-emotion-ai.md`) adds a **second AI vendor** with a different sensitivity profile (biometric voice = `pii`), **billing-relevant** usage (per-participant voice/TTS/conversation costs), four new block kinds, and an owner-locked **$50/mo workspace budget cap**. None of that is safe or maintainable on the thin path: there is nothing to meter spend against, nothing to enforce a cap with, no uniform place to enforce the PII boundary (ADR-0014), and no audit row to delete when a participant withdraws (ADR-0014 cascade). Continuing to bolt each feature directly onto the adapter would re-implement auth, metering, error handling, and withdraw per feature — debt that compounds with every AI surface.

The project owner directed (2026-06-25): build on high-quality code that allows constant flexibility to grow the product without constraints, with the best user experience. This ADR completes the substrate ADR-0006 designed, **before** any second-vendor feature lands. It is the first stream (H0) of the V2.1 plan and a prerequisite for H1–H8.

## Options considered

### Option A — Complete the ADR-0006 substrate now: widen the contract + add an invocation audit/metering gateway, and retrofit `ai-chat` onto it (chosen)

- Widen `AIProviderAdapter` into a typed, provider-agnostic op set — `validateKey`, `ping`, `chat`, and **optional** capability methods (`analyzeVoice`, `analyzeText`, `synthesizeAudio`, `startConversation`) so a text-only provider need not implement voice. Every op carries an `AIInvocationContext` (workspace/study/response/feature/sensitivity). Add a thin **gateway** that wraps adapter calls so each one (a) enforces the per-workspace `allow_pii_to_external_ai` flag before any vendor call, (b) enforces the workspace monthly budget cap, and (c) writes exactly one `ai_invocation` audit row (ok or error) with cost. Add `ai_invocation` (+ an R2-backed `ai_invocation_payload` sidecar for large outputs) and a `monthly_ai_budget_usd_cap` workspace setting. Retrofit the existing `ai-chat` turn engine to call through the gateway.
- **Pros.** Realizes ADR-0006 as designed; one uniform place for cost/audit/PII/withdraw across every current and future AI feature; adding a vendor or modality becomes a localized change; the cap + usage dashboard (V2.1 H8c) and the withdraw cascade (ADR-0014) get a real substrate; `ai-chat` stops being an un-audited one-off.
- **Cons.** ~1.5–2 weeks before any new user-visible feature; one migration; touches the live `ai-chat` path (must not regress it).

### Option B — Continue the thin path; add `ai_invocation` + metering ad hoc inside V2.1's Hume features

- Leave the adapter minimal; have each new Hume feature write its own audit/cost rows.
- **Pros.** No upfront substrate slice; features ship "sooner".
- **Cons.** Duplicated audit/cost/PII logic per feature; inconsistent enforcement (easy to forget the cap or the PII check on one path); `ai-chat` stays un-audited; exactly the compounding debt the owner asked to avoid. Rejected.

### Option C — Full agentic orchestration layer (ADR-0006 Option C — LangGraph/Pydantic-AI tasks, tool-calling, planning)

- Build the heavy multi-step task framework now.
- **Pros.** Maximum future power.
- **Cons.** Massive infrastructure for features we don't have; ADR-0006 explicitly defers this to V3+; layers cleanly on top of Option A later anyway. Rejected for now.

## Decision

**We will complete the ADR-0006 AI substrate before V2.1's vendor features (Option A): widen `AIProviderAdapter` into a typed op set with an `AIInvocationContext` and optional capability methods; route every AI call through a gateway that enforces the per-workspace PII flag and monthly budget cap and writes one `ai_invocation` audit row (with cost) per call; add the `ai_invocation` + `ai_invocation_payload` tables and a `monthly_ai_budget_usd_cap` workspace setting; and retrofit the existing `ai-chat` turn engine onto the gateway so no AI path is un-audited.**

In plain terms: today an AI call is a direct phone call with no record kept. We are putting a switchboard (the gateway) in front of every AI call. The switchboard checks the caller is allowed to send sensitive data, checks the workspace hasn't blown its monthly budget, places the call through the vendor adapter, and writes one line in a ledger (`ai_invocation`) noting who called, which model, how much it cost, and whether it worked. Because every feature — the existing chat and all the coming Hume features — dials through the same switchboard, cost control, the PII boundary, audit, and "delete everything on withdraw" are enforced once, in one place, instead of being re-coded (and occasionally forgotten) per feature.

## Consequences

- **What becomes easier.** Adding a vendor (Hume, OpenAI) or a modality is a localized adapter change; the gateway already gives it audit + cost + PII enforcement. The V2.1 budget cap, the usage dashboard, and the ADR-0014 withdraw cascade all read/extend one table. Debugging an AI feature means reading `ai_invocation`. Reproducibility/audit for research integrity is structural.
- **What becomes harder.** Every AI call must now supply an `AIInvocationContext` (sensitivity, workspace, etc.) — a small per-call cost that is the point (it's what makes the row meaningful). A feature cannot quietly bypass metering without bypassing the gateway, which code review forbids.
- **What we are now committed to.** A single AI gateway (`server/runtime/ai-gateway.ts`) as the only path from feature code to `ai.<vendor>`; the `ai_invocation` + `ai_invocation_payload` schema; per-workspace `allow_pii_to_external_ai` (default false) and `monthly_ai_budget_usd_cap` (nullable; existing workspaces uncapped); cost computed from a dated price table (`lib/ai-pricing.ts`) until vendors return authoritative usage.
- **What we are now precluded from.** Feature code calling `ai.<vendor>` (or a vendor SDK) directly — it must go through the gateway. Storing full emotion vectors / large transcripts inline in `ai_invocation` (they go to the R2-backed `ai_invocation_payload` sidecar to keep the audit table small).

## Amendment (2026-06-25) — emotion-analysis language selector (pulled forward from V2.2)

The original H3a scope deferred a multi-language picker to V2.2 (English-first; "language param exposed in adapter"). On owner request after the V2.1 deploy, the picker is pulled forward for **emotion analysis only**:

- The shared `emotionAnalysis` block config (free-text + audio-record) gains an optional `language` field — a BCP-47 tag from `lib/ai/hume-languages.ts`. Absent = Hume auto-detects (the default and recommended option).
- It threads `block config → hume.analyze job → gateway runEmotion → adapter analyzeText/analyzeVoice`, where it sets the batch request's top-level `transcription.language`. **Verified** against the Hume SDK v0.7.0 `Transcription` / `Bcp47Tag` types — the accepted set is the 29-language list in `hume-languages.ts` (Polish = `pl`); it applies to both the Language (text) and Prosody (voice) models. Invalid codes are dropped client-and-server-side, never sent.
- **Octave TTS (audio-stimulus) gets NO language selector**: `PostedUtterance` has no language param (verified — SDK `main`); Octave infers language from the script text. The audio-stimulus panel states this inline instead of offering a no-op control.

No migration (config is jsonb). Within this ADR's emotion-analysis concept; the adapter contract already reserved `language?`.

## Amendment (2026-06-25) — dedicated emotion-probe blocks (H3b/H4b)

Two new core blocks where **emotion is the measure, not a side-channel**: `core/voice-emotion-probe@1.0.0` and `core/text-emotion-probe@1.0.0`. They are **config-identical to `audio-record` / `free-text`** (defined by spreading those defs in `registry.ts`) but with `emotionAnalysis` **forced on** in `defaultConfig` (no opt-out). They reuse the entire H3a pipeline unchanged — enqueue (`participant.ts` keys off `emotionAnalysis.enabled`) → `hume.analyze` job → gateway `runEmotion` → Results emotion panel → CSV export columns — and reuse the base blocks' Take views (`AudioRecordInput` / `FreeTextInput`). Per the locked answer, the dedicated blocks coexist with the per-block emotion toggle (different researcher affordances). New block kinds → standard wireframe gate (4 specs) + `db:seed:prod`. No new pattern (ADR-0012 block model) and no new table.

**Honest scope correction vs the original handoff:** the handoff's "required emotion dimensions" and "show emotion scores to the participant" are dropped — Hume returns its full ~50-emotion taxonomy (you cannot request a subset) and Expression Measurement is async batch (no synchronous path), so inline participant-facing scores aren't feasible. Probes are researcher-facing; participants see only the base block's UI.

## Amendment (2026-06-25) — step-based emotion polling + Re-run affordance

**Bug.** Hume Expression Measurement is async **batch** (submit → poll → predictions). The first H3a job polled to completion (up to ~120s) inside ONE serverless invocation. With no `maxDuration` set, Vercel's default (~10–15s) killed it mid-poll; a hard kill runs no `catch`, so the item stayed `pending` forever (Inngest retries re-polled and died the same way). The deploy is **Vercel Hobby**, where `maxDuration` caps below the poll ceiling — so bumping the budget can't fix it.

**Fix — stepped polling.** The batch flow is split into adapter primitives (`startEmotionBatch` / `pollEmotionBatch` / `fetchEmotionBatch`) with matching gateway functions (`startEmotionJob` / `pollEmotionJob` / `finishEmotionJob` + `recordEmotionFailure`). The `hume.analyze` Inngest function now submits in one step, then polls across `step.sleep` + short poll steps — each invocation is brief and Hobby-safe; the waiting happens in Inngest, not a held-open function. Security: the decrypted key and the emotion result are never returned across step boundaries (each step re-derives the key; the result is written to the DB inside the finish step). The synchronous `analyzeText`/`analyzeVoice` (built on the same primitives) remain for tests/dev. Metering is unchanged — one `ai_invocation` row at finish (ok) or via `recordEmotionFailure`.

**Re-run affordance.** `studies.reanalyzeEmotion({ studyId })` re-queues a study's not-yet-`ok` emotion items (resets to `pending` + re-enqueues `hume.analyze`) so rows stuck by a transient error or the pre-fix timeout clear without resubmitting responses. Surfaced as a "Re-run emotion analysis (N)" button on Results (write-member gated), shown only when stuck items exist.

## Amendment (2026-06-26) — Hume Expression Measurement discontinued; emotion analysis paused

Hume **discontinued the Expression Measurement API** (batch + streaming) — last usable day 2026-06-14; it now returns `403 "The Expression Measurement API has been discontinued and is no longer available."` This is the backend H3a (free-text/audio-record toggle) and the H3b/H4b probe blocks were built on. It was real and verified against the SDK when built; the vendor retired the product. Octave TTS is a separate product and is unaffected (audio-stimulus + per-variant voice still work).

**Interim:** a one-line kill-switch `lib/ai/emotion-availability.ts → EMOTION_ANALYSIS_AVAILABLE=false`. The Builder emotion panel shows "paused" with the reason (no new enabling); the `hume.analyze` job fails fast with the reason (no dead API calls); the Results panel surfaces the reason. Nothing else is affected. Flip the flag to `true` in the same change that lands a working emotion provider.

**Re-platform options (owner decision pending):** (a) emotion via the AI substrate using an LLM (text works now; voice = transcript-only, loses prosody) — note an LLM score is not a validated psychometric, so it stays the "exploratory" measure the UI already labels; (b) a dedicated emotion vendor (esp. for voice/prosody); (c) Hume EVI's embedded expression (voice-conversation only — Hume's own migration path); (d) leave paused. The provider-agnostic gateway/adapter (this ADR) is exactly what keeps any of these a localized change.

### Resolution (2026-06-26) — text emotion re-platformed on Claude; voice archived

Owner chose (a) for text, leave voice paused. **Text emotion now runs on Claude (Anthropic)** via the substrate: a new `anthropicAdapter.analyzeText` prompts Claude to score the answer on **Plutchik's eight primary emotions** (stable, citable taxonomy) and returns the vector. It's **synchronous** (one call), so the `hume.analyze` job (event id kept stable to avoid an Inngest re-sync) dropped all the batch/step/poll machinery and just scores + writes — the Hume batch primitives + gateway start/poll/finish stay dormant for a future prosody provider. `EMOTION_ANALYSIS_AVAILABLE=true`. BYO Anthropic key per workspace (same connection as ai-chat). Sensitivity = participant_data; labelled exploratory + lexical in the UI (lightbulb help: setup + how to read the data).

**Voice/prosody emotion ARCHIVED** (no LLM substitute): `voice-emotion-probe` marked `archived` (registry flag → seed sets `deprecatedAt` → hidden from the picker; existing studies still resolve) and the audio-record emotion toggle removed. Kept in the registry for a future vocal-emotion provider. Requires `db:seed:prod` to deprecate the prod catalogue row.

## Revisit triggers

- We add a provider whose pricing isn't expressible as the current per-token/per-duration table (revisit the cost model).
- We need real-time streaming usage accounting (e.g. EVI per-second billing) finer than one row per invocation.
- Per-researcher (not just per-workspace) cost attribution is requested (V2.2+).
- We adopt a managed-AI model (we pay the vendor bill) — the metering becomes billing-grade and may need its own ledger.
- An agentic/multi-step task framework (ADR-0006 Option C) becomes real and wants to wrap the gateway.

## References

- ADR-0006 — Task-based AI architecture with provider adapters (the substrate this completes).
- ADR-0061 — AI conversation block (the first feature; its thin path is retrofitted here).
- ADR-0007 — Adopt Path A with migration-ready adapter discipline (vendor SDKs confined to `ai.<vendor>.ts`).
- ADR-0014 — Response data model + minimum viable conditioning (the PII boundary + withdraw cascade the gateway enforces/extends).
- ADR-0016 §6 — `TOKEN_ENCRYPTION_KEY` discipline (`server/crypto/tokens.ts`).
- ADR-0003 — Hybrid asset storage (R2 `resp/` for the `ai_invocation_payload` sidecar).
- Code: `server/adapters/ai.ts`, `ai.anthropic.ts`, `server/runtime/ai-chat.ts`, `server/trpc/routers/ai.ts`, `lib/ai-pricing.ts`, `server/db/schema.ts`.
- `04_architecture/handoffs/code-tab-v210-hume-emotion-ai.md` (Section H0) + `…-reconciliation.md`.
