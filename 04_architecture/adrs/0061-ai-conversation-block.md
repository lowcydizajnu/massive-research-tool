# ADR 0061 — AI conversation block — first AI feature

- **Status:** accepted
- **Date:** 2026-06-21
- **Deciders:** Project owner, Claude
- **Tags:** ai, blocks, runtime, privacy, cost-model, vendor-seam

## Context

> What is forcing this decision?

The owner wants a study where a participant answers a questionnaire, then **converses with an AI** (researcher-defined role + context), then answers more questions. This is the **first user-facing AI feature** — and it's an anticipated one: **ADR-0006** (accepted) built the AI substrate precisely for this ("conversational survey rendering (chatbot mode)" is named there) and committed the abstractions — **Tasks**, **`AIProviderAdapter`s**, schemas-first validation, per-invocation audit, per-tenant cost metering, privacy routing — while shipping zero AI features. The lock-in inventory carries the AI-providers row: substrate only in V1, `AIProviderAdapter` interface, all vendor SDK imports confined to `ai.<vendor>.ts`.

So the architecture is ready; this ADR pins the concrete first feature. The flow ("questions → chat → questions") needs **no new flow concept** — the block model is an ordered list (ADR-0012), so the conversation is simply a new **block** dropped between question blocks. What is genuinely new: a block whose "answer" is produced through a multi-turn, server-mediated LLM exchange, plus the first real `AIProviderAdapter` implementation (Anthropic/Claude) and a place to store the transcript. Constraints in play: the PII boundary (ADR-0014 — transcripts are participant-authored data), preregistration immutability (ADR-0004/0012 — but AI output is non-deterministic), and the vendor seam (ADR-0006/0007).

## Options considered

> ### Option A — A new `ai-chat` block + Anthropic `AIProviderAdapter` + per-turn runtime (chosen)
>
> - Add an `ai-chat` module (registry + Zod/JSON schema + Builder Configure) whose config is the AI's **role/persona + context** (described in text now; document upload via the existing media uploader later), an opening message, the **model** (researcher-picked: Opus 4.8 / Sonnet 4.6 / Haiku, default Sonnet), and a **turn cap**. At run time a `aiChat.turn` procedure loads the block config + the conversation so far, calls the `AIProviderAdapter` (Claude), and returns the assistant message; the **full transcript is saved as the block's `response_item.answer`**, so it exports like any field. Each invocation is audited + cost-metered per ADR-0006; the transcript is treated as participant PII (ADR-0014).
> - **Pros.** Realizes ADR-0006's substrate with one new module; reuses blocks/runtime/response storage/export wholesale; the "questions → chat → questions" flow is just block ordering; behind the `AIProviderAdapter` seam (swap providers / BYO-key / opt-out without feature-code change); turn cap bounds cost + duration.
> - **Cons.** Needs a provisioned Anthropic key (paid, per-message); AI output is non-deterministic (a preregistration wrinkle — stated below); a per-turn server endpoint + a participant chat UI to build; guardrails (the AI talks to participants) to design.
>
> ### Option B — Embed a third-party chatbot (iframe / external widget)
>
> - Drop an external chat widget into a block.
> - **Pros.** Least code.
> - **Cons.** No control over role/context as study config; transcript lands outside our data model (breaks export + the PII boundary); a new uncontrolled vendor/PII surface; can't meter/audit per ADR-0006. Rejected.
>
> ### Option C — Pre-scripted branching "chat" (no LLM)
>
> - Fake a conversation with researcher-authored canned turns + answer branching (ADR-0021).
> - **Pros.** Deterministic; no AI vendor; preregisters cleanly.
> - **Cons.** Not what's asked — no genuine open conversation; authoring every path is infeasible for open dialogue. Useful as a *separate* future block, not this one. Rejected for this feature.

## Decision

> A single, declarative sentence.

**We will ship the AI conversation as a new `ai-chat` block (Option A): a registry module configured with the AI's role + context, model, opening message, and turn cap; a server-mediated `aiChat.turn` runtime endpoint that calls Claude through a new Anthropic `AIProviderAdapter` (per ADR-0006); and the participant's transcript stored as that block's `response_item.answer` — audited, cost-metered, and treated as participant PII (ADR-0014), all behind the vendor seam so provider/model/opt-out are swappable.**

Reasoning: ADR-0006 already chose this shape; this is its first concrete tenant. Modeling it as a block means the entire rest of the stack — ordering, the Builder, the runtime spine, response storage, export — works unchanged, and "questions → chat → questions" is just three blocks in a row. The only authoritative new state is the transcript, which fits `response_item` exactly. Keeping the LLM call server-side (never a browser key) + behind `AIProviderAdapter` preserves the ADR-0006 controls (audit, metering, privacy routing) and lets a researcher later choose BYO-key or opt-out without touching the block.

### Credential model — BYO key (owner direction 2026-06-21)

The Anthropic key is **brought by the workspace**, not a global env var — the same UX as a recruitment-provider Personal Access Token (ADR-0047): a researcher pastes their key, we **validate it against Anthropic, encrypt it at rest (AES-256-GCM via `TOKEN_ENCRYPTION_KEY`), and store it per-workspace** (`ai_provider_connection`, mirroring `recruitment_provider_connection`). The list/status endpoint never returns the key (masked hint only). This realizes ADR-0006's BYO-key provider routing and means no owner-provisioned global key is required — each workspace pays for its own usage. The `AIProviderAdapter` receives the decrypted key per call; feature code never sees vendor types.

### Build slices (post-acceptance)

1. **Gate** (this ADR) + draft the `AIProviderAdapter` interface (`server/adapters/ai.ts`) — no key needed.
2. **BYO-key connection** (this slice): `ai_provider_connection` table + an `ai.connections` router (status / connect / disconnect) + the Anthropic adapter (`ai.anthropic.ts`, vendor calls confined here; `validateKey` + `chat` via the HTTP API) + a workspace-settings card to paste/validate/remove the key.
3. **`ai-chat` module** (registry: config schema = role, context, model, openingMessage, maxTurns; defaultConfig; Builder Configure UI).
3. **`ai-chat` module** (registry: config schema = role, context, model, openingMessage, maxTurns; defaultConfig; Builder Configure UI).
4. **Runtime**: `aiChat.turn` (rate-limited) + transcript persistence to `response_item` on completion; turn cap enforced server-side.
5. **Participant chat UI** in the take runtime; **export** the transcript column.
6. Audit + per-tenant cost metering rows (ADR-0006); a Builder note that the block is non-deterministic (preregistration).

## Consequences

> - **What becomes easier.** Conversational/interview studies; the AI substrate finally has a live tenant; future AI blocks (extraction, critique) follow the same module + adapter pattern.
> - **What becomes harder.** We now run real LLM spend per participant (turn cap + metering matter); a non-deterministic step inside an otherwise-reproducible study (preregistration must disclose it); guardrails + a moderation posture for participant-facing generation; transcripts enlarge the PII surface.
> - **What we are now committed to.** Server-side LLM calls only, behind `AIProviderAdapter` (no browser keys, no vendor types in feature code); transcripts as participant PII under ADR-0014 (aggregate/opt-in for sharing); audit + cost metering per ADR-0006; the conversation is a block, not a parallel system.
> - **What we are now precluded from (for now).** Browser-side / BYO-model-in-client calls; unbounded open-ended chats (turn cap required); using transcripts in public aggregates without E2 opt-in.

## Revisit triggers

> Conditions under which we reopen this.

- Per-participant AI cost exceeds a set budget → tighten caps / cheaper default model / BYO-key requirement.
- Researchers need **tools/function-calling or multi-step** conversations → adopt ADR-0006 Option C (agentic) on top of this substrate.
- A safety/moderation incident with participant-facing generation → add a moderation layer / provider.
- Demand for deterministic replay of conversations → record + replay transcripts, or a seeded/temperature-0 mode.

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0006 task-based AI architecture](0006-ai-plugin-architecture.md) (the substrate this realizes), [0007 path A vs B](0007-path-a-vs-b.md) (adapter seam), [0012 block format & autosave](0012-block-format-and-autosave-semantics.md) (blocks/ordering), [0014 response data model](0014-response-data-model-and-conditioning.md) (PII boundary), [0021 answer-based branching](0021-answer-based-branching.md), [0004 preregistration amendments](0004-preregistration-amendments.md) (non-determinism disclosure), [0001 schemas-first](0001-schemas-first.md).
- Lock-in: `04_architecture/lock-in-inventory.md` (AI providers row → first impl confines `@anthropic-ai/*` to `ai.anthropic.ts`).
- Code touchpoints: `server/adapters/ai.ts` + `ai.anthropic.ts` + `ai.stub.ts`; `server/modules/registry.ts` (`ai-chat`); `server/trpc/routers/*` (`aiChat.turn`) + `server/runtime/participant.ts` (transcript persistence); `components/feature/take/*` (participant chat UI); `components/feature/builder/configure-form.tsx` (role/context config); `lib/export/dataset.ts` (transcript column).
- Dependency: a provisioned `ANTHROPIC_API_KEY` (owner) before the live model works; model ids per the latest Claude family (default Sonnet 4.6; Opus 4.8 / Haiku selectable).
